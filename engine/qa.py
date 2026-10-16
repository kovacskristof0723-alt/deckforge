#!/usr/bin/env python3
"""
qa.py - machine QA gate for a built deck. Reads the .pptx as OOXML (stdlib
only, no python-pptx), so it checks what PowerPoint will actually open, not
what deck.js meant to write.

    python3 qa.py deck.pptx                      # layout + hygiene gate
    python3 qa.py deck.pptx --evidence ev.json   # + every number traced to a source
    python3 qa.py deck.pptx --out qa.json        # also write the JSON report

Exit 0 = passed (no errors), 1 = failed. `passed` is derived from the error
count, never from the agent's own judgement: a deck with errors is not
delivered, and an error is not waved through by declaring it "fine". If a
check is wrong, fix the check here and say why in a comment.

The gate replaces nothing in the render loop. It catches the mechanical
defects cheaply (overflow, off-canvas, stray fonts, [TK] left in, untraced
numbers) so the expensive PNG look is spent on design, not on typos.

Ideas adapted from two Apache-2.0 projects, rewritten for this engine:
likaku/Mck-ppt-design-skill (programmatic QA gate, pass derived from the
error count) and zairuilab/consulting-deck (evidence ledger, chart-cache
reconciliation). See ../NOTICE.
"""
import argparse
import json
import math
import os
import posixpath
import re
import sys
import zipfile
from xml.etree import ElementTree as ET

NS = {
    "p": "http://schemas.openxmlformats.org/presentationml/2006/main",
    "a": "http://schemas.openxmlformats.org/drawingml/2006/main",
    "c": "http://schemas.openxmlformats.org/drawingml/2006/chart",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
}
PR = "{http://schemas.openxmlformats.org/package/2006/relationships}Relationship"
EMU = 914400

FONT = "Avenir Next LT Pro"
MIN_BODY_PT = 11          # deck.js floor (kpiNote); below this only as footnote
MIN_ANY_PT = 10           # footnote size in deck.js; nothing goes smaller
FOOT_BAND_IN = 6.85       # y at/after which text is footer/source chrome
TITLE_BAND_IN = 1.45      # the rule under the action title
TITLE_MIN_PT = 24
TOL_IN = 0.02
PLACEHOLDER = re.compile(r"\[TK\]|\bTODO\b|\bTBD\b|lorem ipsum|\bXXX\b|\{\{|Click to add", re.I)

HERE = os.path.dirname(os.path.abspath(__file__))
METRICS = json.load(open(os.path.join(HERE, "metrics.json")))["fonts"]
LINE_SPACING = 1.28       # matches deck.js


# --------------------------------------------------------------------------
# package plumbing

def rels(z, owner):
    folder, name = posixpath.split(owner)
    path = posixpath.join(folder, "_rels", name + ".rels")
    if path not in z.namelist():
        return {}
    out = {}
    for r in ET.fromstring(z.read(path)).iter(PR):
        if r.get("TargetMode") == "External":
            continue
        t = r.get("Target")
        # pptxgenjs writes absolute targets ("/ppt/charts/chart1.xml"); joining
        # those naively misses the part and silently skips every chart check.
        out[r.get("Id")] = t.lstrip("/") if t.startswith("/") else posixpath.normpath(posixpath.join(folder, t))
    return out


def slide_parts(z):
    pres = "ppt/presentation.xml"
    rel = rels(z, pres)
    root = ET.fromstring(z.read(pres))
    sz = root.find("p:sldSz", NS)
    size = (int(sz.get("cx")) / EMU, int(sz.get("cy")) / EMU)
    ids = root.findall("p:sldIdLst/p:sldId", NS)
    return size, [rel[i.get("{%s}id" % NS["r"])] for i in ids]


