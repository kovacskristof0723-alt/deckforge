#!/usr/bin/env python3
"""deckforge-web: a small hosted front end for the deckforge harness (2026-10-09).

Friends upload a brief + source, Opus writes the storyline, they approve (or ask
for a new one with feedback), then the cheap model builds the pptx. Runs behind
the session-login gateway (Caddy forward_auth), binds to 127.0.0.1 only.

Guards: one run at a time (the VPS has 1 vCPU), a daily OpenRouter spend cap,
upload size limit, job ids validated, files served only from inside a job dir.
Stdlib only.
"""
import email.parser
import email.policy
import html
import http.server
import json
import os
import re
import subprocess
import sys
import time
import urllib.parse
from datetime import date

PORT = int(os.environ.get("PORT", "3490"))
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FORGE = os.path.join(ROOT, "deckforge", "forge.py")
JOBS = os.environ.get("DECKFORGE_JOBS", os.path.join(ROOT, "jobs"))
DAILY_CAP = float(os.environ.get("DAILY_CAP_USD", "3"))
MAX_UPLOAD = 25 * 1024 * 1024
JOB_RE = re.compile(r"^[0-9]{8}-[0-9]{6}-[a-z0-9]{4}$")

CSS = """body{font-family:system-ui,-apple-system,sans-serif;max-width:860px;margin:0 auto;padding:20px 16px;color:#1d2433;background:#fafbfc}
h1{font-size:24px;margin:8px 0 4px}h2{font-size:18px;margin:22px 0 8px}p.sub{color:#5b6475;margin:0 0 18px}
label{display:block;font-weight:600;margin:14px 0 6px}textarea,input[type=text]{width:100%;box-sizing:border-box;padding:10px;border:1px solid #ccd3dd;border-radius:8px;font:inherit;background:#fff}
textarea{min-height:120px}input[type=file]{font:inherit}button{margin-top:16px;padding:11px 18px;border:0;border-radius:8px;background:#1f3a5f;color:#fff;font-weight:600;font-size:15px;cursor:pointer}
button.alt{background:#fff;color:#1f3a5f;border:1px solid #1f3a5f}.box{background:#fff;border:1px solid #e3e7ee;border-radius:10px;padding:14px 16px;margin:12px 0}
.muted{color:#6b7385;font-size:14px}pre{white-space:pre-wrap;font-size:12.5px;background:#f2f4f7;padding:10px;border-radius:8px;max-height:280px;overflow:auto}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:10px}.grid img{width:100%;border:1px solid #e3e7ee;border-radius:6px}
table{border-collapse:collapse;width:100%}td,th{text-align:left;padding:7px 6px;border-bottom:1px solid #eceff3;font-size:14px}a{color:#1f3a5f}
.st{display:inline-block;padding:2px 8px;border-radius:10px;font-size:12px;background:#eef1f5}.warn{color:#b3261e;font-weight:600}"""


def page(title, body, refresh=False):
    meta = '<meta http-equiv="refresh" content="10">' if refresh else ""
    return (f"<!doctype html><html><head><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'>{meta}"
            f"<title>{html.escape(title)}</title><style>{CSS}</style></head><body>{body}</body></html>").encode()


def jdir(jid):
    return os.path.join(JOBS, jid)


def load(jid):
    try:
        return json.load(open(os.path.join(jdir(jid), "job.json")))
    except Exception:
        return None


def save(job):
    json.dump(job, open(os.path.join(jdir(job["id"]), "job.json"), "w"), indent=1, ensure_ascii=False)


def alive(pid):
    # children of this server become zombies when they exit: reap first, then probe
    try:
        done, _ = os.waitpid(int(pid), os.WNOHANG)
        if done:
            return False
    except ChildProcessError:
        pass  # not our child (e.g. after a server restart)
    except Exception:
        return False
    try:
        os.kill(int(pid), 0)
    except Exception:
        return False
    try:  # a zombie that belongs to someone else still answers kill(0): check /proc state
        return open(f"/proc/{int(pid)}/stat").read().split(")")[-1].split()[0] != "Z"
    except Exception:
        return False


def jobs():
    out = []
    for d in sorted(os.listdir(JOBS), reverse=True):
        if JOB_RE.match(d) and (j := load(d)):
            out.append(refresh_state(j))
    return out


