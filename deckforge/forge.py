#!/usr/bin/env python3
"""deckforge: a slide-deck harness. Brief (+ optional source document) -> consulting pptx.

Built in October 2026 to test the claim that a good deck depends more on
the harness than on the model. The model never places shapes by coordinates; it
writes a JSON deck spec that picks components from a fixed library (the
consulting-deck engine + the Richter visuals in components.cjs). The harness
owns design, measurement and judgement of "done":

  1. STORYLINE a creative model (Opus by default, Fable optional) writes the governing
               thought, the main slides with archetypes and the appendix plan; structure
               rules are checked; --approve stops here for human approval
  1b. SPEC     the cheap build model fills every field of the approved storyline
  2. LINT      harness checks structure rules (takeaways, no repeated archetype,
               text budgets, required fields) -> errors go back to the model
  3. BUILD+QA  node build.cjs + qa.py (overlaps, overflow, label titles)
               -> errors go back to the model
  4. LOOK      slides are rendered to PNG and shown to the model, which
               critiques them as a reviewer and returns a revised spec
               (kept only if it still builds and passes QA)

  python3 forge.py --brief "..." [--source doc.pdf] [--story-model opus|fable|ID] [--model cheap|claude|ID]
                   [--approve | --storyline storyline.json] [--out NAME]
"""
import argparse
import base64
import io
import json
import os
import re
import subprocess
import sys
import time
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ENGINE = os.path.join(HERE, "..", "engine")


def read_key():
    key = os.environ.get("OPENROUTER_API_KEY", "").strip()
    if not key:
        sys.exit("set OPENROUTER_API_KEY")
    return key

MODELS = {"cheap": "deepseek/deepseek-v4.1-flash", "claude": "anthropic/claude-sonnet-5.5",
          "opus": "anthropic/claude-opus-5.5", "fable": "anthropic/claude-fable-5.1"}
# the storyline needs a creative model (Opus, later Fable);
# the token-heavy spec, fix and review rounds stay on the cheap model.
STORY_DEFAULT, BUILD_DEFAULT = "opus", "cheap"
API = "https://openrouter.ai/api/v1/chat/completions"