def xfrm(el):
    x = el.find(".//a:xfrm", NS)
    if x is None:
        x = el.find(".//p:xfrm", NS)
    if x is None:
        return None
    off, ext = x.find("a:off", NS), x.find("a:ext", NS)
    if off is None or ext is None:
        return None
    bx, by, bw, bh = (int(v) / EMU for v in
                      (off.get("x"), off.get("y"), ext.get("cx"), ext.get("cy")))
    # Rotation spins around the box centre; a 90/270 turn swaps the footprint
    # (deck.js does this for matrix axis labels).
    rot = round(int(x.get("rot", "0")) / 60000) % 180
    if rot == 90:
        cx, cy = bx + bw / 2, by + bh / 2
        bx, by, bw, bh = cx - bh / 2, cy - bw / 2, bh, bw
    return bx, by, bw, bh


# --------------------------------------------------------------------------
# text measurement (Montserrat metrics: wider than Avenir, errs toward fitting)

def char_w(ch, bold):
    table = METRICS["bold" if bold else "regular"]
    return table.get(ch, table.get("n", 0.0085))


def est_lines(text, pt, width_in, bold):
    if width_in <= 0:
        return 99
    lines = 0
    for para in text.split("\n"):
        words, cur = para.split(" "), 0.0
        n = 1
        space = char_w(" ", bold) * pt
        for w in words:
            ww = sum(char_w(c, bold) for c in w) * pt
            if cur == 0:
                cur = ww
            elif cur + space + ww <= width_in:
                cur += space + ww
            else:
                n += 1
                cur = ww
        lines += n
    return lines


def paragraphs(txbody):
    """[(text, max_pt, bold, font_faces, line_spacing)] per a:p."""
    out = []
    for p in txbody.findall("a:p", NS):
        runs = p.findall("a:r", NS) + p.findall("a:fld", NS)
        text = "".join((r.findtext("a:t", "", NS) or "") for r in runs)
        sizes, bold, faces = [], False, set()
        for r in runs:
            rpr = r.find("a:rPr", NS)
            if rpr is None:
                continue
            if rpr.get("sz"):
                sizes.append(int(rpr.get("sz")) / 100)
            bold = bold or rpr.get("b") == "1"
            lat = rpr.find("a:latin", NS)
            if lat is not None and lat.get("typeface"):
                faces.add(lat.get("typeface"))
        ls = LINE_SPACING
        pct = p.find("a:pPr/a:lnSpc/a:spcPct", NS)
        if pct is not None:
            ls = max(1.0, int(pct.get("val")) / 100000 * 1.2)
        out.append((text, max(sizes) if sizes else 18.0, bold, faces, ls))
    return out


def insets(txbody):
    bp = txbody.find("a:bodyPr", NS)
    d = {"lIns": 91440, "rIns": 91440, "tIns": 45720, "bIns": 45720}
    if bp is not None:
        for k in d:
            if bp.get(k) is not None:
                d[k] = int(bp.get(k))
    return {k: v / EMU for k, v in d.items()}


# --------------------------------------------------------------------------
# numbers (for evidence tracing)

NUM = re.compile(r"(?<![\w.])[-−+]?\d{1,3}(?:[,\s]\d{3})+(?:\.\d+)?|(?<![\w.])[-−+]?\d+(?:\.\d+)?")


MONTH = re.compile(r"\s(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\b")


def numbers_in(text):
    """Material numbers in a string: value + whether it carried a unit/%."""
    out = []
    for m in NUM.finditer(text):
        raw = m.group(0)
        v = raw.replace("−", "-").replace(",", "").replace(" ", "")
        try:
            val = float(v)
        except ValueError:
            continue
        tail = text[m.end():m.end() + 2]
        if MONTH.match(text[m.end():]):   # "29 July 2026" is a date, not a claim
            continue
        unitish = bool(re.match(r"\s?(%|pp|x|×|[kKmMbB]\b|bn|mn)", tail)) or "." in v
        # Step numbers, list indices and bare years are not claims.
        if not unitish and val.is_integer() and (0 <= val <= 10 or 1900 <= val <= 2100):
            continue
        out.append((raw, val))
    return out