def refresh_state(j):
    """running -> ready/done/failed once the process has exited."""
    if j.get("pid") and not alive(j["pid"]):
        log = open(os.path.join(jdir(j["id"]), f"{j['stage']}.log"), errors="replace").read() if os.path.exists(os.path.join(jdir(j["id"]), f"{j['stage']}.log")) else ""
        m = re.findall(r"^DONE (\{.*\})$", log, re.M)
        if m:
            cost = json.loads(m[-1]).get("cost_usd", 0)
            j.setdefault("costs", {})[j["stage"] + str(j.get("round", 0))] = cost
            j["state"] = "storyline_ready" if j["stage"] == "storyline" else "done"
        else:
            j["state"] = "failed"
        j["pid"] = None
        save(j)
    return j


def spent_today():
    today = date.today().strftime("%Y%m%d")
    return sum(sum((j.get("costs") or {}).values()) for j in jobs() if j["id"].startswith(today))


def busy():
    return any(j.get("pid") for j in jobs())


def start(j, stage):
    d = jdir(j["id"])
    cmd = ["python3", FORGE, "--brief", open(os.path.join(d, "brief.txt")).read(), "--out", os.path.join(d, "out")]
    if j.get("source"):
        cmd += ["--source", os.path.join(d, j["source"])]
    if j.get("brand"):
        cmd += ["--brand", j["brand"]]
    if os.path.exists(os.path.join(d, "extra.txt")) and open(os.path.join(d, "extra.txt")).read().strip():
        cmd += ["--system", os.path.join(d, "extra.txt")]
    cmd += ["--approve"] if stage == "storyline" else ["--storyline", os.path.join(d, "out", "storyline.json")]
    logf = open(os.path.join(d, f"{stage}.log"), "w")
    p = subprocess.Popen(cmd, stdout=logf, stderr=subprocess.STDOUT, cwd=d, start_new_session=True)
    j.update(pid=p.pid, stage=stage, state=f"{stage}_running", round=j.get("round", 0) + (1 if stage == "storyline" else 0))
    save(j)


def md_html(md):
    out = []
    for line in md.splitlines():
        e = html.escape(line)
        e = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", e)
        if line.startswith("# "):
            out.append(f"<h2>{e[2:]}</h2>")
        elif line.startswith("## "):
            out.append(f"<h3>{e[3:]}</h3>")
        elif line.startswith("   - "):
            out.append(f"<div class=muted style='margin:0 0 6px 22px'>{e[5:]}</div>")
        elif line.strip():
            out.append(f"<div style='margin:3px 0'>{e}</div>")
    return "\n".join(out)


def docx_text(path):
    r = subprocess.run([sys.executable, "-c",
                        "import sys,docx;d=docx.Document(sys.argv[1]);print('\\n'.join(p.text for p in d.paragraphs));"
                        "[print(' | '.join(c.text for c in r.cells)) for t in d.tables for r in t.rows]", path],
                       capture_output=True, text=True, timeout=60)
    return r.stdout