CATALOG = r"""
SLIDE TYPES (pick by message; JSON fields shown; every content slide also takes
kicker "Act | Topic", title (action title), takeaway, source):

cover            {title, subtitle, meta}
executiveSummary {answer: 1-2 sentences, points: [3-4 short facts with numbers]}
divider          {number, title, blurb}            (no takeaway/source)

-- VISUAL (prefer these; every number should be SEEN, not read) --
chart       {chartType: "bar"|"line"|"col"|"doughnut", data: [{name, labels: [...], values: [...]}],
             highlight?: index, numFmt?: '0.0"%"', insights: [2-3 short lines]}
            ranking/comparison -> bar; change over time -> line; composition -> doughnut (max 4 slices)
waterfall   {unit, steps: [{label, value} | {label, total: true}], highlight?: index, decimals?, insights: [2-3]}
            a start value becoming an end value: profit bridge, funding uses, revenue split
panels      {panels: [2-3 of:
               {kind: "doughnut", heading, labels, values, note?}
               {kind: "countdown", heading, from, now, to, nowLabel, toLabel, remainingLabel, note?}   (deadline / time left)
               {kind: "bars", heading, labels, values, highlight?, numFmt?, note?}
               {kind: "gauge", heading, today, target, max?, unit, direction?: "up"|"down", note?}  (today vs target)
            ]}  a small dashboard: share + deadline + stress test side by side
porter      {forces: {rivalry, entrants, substitutes, suppliers, buyers: each {level: "High"|"Medium"|"Low"|"Medium-low"..., why: max 8 words}}}
peerPanels  {subject: "Company", panels: [2-4 {category, peer, metric, subjectValue, peerValue, numFmt?}]}
riskMitigation {rows: [3-4 {risk: 2-3 words, exposure: fact WITH a number, mitigation: concrete move}]}
gantt       {startYear, endYear, bars: [3-6 {label, from, to, note, emphasis?: false for secondary}], marker?: {at, label}}
            years may be fractional (2030.2 = early 2030)
scorecard   {targets: [2-4 {heading, todayValue, targetValue, max, unit, direction?: "down" if lower is better,
             today: "short text", target: "short text"}]}
matrix      {xAxis, yAxis, quadrants: [4 {label, note, highlight?}]}   order: top-left, top-right, bottom-left, bottom-right
process     {steps: [3-5 {label: 1-3 words, note: one line}]}

keyTrends   {items: [3-5 {heading: 2-4 words, stat?: "4.5 yrs", text: one line}]}   numbered trends / levers / reasons
harveyTable {criteria: [2-6 short], options: [2-6 {name, scores: [0-4 per criterion], note?: 3-5 words}]}   qualitative option evaluation
weightedScorecard {criteria: [3-6 {label, weight}], options: [3-5 {id: "A", name, note?, scores: [1-5 per criterion]}], verdict}
            quantitative option choice; the weighted total /100 is computed for you
statusTable {itemHeader?, columns: [1-3 headers], rows: [2-7 {item, status: "green"|"amber"|"red", cells: [one per column]}]}  RAG dashboard
issueTree   {root, rootValue?, branches: [2-4 {label, value?, leaves: [2-3 short]}]}   problem decomposition / profit or driver tree
bubbleMatrix {xAxis: {label, min, max}, yAxis: {label, min, max}, quadrantLabels?: [4: TL, TR, BL, BR], items: [3-10 {label, x, y, size?, highlight?}]}  positioning map
swot        {strengths: [2-4], weaknesses: [2-4], opportunities: [2-4], threats: [2-4]}
roadmap     {phases: [3-5 {label, period, items: [2-4 short]}], milestone?: "one line"}   phased plan (simpler than gantt)
callout     {quote, author, role?, pointsHeading?, points: [2-3]}   a strong quote plus what it tells us (max once)
valueChain  {stages: [4-6 {label, metric?, activities: [2-3 short], highlight?}]}   where value/cost is created step by step
funnel      {stages: [3-6 {label, value: number, display?: "620k", note?}]}   conversion / pipeline (step conversion % computed)
pyramid     {levels: [3-5 {label: 1-3 words, text: one line}]}  top first: hierarchy of needs / strategy house / layers
mekko       {segments: [3-7 {name, width: market size, parts: [{label, value: share}]}], widthUnit?, highlight?: part label}  market map: size x share
journey     {stages: [4-6 {label, action: one line, sentiment: -2..2, pain?: short}]}   customer journey with pain points
annotatedLine {labels: [4+], values: [...], unit?, numFmt?: "#%", events: [1-4 {at: label index, label: 1-3 words}]}  time series with events
beforeAfter {before: {heading, points: [2-4]}, after: {heading, points: [2-4]}, metrics?: [1-4 {label, before, after}]}   transformation
compareTable {features: [3-8 short], items: [2-5 {name, marks: ["yes"|"partial"|"no"|short text per feature]}], highlight?: item name}  feature comparison
heatmap     {corner?, rows: [2-8], cols: [2-7], values: [[...]], unit?, higherIsBetter?}   performance by segment x period
milestones  {events: [4-8 {date, label: 2-4 words, note?, highlight?}]}   history or key dates on a timeline
chart chartType also: "stackedCol" | "stackedBar" | "percentCol" | "percentBar" (data: several series, same labels)

-- APPENDIX FAMILY (only in "appendix"; every appendix slide has supports: N = the main slide number it backs) --
methodology {steps: [3-5 {label, detail: one sentence}], dataSources?: [..]}   how an analysis was done
calcTable   {rows: [[header...], ...3-10 rows, 2-5 cols], totalRow?: true, formula: "Share = A / B"}   the actual calculation
assumptions {rows: [3-8 {assumption, value, basis: why this value}]}
sensitivity {rowVar, colVar, rowValues: [3-6], colValues: [3-6], matrix: [[...]], unit?, base: [row, col], higherIsBetter?}
Appendix slides may also use chart, waterfall, table, process.

-- TEXT (last resort, max one of each per deck) --
kpis    {stats: [3-4 {value, label, note}], body?}
table   {rows: [[header...], [...]...], colW: [relative widths]}   max 7 rows, 2-4 columns
twoUp   {left: {heading, body: [3-4 lines]}, right: {heading, body: [...]}}
bullets {bullets: [3-5]}
"""