def matches(val, ledger_vals):
    for lv in ledger_vals:
        if lv == 0:
            if abs(val) < 1e-9:
                return True
            continue
        # a displayed figure is a rounding of the ledger one, never a new number
        if abs(val - lv) <= max(abs(lv) * 0.005, 0.051) or round(lv) == val:
            return True
    return False


# --------------------------------------------------------------------------

class Gate:
    def __init__(self, path, evidence=None):
        self.path = path
        self.issues = []
        self.titles = []
        self.shapes_sig = []
        self.has_title = False
        self.numbers = []           # (slide, raw, val, where)
        self.evidence = evidence

    def add(self, sev, slide, cat, msg):
        self.issues.append({"severity": sev, "slide": slide, "category": cat, "message": msg})

    def run(self):
        z = zipfile.ZipFile(self.path)
        (W, H), parts = slide_parts(z)
        for n, part in enumerate(parts, 1):
            self.check_slide(z, n, part, W, H)
        self.check_deck(len(parts))
        if self.evidence is not None:
            self.check_evidence()
        return self.report(len(parts))

    # ---------------------------------------------------------------- slide
    def check_slide(self, z, n, part, W, H):
        root = ET.fromstring(z.read(part))
        rel = rels(z, part)
        tree = root.find("p:cSld/p:spTree", NS)
        texts, charts, tables = [], 0, 0
        self.pending_small = []
        has_source = False
        has_takeaway = False
        title = None

        for el in tree.iter():
            tag = el.tag.split("}")[1]
            if tag not in ("sp", "graphicFrame", "pic", "cxnSp"):
                continue
            box = xfrm(el)
            if box is None:
                continue
            x, y, w, h = box
            if x < -TOL_IN or y < -TOL_IN or x + w > W + TOL_IN or y + h > H + TOL_IN:
                self.add("error", n, "off_canvas",
                         f"{tag} at ({x:.2f},{y:.2f}) {w:.2f}x{h:.2f}in leaves the {W:.2f}x{H:.2f} slide")

            if tag == "graphicFrame":
                gd = el.find(".//a:graphicData", NS)
                uri = gd.get("uri", "") if gd is not None else ""
                if uri.endswith("/chart"):
                    charts += 1
                    c = gd.find("c:chart", NS)
                    target = rel.get(c.get("{%s}id" % NS["r"])) if c is not None else None
                    if target and target in z.namelist():
                        self.check_chart(z, n, target)
                elif uri.endswith("/table"):
                    tables += 1
                    for tc in el.iter("{%s}tc" % NS["a"]):
                        tb = tc.find("a:txBody", NS)
                        if tb is not None:
                            self.check_text(n, tb, None, where="table")
                continue

            tb = el.find("p:txBody", NS)
            if tb is None:
                continue
            paras = paragraphs(tb)
            full = "\n".join(p[0] for p in paras).strip()
            if not full:
                continue
            texts.append((box, full))
            if full.startswith("Source:"):
                has_source = True
            if full.startswith("Takeaway:"):
                has_takeaway = True
            if y < TITLE_BAND_IN and paras and max(p[1] for p in paras) >= TITLE_MIN_PT and title is None:
                title = (full, box, paras)
            self.check_text(n, tb, box, where="text", full=full, paras=paras)

        self.titles.append(title[0] if title else "")
        if title:  # covers and dividers carry small meta lines by design
            for msg in self.pending_small:
                self.add("warning", n, "font_size", msg)
        self.shapes_sig.append((charts, tables, min(len(texts), 12)))

        if title:
            full, (x, y, w, h), paras = title
            lines = sum(est_lines(t, pt, w, True) for t, pt, _, _, _ in paras)
            if lines > 2:
                self.add("error", n, "title_wrap", f"action title runs ~{lines} lines (max 2): cut words")
            words = len(full.split())
            if words < 5 and not re.search(r"\d", full):
                self.add("warning", n, "label_title",
                         f"title '{full}' reads as a label, not a takeaway")

        # House rule: every content slide states its
        # takeaway in the coloured band. deck.js draws it from `takeaway:`.
        if title and not has_takeaway:
            self.add("error", n, "missing_takeaway", "content slide has no takeaway band")

        if charts and not has_source:
            self.add("error", n, "missing_source", "chart slide has no 'Source:' line")
        elif not has_source and n > 1:
            body_nums = [t for (bx, t) in texts
                         if bx[1] >= TITLE_BAND_IN and bx[1] < FOOT_BAND_IN and numbers_in(t)]
            if body_nums:
                self.add("warning", n, "missing_source", "slide shows figures but has no 'Source:' line")

        # text-on-text collisions (a filled panel under text is by design)
        for i in range(len(texts)):
            for j in range(i + 1, len(texts)):
                a, b = texts[i][0], texts[j][0]
                ox = min(a[0] + a[2], b[0] + b[2]) - max(a[0], b[0])
                oy = min(a[1] + a[3], b[1] + b[3]) - max(a[1], b[1])
                if ox > 0.05 and oy > 0.05:
                    small = min(a[2] * a[3], b[2] * b[3]) or 1
                    if ox * oy / small > 0.15:
                        self.add("error", n, "text_collision",
                                 f"'{texts[i][1][:30]}' overlaps '{texts[j][1][:30]}'")

    def check_text(self, n, tb, box, where, full=None, paras=None):
        paras = paras or paragraphs(tb)
        full = full if full is not None else "\n".join(p[0] for p in paras).strip()
        if not full:
            return
        if PLACEHOLDER.search(full):
            self.add("error", n, "placeholder", f"unfinished text left in: '{full[:60]}'")
        in_foot = box is not None and box[1] >= FOOT_BAND_IN
        for text, pt, bold, faces, _ in paras:
            if not text.strip():
                continue
            bad = [f for f in faces if f != FONT]
            if bad:
                self.add("error", n, "font_face", f"'{text[:30]}' set in {bad[0]}, not {FONT}")
            if pt < MIN_ANY_PT:
                self.add("error", n, "font_size", f"{pt:g}pt text '{text[:30]}' (floor {MIN_ANY_PT}pt)")
            elif pt < MIN_BODY_PT and not in_foot and where != "table":
                self.pending_small.append(f"{pt:g}pt body text '{text[:30]}' is small for projection")
        for raw, val in numbers_in(full) if not (box and box[1] >= 6.9 and full.isdigit()) else []:
            if full.startswith("Source:") or (box is not None and box[1] >= FOOT_BAND_IN):
                continue
            self.numbers.append((n, raw, val, full[:50]))

        if box is None:
            return
        x, y, w, h = box
        ins = insets(tb)
        inner_w = w - ins["lIns"] - ins["rIns"]
        need = sum(est_lines(t, pt, inner_w, b) * pt * ls / 72
                   for t, pt, b, _, ls in paras if t.strip()) + ins["tIns"] + ins["bIns"]
        if need > h * 1.25 and need - h > 0.12:
            self.add("error", n, "text_overflow",
                     f"'{full[:40]}' needs ~{need:.2f}in, box is {h:.2f}in")
        elif need > h * 1.08 and need - h > 0.08:
            self.add("warning", n, "text_overflow",
                     f"'{full[:40]}' is tight: ~{need:.2f}in in a {h:.2f}in box (confirm in render)")

    def check_chart(self, z, n, part):
        root = ET.fromstring(z.read(part))
        plot = root.find(".//c:plotArea", NS)
        if plot is None:
            return
        for kind in plot:
            k = kind.tag.split("}")[1]
            if not k.endswith("Chart"):
                continue
            for ser in kind.findall("c:ser", NS):
                vals = [pt.findtext("c:v", "", NS) for pt in ser.findall("c:val//c:pt", NS)]
                cnt = ser.find("c:val//c:ptCount", NS)
                expected = int(cnt.get("val")) if cnt is not None else len(vals)
                if not vals or len(vals) < expected:
                    self.add("error", n, "chart_data", f"{k}: series has {len(vals)}/{expected} cached values")
                nums = []
                for v in vals:
                    try:
                        f = float(v)
                        if math.isnan(f):
                            raise ValueError
                        nums.append(f)
                    except ValueError:
                        self.add("error", n, "chart_data", f"{k}: non-numeric cached value '{v}'")
                for f in nums:
                    self.numbers.append((n, f"{f:g}", f, f"chart {k}"))
                if k in ("doughnutChart", "pieChart"):
                    if len(nums) > 4:
                        self.add("warning", n, "chart_form", f"{k} with {len(nums)} slices (max 4): use a bar")
                    s = sum(nums)
                    if 95 <= s <= 105 and abs(s - 100) > 1.5:
                        self.add("error", n, "chart_arith", f"{k} shares sum to {s:g}, not 100")

    # ----------------------------------------------------------------- deck
    def check_deck(self, count):
        run = 1
        for i in range(1, len(self.shapes_sig)):
            same = self.shapes_sig[i] == self.shapes_sig[i - 1] and any(self.shapes_sig[i][:2])
            run = run + 1 if same else 1
            if run == 3:
                self.add("warning", i + 1, "rhythm",
                         f"slides {i - 1}-{i + 1} share one silhouette: vary the archetype")
        seen = {}
        for i, t in enumerate(self.titles, 1):
            key = t.lower().strip()
            if key and key in seen:
                self.add("error", i, "duplicate_title", f"same title as slide {seen[key]}")
            seen.setdefault(key, i)

    def check_evidence(self):
        ledger = self.evidence
        vals = []
        for e in ledger:
            eid = e.get("id", "?")
            if not e.get("source") or not e.get("locator"):
                self.add("error", 0, "evidence_ledger", f"{eid}: needs both source and locator (page/table/URL)")
            v = e.get("values", e.get("value"))
            vals += [float(x) for x in (v if isinstance(v, list) else [v]) if x is not None]
        for n, raw, val, where in self.numbers:
            if not matches(val, vals):
                self.add("error", n, "untraced_number", f"{raw} ({where}) is in no evidence entry")

    # --------------------------------------------------------------- report
    def report(self, count):
        errors = [i for i in self.issues if i["severity"] == "error"]
        warns = [i for i in self.issues if i["severity"] == "warning"]
        return {
            "pptx": self.path,
            "slides": count,
            "passed": not errors,
            "errors": len(errors),
            "warnings": len(warns),
            "evidence_checked": self.evidence is not None,
            "storyline": self.titles,
            "issues": self.issues,
        }


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("pptx")
    ap.add_argument("--evidence", help="evidence.json ledger (see references/evidence.md)")
    ap.add_argument("--out", help="write the JSON report here")
    a = ap.parse_args()

    ev = json.load(open(a.evidence)) if a.evidence else None
    rep = Gate(a.pptx, ev).run()
    if a.out:
        json.dump(rep, open(a.out, "w"), indent=2, ensure_ascii=False)

    print("STORYLINE (titles alone must carry the argument):")
    for i, t in enumerate(rep["storyline"], 1):
        print(f"  {i:>2}  {t or '-'}")
    print()
    for i in rep["issues"]:
        where = f"s{i['slide']}" if i["slide"] else "ledger"
        print(f"  {i['severity'].upper():7} {where:>6}  {i['category']:16} {i['message']}")
    print(f"\n{'PASS' if rep['passed'] else 'FAIL'}: {rep['errors']} errors, {rep['warnings']} warnings"
          + ("" if rep["evidence_checked"] else " (numbers not traced: no --evidence)"))
    sys.exit(0 if rep["passed"] else 1)


if __name__ == "__main__":
    main()