class H(http.server.BaseHTTPRequestHandler):
    def send(self, code, body, ctype="text/html; charset=utf-8", extra=()):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        for k, v in extra:
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body)

    def redirect(self, loc):
        self.send_response(303)
        self.send_header("Location", loc)
        self.send_header("Content-Length", "0")
        self.end_headers()

    def log_message(self, *a):
        pass

    # ---- pages -------------------------------------------------------------
    def home(self, msg=""):
        rows = "".join(f"<tr><td><a href='/job/{j['id']}'>{html.escape(j.get('title') or j['id'])}</a></td>"
                       f"<td><span class=st>{j['state']}</span></td><td>${sum((j.get('costs') or {}).values()):.2f}</td></tr>"
                       for j in jobs()[:15])
        spent = spent_today()
        body = f"""<h1>Deckforge</h1><p class=sub>Brief + forrás → Opus storyline → jóváhagyás → consulting pptx appendixszel.
        Egyszerre egy futás, napi keret ${DAILY_CAP:.0f} (ma eddig ${spent:.2f}).</p>{f'<p class=warn>{html.escape(msg)}</p>' if msg else ''}
        <form class=box method=post action=/new enctype=multipart/form-data>
        <label>Cím (csak a listához)</label><input type=text name=title placeholder="pl. Wizz Air Q1 case">
        <label>Brief: mi a kérdés, kinek szól, milyen hosszú legyen?</label>
        <textarea name=brief required placeholder="pl. Egyetemi case prezentáció, 15 perc. Kérdés: mi a Wizz Air tartós versenyelőnyének titka? Közönség: tanár és évfolyam."></textarea>
        <label>Forrásanyag (PDF, DOCX, TXT vagy MD; a deck csak ebből és a briefből dolgozik)</label><input type=file name=source accept=".pdf,.docx,.txt,.md">
        <label>Márkaszín hex (opcionális, pl. C6007E)</label><input type=text name=brand maxlength=7>
        <label>Extra utasítás a modellnek (opcionális)</label><textarea name=extra style="min-height:70px" placeholder="pl. RBV-nyelvezet, max 12 fő slide, legyen benne SWOT"></textarea>
        <button>Storyline generálása</button><div class=muted style="margin-top:8px">A storyline kb. 3-5 perc (Opus), a deck kb. 8-12 perc.</div></form>
        <h2>Futások</h2><table><tr><th>Deck</th><th>Állapot</th><th>Költség</th></tr>{rows or '<tr><td colspan=3 class=muted>Még nincs futás.</td></tr>'}</table>"""
        self.send(200, page("Deckforge", body))

    def job(self, jid):
        j = load(jid)
        if not j:
            return self.send(404, page("Nincs ilyen", "<p>Nincs ilyen futás. <a href='/'>Vissza</a></p>"))
        j = refresh_state(j)
        d, st = jdir(jid), j["state"]
        parts = [f"<p><a href='/'>← Vissza</a></p><h1>{html.escape(j.get('title') or jid)}</h1>"
                 f"<p class=sub>Állapot: <span class=st>{st}</span> · költség eddig ${sum((j.get('costs') or {}).values()):.2f}</p>"]
        running = st.endswith("_running")
        if running:
            parts.append("<div class=box>Fut... az oldal 10 másodpercenként frissül.</div>")
        sm = os.path.join(d, "out", "storyline.md")
        if os.path.exists(sm) and st in ("storyline_ready", "build_running", "done"):
            parts.append(f"<div class=box>{md_html(open(sm).read())}</div>")
        if st == "storyline_ready":
            parts.append(f"""<form method=post action='/job/{jid}/approve'><button>Jóváhagyom, építsd meg a decket</button></form>
            <form class=box method=post action='/job/{jid}/redo'><label>Nem jó? Írd le, mit változtasson, és újragenerálja:</label>
            <textarea name=feedback required></textarea><button class=alt>Új storyline</button></form>""")
        if st == "done":
            parts.append(f"<p><a href='/job/{jid}/file/out/deck.pptx'><button>Letöltés: deck.pptx</button></a></p>")
            fin = os.path.join(d, "out", "final")
            if os.path.isdir(fin):
                imgs = sorted((f for f in os.listdir(fin) if f.endswith(".png")), key=lambda f: int(re.findall(r"\d+", f)[0]))
                parts.append("<div class=grid>" + "".join(f"<img loading=lazy src='/job/{jid}/file/out/final/{f}'>" for f in imgs) + "</div>")
        if st == "failed":
            parts.append("<p class=warn>A futás elakadt. A log vége lent; próbáld újra, vagy szólj Kristófnak.</p>")
        log = os.path.join(d, f"{j.get('stage', 'storyline')}.log")
        if os.path.exists(log):
            parts.append(f"<h2>Napló</h2><pre>{html.escape(open(log, errors='replace').read()[-6000:])}</pre>")
        self.send(200, page(j.get("title") or jid, "".join(parts), refresh=running))

    # ---- routing -----------------------------------------------------------
    def do_GET(self):
        path = urllib.parse.urlparse(self.path).path
        if path == "/":
            return self.home()
        m = re.match(r"^/job/([^/]+)$", path)
        if m and JOB_RE.match(m.group(1)):
            return self.job(m.group(1))
        m = re.match(r"^/job/([^/]+)/file/(out/[A-Za-z0-9_./-]+)$", path)
        if m and JOB_RE.match(m.group(1)) and ".." not in m.group(2):
            f = os.path.realpath(os.path.join(jdir(m.group(1)), m.group(2)))
            if f.startswith(os.path.realpath(jdir(m.group(1))) + "/") and os.path.isfile(f):
                ctype = "image/png" if f.endswith(".png") else "application/vnd.openxmlformats-officedocument.presentationml.presentation"
                extra = [("Content-Disposition", f'attachment; filename="{(load(m.group(1)) or {}).get("slug", "deck")}.pptx"')] if f.endswith(".pptx") else []
                return self.send(200, open(f, "rb").read(), ctype, extra)
        self.send(404, page("404", "<p>Nincs ilyen oldal. <a href='/'>Vissza</a></p>"))

    def do_POST(self):
        path = urllib.parse.urlparse(self.path).path
        n = int(self.headers.get("Content-Length") or 0)
        if n > MAX_UPLOAD:
            return self.send(413, page("Túl nagy", "<p>Max 25 MB. <a href='/'>Vissza</a></p>"))
        raw = self.rfile.read(n)
        if path == "/new":
            return self.new(raw)
        m = re.match(r"^/job/([^/]+)/(approve|redo)$", path)
        if m and JOB_RE.match(m.group(1)) and (j := load(m.group(1))):
            j = refresh_state(j)
            if busy():
                return self.home("Épp fut egy másik deck, próbáld pár perc múlva.")
            if spent_today() >= DAILY_CAP:
                return self.home(f"Elérte a napi ${DAILY_CAP:.0f} keretet, holnap újra lehet.")
            if m.group(2) == "approve" and j["state"] == "storyline_ready":
                start(j, "build")
            elif m.group(2) == "redo" and j["state"] in ("storyline_ready", "failed"):
                fb = urllib.parse.parse_qs(raw.decode())["feedback"][0][:3000]
                with open(os.path.join(jdir(j["id"]), "extra.txt"), "a") as f:
                    f.write(f"\n\nFEEDBACK ON THE PREVIOUS STORYLINE (round {j.get('round', 1)}), apply it:\n{fb}\n")
                start(j, "storyline")
            return self.redirect(f"/job/{j['id']}")
        self.send(404, page("404", "<p>Nincs ilyen. <a href='/'>Vissza</a></p>"))

    def new(self, raw):
        if busy():
            return self.home("Épp fut egy másik deck, próbáld pár perc múlva.")
        if spent_today() >= DAILY_CAP:
            return self.home(f"Elérte a napi ${DAILY_CAP:.0f} keretet, holnap újra lehet.")
        msg = email.parser.BytesParser(policy=email.policy.default).parsebytes(
            b"Content-Type: " + self.headers["Content-Type"].encode() + b"\r\n\r\n" + raw)
        fields, upload = {}, None
        for part in msg.iter_parts():
            name = part.get_param("name", header="content-disposition")
            if part.get_filename():
                upload = (part.get_filename(), part.get_payload(decode=True))
            elif name:
                fields[name] = part.get_content().strip()
        if not fields.get("brief"):
            return self.home("A brief kötelező.")
        jid = time.strftime("%Y%m%d-%H%M%S-") + os.urandom(2).hex()
        d = jdir(jid)
        os.makedirs(os.path.join(d, "out"))
        open(os.path.join(d, "brief.txt"), "w").write(fields["brief"][:8000])
        open(os.path.join(d, "extra.txt"), "w").write(fields.get("extra", "")[:4000])
        title = fields.get("title", "")[:80] or fields["brief"][:60]
        job = {"id": jid, "title": title, "slug": re.sub(r"[^A-Za-z0-9]+", "_", title)[:40] or "deck", "created": time.time(),
               "state": "new", "costs": {}}
        brand = fields.get("brand", "").lstrip("#")
        if re.fullmatch(r"[0-9A-Fa-f]{6}", brand):
            job["brand"] = brand.upper()
        if upload and upload[1]:
            ext = os.path.splitext(upload[0])[1].lower()
            if ext == ".pdf":
                open(os.path.join(d, "source.pdf"), "wb").write(upload[1]); job["source"] = "source.pdf"
            elif ext == ".docx":
                open(os.path.join(d, "source.docx"), "wb").write(upload[1])
                open(os.path.join(d, "source.txt"), "w").write(docx_text(os.path.join(d, "source.docx"))); job["source"] = "source.txt"
            elif ext in (".txt", ".md"):
                open(os.path.join(d, "source.txt"), "wb").write(upload[1]); job["source"] = "source.txt"
        save(job)
        start(job, "storyline")
        self.redirect(f"/job/{jid}")


if __name__ == "__main__":
    os.makedirs(JOBS, exist_ok=True)
    http.server.ThreadingHTTPServer(("127.0.0.1", PORT), H).serve_forever()