RULES = """
You build McKinsey-style decks in English. Rules (a broken rule is a defect):
- ACTION TITLES: every content title is a full-sentence takeaway with a verb and ideally a number,
  max ~95 characters. Never a label like "Market overview". Read top to bottom, titles alone must
  tell the whole argument.
- Structure: cover, executiveSummary, then three acts with dividers: 1 Analysis (where things stand),
  2 Strategy (what to do and why), 3 Implementation (how, when, how much, how to track), and a CLOSING
  executiveSummary as the LAST main slide (before the appendix): the answer restated, 3-4 key points with
  numbers, and what to watch / next steps (kicker "Summary"). No "closing" slide: a weak thank-you or
  bullet recap slide is not allowed.
  Kicker each slide with its act, e.g. "Analysis | Peer benchmarks".
- VISUAL FIRST: if the message can be a chart, panel, diagram, gantt or scorecard, it must be.
  Text archetypes (kpis, table, twoUp, bullets) at most once each.
- Never the same type on two consecutive slides.
- Every content slide has a takeaway: one sentence, the "so what" (not a repeat of the title).
- Concrete numbers on every slide, including strategy and implementation. Use ONLY numbers from the
  source/brief; if you must assume something (FX rate, a share), say so in the source line.
- Implementation act: a gantt with the key deadline marker, a waterfall for funding or profit impact,
  and a scorecard (today vs target).
- Short text: insights and notes are one line each; boxes must not be stuffed.
- NEVER invent a benchmark, target or threshold that is not in the source (e.g. a "40% dominance
  threshold"). Derived numbers are allowed only if the calculation is shown in the appendix.
- Never use the em dash (\u2014) or a spaced en dash as punctuation: use a colon, comma or full stop.
- VARIETY (hard check): never the same archetype twice in a row; any archetype max 2 times in the main
  deck (callout, swot and the text archetypes max once); max 4 chart slides; use at least 60% distinct
  archetypes across the content slides. Prefer the consulting archetypes: keyTrends, issueTree,
  harveyTable, weightedScorecard, bubbleMatrix, statusTable, roadmap, swot, waterfall, matrix, valueChain,
  funnel, pyramid, mekko, journey, annotatedLine, beforeAfter, compareTable, heatmap, milestones.
- APPENDIX (hard check): after the main deck, an appendix of 1-1.5x as many slides as the presented
  content slides. It explains the method, the calculations, the assumptions and the rationale behind
  the main slides; every appendix slide names the main slide it backs (supports: N), at least 70% of
  the main content slides are backed, and it contains at least one methodology, one assumptions and
  one calcTable or sensitivity slide.
"""

HOUSE = open(os.path.join(HERE, "house_style.md")).read() if os.path.exists(os.path.join(HERE, "house_style.md")) else ""

SPEC_SHAPE = """Return ONLY a JSON object:
{"storyline": ["title 1", "title 2", ...],
 "meta": {"title", "company", "brandPrimary": "hex of the company's real brand colour", "footer": "COMPANY | Topic | Team"},
 "slides": [{"type": "...", ...fields}],
 "appendix": [{"type": "...", "supports": N, ...fields}]}"""

STORY_SHAPE = """Return ONLY a JSON object:
{"governingThought": "the one-sentence answer",
 "meta": {"title", "company", "brandPrimary": "hex of the company's real brand colour", "footer": "COMPANY | Topic | Team"},
 "slides": [{"type": "archetype from the catalog", "title": "action title", "kicker": "Act | Topic",
             "message": "what the slide must prove, one sentence", "evidence": ["the exact numbers/facts from the source to show"]}],
 "appendix": [{"type": "appendix archetype", "supports": N, "title": "action title",
               "message": "which method / calculation / assumption / rationale it explains", "evidence": ["numbers and steps to show"]}]}
N = the 1-based position of the backed slide in "slides"."""


# ---- model access ----------------------------------------------------------
class LLM:
    def __init__(self, model):
        self.model, self.key, self.cost, self.tokens, self.calls = model, read_key(), 0.0, 0, 0

    def ask(self, system, content, max_tokens=32000):
        body = {"model": self.model, "max_tokens": max_tokens, "usage": {"include": True},
                # thinking models (Claude 5.x) otherwise spend the whole budget on reasoning
                # and return empty content with finish=length
                "reasoning": {"max_tokens": 6000},
                "messages": [{"role": "system", "content": system}, {"role": "user", "content": content}]}
        req = urllib.request.Request(API, json.dumps(body).encode(),
                                     {"Authorization": f"Bearer {self.key}", "Content-Type": "application/json"})
        for attempt in range(3):
            try:
                with urllib.request.urlopen(req, timeout=600) as r:
                    data = json.loads(r.read())
                break
            except Exception as e:
                if attempt == 2:
                    raise
                log(f"  model call failed ({e}), retrying")
                time.sleep(5)
        u = data.get("usage", {})
        self.cost += u.get("cost", 0) or 0
        self.tokens += u.get("total_tokens", 0)
        self.calls += 1
        ch = data["choices"][0]
        self.last_finish = ch.get("finish_reason")
        return ch["message"].get("content") or ""

    def ask_json(self, system, content):
        for attempt in range(2):
            raw = self.ask(system, content)
            try:
                return parse_json(raw)
            except ValueError as e:
                dump = f"/tmp/deckforge_raw_{int(time.time())}.txt"
                open(dump, "w").write(raw)
                log(f"  could not parse JSON ({e}; finish={self.last_finish}, {len(raw)} chars, saved {dump}); asking again")
                content = (content if isinstance(content, str) else content)
        raise RuntimeError("model did not return valid JSON twice")


def parse_json(raw):
    raw = raw.strip()
    m = re.search(r"```(?:json)?\s*(\{.*\})\s*```", raw, re.S)
    if m:
        raw = m.group(1)
    start, end = raw.find("{"), raw.rfind("}")
    if start < 0 or end < 0:
        raise ValueError("no JSON object found")
    return json.loads(raw[start:end + 1])


def log(msg):
    print(msg, flush=True)


# ---- harness checks ---------------------------------------------------------
NO_FRAME = {"cover", "divider", "closing"}
TEXTY = {"kpis", "table", "twoUp", "bullets"}
REQUIRED = {
    "chart": ["chartType", "data"], "waterfall": ["steps"], "panels": ["panels"], "porter": ["forces"],
    "peerPanels": ["subject", "panels"], "riskMitigation": ["rows"], "gantt": ["startYear", "endYear", "bars"],
    "scorecard": ["targets"], "matrix": ["quadrants", "xAxis", "yAxis"], "process": ["steps"],
    "kpis": ["stats"], "table": ["rows"], "twoUp": ["left", "right"], "bullets": ["bullets"],
    "executiveSummary": ["answer", "points"], "cover": ["title"], "divider": ["number", "title"],
    "closing": ["title", "points"],
    "keyTrends": ["items"], "harveyTable": ["criteria", "options"], "weightedScorecard": ["criteria", "options"],
    "statusTable": ["rows"], "issueTree": ["root", "branches"], "bubbleMatrix": ["items", "xAxis", "yAxis"],
    "swot": ["strengths", "weaknesses", "opportunities", "threats"], "roadmap": ["phases"], "callout": ["quote"],
    "valueChain": ["stages"], "funnel": ["stages"], "pyramid": ["levels"], "mekko": ["segments"], "journey": ["stages"],
    "annotatedLine": ["labels", "values"], "beforeAfter": ["before", "after"], "compareTable": ["features", "items"],
    "heatmap": ["rows", "cols", "values"], "milestones": ["events"],
    "methodology": ["steps"], "calcTable": ["rows"], "assumptions": ["rows"], "sensitivity": ["rowValues", "colValues", "matrix"],
}
VISUAL = {"chart", "waterfall", "panels", "porter", "peerPanels", "riskMitigation", "gantt", "scorecard", "matrix", "process",
          "keyTrends", "harveyTable", "weightedScorecard", "statusTable", "issueTree", "bubbleMatrix", "swot", "roadmap",
          "valueChain", "funnel", "pyramid", "mekko", "journey", "annotatedLine", "beforeAfter", "compareTable", "heatmap", "milestones"}
APPENDIX_ONLY = {"methodology", "calcTable", "assumptions", "sensitivity"}
APPENDIX_OK = APPENDIX_ONLY | {"chart", "waterfall", "table", "process", "bubbleMatrix", "issueTree", "harveyTable", "statusTable", "heatmap", "compareTable", "annotatedLine", "funnel"}
ONCE = {"callout", "swot", "pyramid", "beforeAfter", "kpis", "table", "twoUp", "bullets"}


def _slide_checks(i, s, errs, label):
    t = s.get("type")
    if t not in REQUIRED:
        errs.append(f"{label} {i}: unknown type '{t}'")
        return
    for f in REQUIRED[t]:
        if f not in s:
            errs.append(f"{label} {i} ({t}): missing field '{f}'")
    if t not in NO_FRAME:
        if not s.get("takeaway") and t != "executiveSummary":
            errs.append(f"{label} {i} ({t}): missing takeaway")
        title = s.get("title", "")
        if len(title) > 110:
            errs.append(f"{label} {i}: title is {len(title)} chars, max 110")
        if len(title.split()) < 5:
            errs.append(f"{label} {i}: title '{title}' is a label, write a full-sentence takeaway")
        if not s.get("source"):
            errs.append(f"{label} {i} ({t}): missing source line")
        elif len(s["source"]) > 140:
            errs.append(f"{label} {i}: source line is {len(s['source'])} chars, max 140 (one line): cite fewer items or shorten them")
    if t == "executiveSummary":
        if len(s.get("points", [])) > 4:
            errs.append(f"{label} {i}: executiveSummary has {len(s['points'])} points, max 4")
        for p_ in s.get("points", []):
            if len(p_) > 100:
                errs.append(f"{label} {i}: executiveSummary point is {len(p_)} chars, max 100: '{p_[:40]}...'")
        if len(s.get("answer", "")) > 200:
            errs.append(f"{label} {i}: executiveSummary answer is {len(s['answer'])} chars, max 200")
    for p_ in s.get("insights", []) or []:
        if len(p_) > 90:
            errs.append(f"{label} {i}: insight is {len(p_)} chars, max 90: '{p_[:40]}...'")
    if t == "assumptions":
        for r_ in s.get("rows", []):
            if len(str(r_.get("value", ""))) > 28:
                errs.append(f"{label} {i}: assumptions value '{str(r_.get('value'))[:30]}...' is over 28 chars; "
                            "keep the value short, put the detail in basis")
    dump = json.dumps(s, ensure_ascii=False)
    if "\u2014" in dump or "\u2013 " in dump:
        errs.append(f"{label} {i}: contains an em/en dash used as a dash; use a colon, comma or full stop instead")


def _family(s):
    # charts of different chartType count as different visuals, the same chartType twice in a row does not
    return s.get("type") + (":" + s.get("chartType", "") if s.get("type") == "chart" else "")


def lint(spec):
    """Hard checks: varied consulting archetypes, no repeats in a row,
    a deep appendix of 1-1.5x the presented slides that backs the main argument."""
    errs, slides, app = [], spec.get("slides", []), spec.get("appendix", [])
    if not slides:
        return ["no slides"]
    counts, prev = {}, None
    for i, s in enumerate(slides, 1):
        _slide_checks(i, s, errs, "slide")
        t = s.get("type")
        counts[t] = counts.get(t, 0) + 1
        if t in APPENDIX_ONLY:
            errs.append(f"slide {i}: '{t}' belongs in the appendix, not the main deck")
        if prev and _family(s) == prev and t != "divider":
            errs.append(f"slide {i}: same type '{t}' as the slide before; use a different archetype")
        prev = _family(s)
    for t, n in counts.items():
        if t in ONCE and n > 1:
            errs.append(f"type '{t}' used {n} times in the main deck; max once, replace with other archetypes")
        elif t not in NO_FRAME and t != "chart" and n > 2:
            errs.append(f"type '{t}' used {n} times in the main deck; max 2, use other archetypes from the catalog")
    # structure: exec summary right after the cover AND as the last main slide, no closing slide
    types = [s.get("type") for s in slides]
    if "closing" in types:
        errs.append("a 'closing' slide is not allowed; end the main deck with an executiveSummary instead")
    if types.count("executiveSummary") != 2 or types[-1] != "executiveSummary":
        errs.append("the main deck needs exactly two executiveSummary slides: one right after the cover and one as the LAST "
                    "main slide (answer, 3-4 key points with numbers, what to watch / next steps)")
    elif len(types) > 1 and types[1] != "executiveSummary":
        errs.append("the first executiveSummary must come right after the cover (slide 2)")
    charts = [s.get("chartType") for s in slides if s.get("type") == "chart"]
    if len(charts) > 4:
        errs.append(f"{len(charts)} chart slides in the main deck; max 4, show the rest with other archetypes")
    content = [s for s in slides if s.get("type") not in NO_FRAME | {"executiveSummary"}]
    vis = sum(1 for s in content if s.get("type") in VISUAL)
    if content and vis / len(content) < 0.7:
        errs.append(f"only {vis}/{len(content)} content slides are visual; at least 70% must be")
    distinct = len({s.get("type") for s in content})
    need_distinct = min(9, round(0.6 * len(content)))
    if distinct < need_distinct:
        errs.append(f"only {distinct} distinct archetypes across {len(content)} content slides; use at least "
                    f"{need_distinct} (keyTrends, harveyTable, issueTree, bubbleMatrix, roadmap, statusTable, ...)")
    # ---- appendix ----
    n_main = len(content)
    lo, hi = n_main, int(n_main * 1.5 + 0.999)
    if not (lo <= len(app) <= hi):
        errs.append(f"appendix has {len(app)} slides; it must have {lo}-{hi} (1-1.5x the {n_main} presented content slides)")
    prev = None
    backed = set()
    content_idx = {i for i, s in enumerate(slides, 1) if s.get("type") not in NO_FRAME | {"executiveSummary"}}
    for k, s in enumerate(app, 1):
        _slide_checks(k, s, errs, "appendix slide")
        t = s.get("type")
        if t not in APPENDIX_OK:
            errs.append(f"appendix slide {k}: type '{t}' not allowed in the appendix; use {sorted(APPENDIX_OK)}")
        sup = s.get("supports")
        if sup not in content_idx:
            errs.append(f"appendix slide {k}: supports={sup!r} must be the number of a main content slide {sorted(content_idx)}")
        else:
            backed.add(sup)
        if prev and _family(s) == prev:
            errs.append(f"appendix slide {k}: same type '{t}' as the appendix slide before")
        prev = _family(s)
    if content_idx and len(backed) / len(content_idx) < 0.7:
        missing = sorted(content_idx - backed)
        errs.append(f"only {len(backed)}/{len(content_idx)} main content slides have appendix backup; add backup for slides {missing}")
    atypes = {s.get("type") for s in app}
    for must in ("methodology", "assumptions"):
        if app and must not in atypes:
            errs.append(f"appendix has no '{must}' slide; it must explain the method and the assumptions")
    if app and not atypes & {"calcTable", "sensitivity"}:
        errs.append("appendix has no calcTable or sensitivity slide; show at least one calculation")
    return errs


def system(extra=""):
    """RULES + house style + per-deck extra instructions + catalog: every model call gets this."""
    parts = [RULES, HOUSE]
    if extra:
        parts.append("DECK-SPECIFIC INSTRUCTIONS FROM KRISTOF (follow them):\n" + extra)
    return "\n".join(p for p in parts if p) + CATALOG


def story_errors(story):
    """Structure rules on the storyline only (fields are filled later, so 'missing ...' is ignored)."""
    pseudo = {"slides": [{**x, "takeaway": "x", "source": "x"} for x in story.get("slides", [])],
              "appendix": [{**x, "takeaway": "x", "source": "x"} for x in story.get("appendix", [])]}
    return [e for e in lint(pseudo) if "missing field" not in e]


def story_md(story):
    out = [f"# {story.get('meta', {}).get('title', 'Deck')}", "", f"**Governing thought:** {story.get('governingThought', '')}", "", "## Main deck"]
    for i, x in enumerate(story.get("slides", []), 1):
        out.append(f"{i}. [{x.get('type')}] {x.get('title', '')}")
        if x.get("message"):
            out.append(f"   - {x['message']}")
    out += ["", "## Appendix"]
    for k, x in enumerate(story.get("appendix", []), 1):
        out.append(f"A{k}. [{x.get('type')}] backs slide {x.get('supports')}: {x.get('title', '')}")
    return "\n".join(out) + "\n"


def build(spec, out_pptx):
    spec_path = out_pptx.replace(".pptx", ".json")
    json.dump(spec, open(spec_path, "w"), indent=1, ensure_ascii=False)
    r = subprocess.run(["node", os.path.join(HERE, "build.cjs"), spec_path, out_pptx],
                       capture_output=True, text=True, timeout=180)
    try:
        res = json.loads(r.stdout.strip().splitlines()[-1])
    except Exception:
        return [f"builder crashed: {r.stderr[-800:]}"]
    errs = [f"slide {e['slide']} ({e['type']}): build error: {e['message']}" for e in res["errors"]]
    if errs:
        return errs
    qa_json = out_pptx.replace(".pptx", ".qa.json")
    subprocess.run(["python3", os.path.join(ENGINE, "qa.py"), out_pptx, "--out", qa_json],
                   capture_output=True, text=True, timeout=120)
    rep = json.load(open(qa_json))
    return [f"slide {i['slide']}: {i['category']}: {i['message']}"
            for i in rep.get("issues", []) if i["severity"] == "error"]


def render(pptx, outdir):
    subprocess.run(["bash", os.path.join(ENGINE, "render.sh"), pptx, outdir], capture_output=True, timeout=300)
    files = sorted((f for f in os.listdir(outdir) if f.startswith("slide-") and f.endswith(".png")),
                   key=lambda f: int(re.findall(r"\d+", f)[0]))
    return [os.path.join(outdir, f) for f in files]


def img_part(path, width=1100):
    from PIL import Image
    im = Image.open(path)
    im = im.resize((width, int(im.height * width / im.width)))
    buf = io.BytesIO()
    im.convert("RGB").save(buf, "JPEG", quality=80)
    return {"type": "image_url", "image_url": {"url": "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()}}


SYS = ""


def fix_round(llm, spec, errs, what):
    log(f"  {len(errs)} {what} errors -> back to the model")
    for e in errs[:12]:
        log(f"    - {e}")
    return llm.ask_json(SYS, f"Your deck spec has {what} errors. Fix ALL of them and return the "
                        f"complete corrected spec (same JSON shape).\n\nERRORS:\n" + "\n".join(errs) +
                        "\n\nSPEC:\n" + json.dumps(spec, ensure_ascii=False))


def gate(llm, spec, pptx, rounds=4):
    """lint + build + QA until clean (or rounds run out). Returns (spec, clean)."""
    for r in range(rounds):
        errs = lint(spec)
        if errs:
            spec = fix_round(llm, spec, errs, "structure")
            continue
        errs = build(spec, pptx)
        if errs:
            spec = fix_round(llm, spec, errs, "build/QA")
            continue
        return spec, True
    return spec, not lint(spec) and not build(spec, pptx)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--brief", required=True)
    ap.add_argument("--source", help="txt or pdf with the facts")
    ap.add_argument("--model", default=BUILD_DEFAULT, help="build model (spec, fixes, review)")
    ap.add_argument("--story-model", default=STORY_DEFAULT, help="storyline model: opus | fable | any OpenRouter id")
    ap.add_argument("--system", help="extra system instructions for this deck: text or a path to a .md/.txt file")
    ap.add_argument("--approve", action="store_true", help="stop after the storyline so it can be approved")
    ap.add_argument("--storyline", help="approved storyline.json: skip the storyline stage and build from it")
    ap.add_argument("--out", default="deck")
    ap.add_argument("--look-rounds", type=int, default=2)
    ap.add_argument("--brand", help="brand hex, overrides the model's guess (e.g. 00418D)")
    args = ap.parse_args()

    model = MODELS.get(args.model, args.model)
    story_model = MODELS.get(args.story_model, args.story_model)
    llm, story_llm = LLM(model), LLM(story_model)
    global SYS
    extra = args.system or ""
    if extra and os.path.exists(extra):
        extra = open(extra).read()
    SYS = system(extra)
    outdir = os.path.abspath(args.out)
    os.makedirs(outdir, exist_ok=True)
    pptx = os.path.join(outdir, "deck.pptx")
    t0 = time.time()

    source = ""
    if args.source:
        if args.source.endswith(".pdf"):
            source = subprocess.run(["pdftotext", "-layout", args.source, "-"], capture_output=True, text=True).stdout
        else:
            source = open(args.source).read()
        source = source[:120000]

    log(f"deckforge | storyline {story_model} | build {model}")
    if args.storyline:
        story = json.load(open(args.storyline))
        log(f"[1/4] STORYLINE loaded from {args.storyline} (approved)")
    else:
        log("[1/4] STORYLINE (creative model)")
        story = story_llm.ask_json(SYS + STORY_SHAPE,
                                   "Design the storyline of this deck: the governing thought, then the main slides "
                                   "(Analysis -> Strategy -> Implementation, 12-18 slides incl. cover, executive summary, "
                                   "dividers, and a closing executiveSummary as the last main slide) with the best-fitting archetype for each message, then the appendix "
                                   "that backs it. Do not fill every field yet: give each slide its message and the exact "
                                   f"evidence to show.\n\nBRIEF:\n{args.brief}\n\nSOURCE MATERIAL:\n{source or '(none: use the brief only)'}\n\n"
                                   + STORY_SHAPE)
        for r in range(2):
            errs = story_errors(story)
            if not errs:
                break
            log(f"  storyline breaks {len(errs)} structure rules -> back to the storyline model")
            for e in errs[:10]:
                log(f"    - {e}")
            story = story_llm.ask_json(SYS + STORY_SHAPE, "Your storyline breaks these structure rules. Fix ALL of "
                                       "them and return the complete corrected storyline.\n\nERRORS:\n" + "\n".join(errs) +
                                       "\n\nSTORYLINE:\n" + json.dumps(story, ensure_ascii=False))
        json.dump(story, open(os.path.join(outdir, "storyline.json"), "w"), indent=1, ensure_ascii=False)
        open(os.path.join(outdir, "storyline.md"), "w").write(story_md(story))
        log(f"  {len(story.get('slides', []))} main + {len(story.get('appendix', []))} appendix slides; "
            f"written to {outdir}/storyline.md")
        if args.approve:
            log("STOP: storyline waiting for approval. Rerun with --storyline " + os.path.join(outdir, "storyline.json"))
            summary = {"stage": "storyline", "story_model": story_model, "cost_usd": round(story_llm.cost, 4)}
            json.dump(summary, open(os.path.join(outdir, "summary.json"), "w"), indent=1)
            log("DONE " + json.dumps(summary))
            return
    log("  governing thought: " + story.get("governingThought", ""))
    log("[1b/4] SPEC: the build model fills every slide of the approved storyline")
    spec = llm.ask_json(SYS + SPEC_SHAPE,
                        "Turn this APPROVED storyline into the full deck spec. Keep every slide, its archetype, its "
                        "order, its title and its 'supports' exactly; fill all fields of the archetype with the "
                        "evidence given (and the source), add takeaway and source lines.\n\nSTORYLINE:\n"
                        + json.dumps(story, ensure_ascii=False) +
                        f"\n\nSOURCE MATERIAL:\n{source or '(none)'}\n\n" + SPEC_SHAPE)
    spec.setdefault("meta", story.get("meta", {}))
    log(f"  {len(spec.get('slides', []))} main + {len(spec.get('appendix', []))} appendix slides specified")

    if args.brand:
        spec.setdefault("meta", {})["brandPrimary"] = args.brand
    log("[2-3/4] LINT + BUILD + QA loop")
    spec, clean = gate(llm, spec, pptx)
    log(f"  gate {'PASSED' if clean else 'still failing'}")

    for lr in range(1, args.look_rounds + 1):
        log(f"[4/4] LOOK round {lr}: render and review")
        pngs = render(pptx, os.path.join(outdir, f"look{lr}"))
        content = [{"type": "text", "text":
                    "You are a demanding partner reviewing this deck before it goes to the client. Below is "
                    "every slide as rendered (in order), then the spec that produced it. Find what a human "
                    "reviewer would reject: text-heavy or dry slides that should be visual, cramped or "
                    "empty-looking areas, weak or label-like titles, takeaways that repeat the title, "
                    "missing numbers, a storyline that does not flow, anything unreadable. Then return the "
                    "COMPLETE improved spec. Return ONLY JSON: {\"review\": [\"slide N: problem -> fix\", ...], "
                    "\"spec\": {...full spec...}}. If nothing needs changing, return the same spec and an "
                    "empty review."}]
        for i, p in enumerate(pngs, 1):
            content.append({"type": "text", "text": f"Slide {i}:"})
            content.append(img_part(p))
        content.append({"type": "text", "text": "SPEC:\n" + json.dumps(spec, ensure_ascii=False)})
        res = llm.ask_json(SYS, content)
        review, new = res.get("review", []), res.get("spec")
        for r in review:
            log(f"    - {r}")
        if not review or not new:
            log("  reviewer is satisfied")
            break
        cand_pptx = os.path.join(outdir, "candidate.pptx")
        if args.brand:
            new.setdefault("meta", {})["brandPrimary"] = args.brand
        new, ok = gate(llm, new, cand_pptx, rounds=3)
        if ok:
            spec = new
            build(spec, pptx)
            log("  revision accepted (builds and passes QA)")
        else:
            log("  revision rejected (failed the gate); keeping the previous version")
            build(spec, pptx)

    final = render(pptx, os.path.join(outdir, "final"))
    json.dump(spec, open(os.path.join(outdir, "deck.json"), "w"), indent=1, ensure_ascii=False)
    summary = {"model": model, "story_model": story_model, "slides": len(final), "calls": llm.calls + story_llm.calls,
               "tokens": llm.tokens + story_llm.tokens, "cost_usd": round(llm.cost + story_llm.cost, 4),
               "story_cost_usd": round(story_llm.cost, 4), "minutes": round((time.time() - t0) / 60, 1), "pptx": pptx}
    json.dump(summary, open(os.path.join(outdir, "summary.json"), "w"), indent=1)
    log("DONE " + json.dumps(summary))


if __name__ == "__main__":
    main()
