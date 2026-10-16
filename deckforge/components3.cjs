// deckforge archetypes, batch 3 (2026-10-09): value chain, funnel, pyramid,
// Mekko market map, customer journey, annotated line, before/after,
// competitor feature table, heatmap, milestone timeline.
// House style rules apply: no repeated tinted "cards", no accent strips;
// hairlines, white space and type weight carry the structure. A filled
// shape is used only for a single highlight.
const RED = "C62828", AMBER = "E0A100", GREEN = "2E7D32", GREY = "8A94A6", PALE = "D5DCE6";

function mk3(d) {
  const { FONT } = require("../engine/deck");
  const t = d.t, P = d.p;
  const txt = (s, text, o) => s.addText(text, { fontFace: FONT, margin: 0, color: t.ink, valign: "top", ...o });
  const frame = (sp) => d.custom({ title: sp.title, kicker: sp.kicker, takeaway: sp.takeaway, source: sp.source });
  const body = (c) => ({ x: c.grid.ml, y: c.grid.bodyY, w: c.grid.contentW, h: c.grid.bodyH });
  const need = (cond, msg) => { if (!cond) throw new Error(msg); };
  const line = (s, x, y, w, h, color = PALE, width = 1, dash) => s.addShape(P.ShapeType.line, { x, y, w, h, line: { color, width, ...(dash ? { dashType: dash } : {}) } });
  const bullets = (arr) => arr.map((x, i) => ({ text: x, options: { bullet: true, breakLine: i < arr.length - 1, paraSpaceAfter: 4 } }));

  return {
    valueChain(sp) {
      const st = sp.stages || [];
      need(st.length >= 4 && st.length <= 6, "valueChain needs 4-6 stages");
      const c = frame(sp), s = c.slide, b = body(c), gap = 0.08, w = (b.w - gap * (st.length - 1)) / st.length;
      st.forEach((x, i) => {
        const X = b.x + i * (w + gap), hi = !!x.highlight;
        s.addShape(i === 0 ? P.ShapeType.homePlate : P.ShapeType.chevron, { x: X, y: b.y, w, h: 0.8, fill: { color: hi ? t.primary : "FFFFFF" }, line: { color: t.primary, width: 1.25 } });
        txt(s, x.label, { x: X + 0.28, y: b.y, w: w - 0.5, h: 0.8, fontSize: 15, bold: true, color: hi ? "FFFFFF" : t.ink, valign: "middle", align: "center", fit: "shrink" });
        if (x.metric) txt(s, x.metric, { x: X + 0.05, y: b.y + 0.95, w: w - 0.1, h: 0.55, fontSize: 22, bold: true, color: t.primary, align: "center", fit: "shrink" });
        if (i > 0) line(s, X - gap / 2, b.y + 1.0, 0, b.h - 1.1);
        txt(s, bullets((x.activities || []).slice(0, 3)), { x: X + 0.08, y: b.y + (x.metric ? 1.6 : 1.0), w: w - 0.16, h: b.h - (x.metric ? 1.7 : 1.1), fontSize: 14, fit: "shrink" });
      });
    },

    funnel(sp) {
      const st = sp.stages || [];
      need(st.length >= 3 && st.length <= 6, "funnel needs 3-6 stages");
      const c = frame(sp), s = c.slide, b = body(c), fw = b.w * 0.55, rowH = b.h / st.length, max = Math.max(...st.map((x) => Number(x.value) || 0));
      st.forEach((x, i) => {
        const v = Number(x.value) || 0, w = Math.max(fw * 0.18, fw * (v / max)), X = b.x + (fw - w) / 2, Y = b.y + i * rowH + 0.06;
        s.addShape(P.ShapeType.rect, { x: X, y: Y, w, h: rowH - 0.12, fill: { color: i === st.length - 1 ? t.primary : t.dark }, line: { type: "none" } });
        txt(s, x.display || String(x.value), { x: X, y: Y, w, h: rowH - 0.12, fontSize: 18, bold: true, color: "FFFFFF", align: "center", valign: "middle", fit: "shrink" });
        txt(s, [{ text: x.label, options: { bold: true, breakLine: !!x.note } }, ...(x.note ? [{ text: x.note, options: { color: t.mid, fontSize: 13 } }] : [])],
          { x: b.x + fw + 0.4, y: Y, w: b.w - fw - 1.9, h: rowH - 0.12, fontSize: 16, valign: "middle", fit: "shrink" });
        if (i > 0 && st[i - 1].value) {
          const conv = Math.round((v / Number(st[i - 1].value)) * 100);
          txt(s, `${conv}%`, { x: b.x + b.w - 1.3, y: Y - rowH / 2, w: 1.3, h: rowH, fontSize: 16, bold: true, color: t.primary, align: "right", valign: "middle" });
        }
      });
      txt(s, "step conversion", { x: b.x + b.w - 1.8, y: b.y - 0.32, w: 1.8, h: 0.3, fontSize: 11, color: t.mid, align: "right" });
    },

    pyramid(sp) {
      const lv = sp.levels || [];
      need(lv.length >= 3 && lv.length <= 5, "pyramid needs 3-5 levels (top first)");
      const c = frame(sp), s = c.slide, b = body(c), pw = b.w * 0.42, rowH = b.h / lv.length;
      lv.forEach((x, i) => {
        const topW = pw * (i / lv.length), botW = pw * ((i + 1) / lv.length), X = b.x + (pw - botW) / 2, Y = b.y + i * rowH;
        s.addShape(i === 0 ? P.ShapeType.triangle : P.ShapeType.trapezoid, { x: X, y: Y + 0.03, w: botW, h: rowH - 0.06, fill: { color: i === 0 ? t.primary : t.dark }, line: { color: "FFFFFF", width: 2 },
          ...(i === 0 ? {} : { adjustments: [((botW - topW) / 2) / botW * 0.5] }) });
        txt(s, x.label, { x: i === 0 ? X : X + botW * 0.2, y: Y, w: i === 0 ? botW : botW * 0.6, h: rowH - (i === 0 ? 0.08 : 0), fontSize: i === 0 ? 12 : 15, bold: true, color: "FFFFFF", align: "center", valign: i === 0 ? "bottom" : "middle", fit: "shrink" });
        line(s, b.x + pw + 0.2, Y + rowH / 2, 0.5, 0, GREY);
        txt(s, x.text, { x: b.x + pw + 0.85, y: Y, w: b.w - pw - 0.85, h: rowH, fontSize: 16, valign: "middle", fit: "shrink" });
      });
    },

    mekko(sp) {
      const seg = sp.segments || [];
      need(seg.length >= 3 && seg.length <= 7, "mekko needs 3-7 segments {name, width, parts:[{label, value}]}");
      const c = frame(sp), s = c.slide, b = body(c), tot = seg.reduce((a, x) => a + Number(x.width), 0), ph = b.h - 0.75, pal = [t.primary, t.dark, GREY, PALE, "B0BEC5"];
      let X = b.x + 0.1;
      const labels = {};
      seg.forEach((x) => {
        const w = (b.w - 0.2) * (Number(x.width) / tot), sum = x.parts.reduce((a, p) => a + Number(p.value), 0);
        let Y = b.y;
        x.parts.forEach((p, j) => {
          if (!(p.label in labels)) labels[p.label] = Object.keys(labels).length;
          const h = ph * (Number(p.value) / sum), col = sp.highlight && p.label === sp.highlight ? t.primary : pal[(labels[p.label] + 1) % pal.length];
          s.addShape(P.ShapeType.rect, { x: X, y: Y, w: w - 0.04, h, fill: { color: col }, line: { color: "FFFFFF", width: 1 } });
          if (h > 0.35 && w > 0.7) txt(s, `${p.label} ${Math.round(Number(p.value) / sum * 100)}%`, { x: X + 0.05, y: Y, w: w - 0.14, h, fontSize: 11, bold: true, color: [PALE, "B0BEC5"].includes(col) ? t.ink : "FFFFFF", align: "center", valign: "middle", fit: "shrink" });
          Y += h;
        });
        txt(s, [{ text: x.name, options: { bold: true, breakLine: true } }, { text: `${x.width}${sp.widthUnit || ""}`, options: { color: t.mid } }], { x: X, y: b.y + ph + 0.05, w: w - 0.04, h: 0.65, fontSize: 12, align: "center", fit: "shrink" });
        X += w;
      });
    },

    journey(sp) {
      const st = sp.stages || [];
      need(st.length >= 4 && st.length <= 6, "journey needs 4-6 stages {label, action, sentiment: -2..2, pain?}");
      const c = frame(sp), s = c.slide, b = body(c), w = b.w / st.length, midY = b.y + 1.5, amp = 0.45;
      const pts = st.map((x, i) => [b.x + w * i + w / 2, midY - amp * (Number(x.sentiment) || 0)]);
      line(s, b.x, midY, b.w, 0, PALE, 1, "dash");
      for (let i = 1; i < pts.length; i++) {
        const [x1, y1] = pts[i - 1], [x2, y2] = pts[i];
        s.addShape(P.ShapeType.line, { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.max(Math.abs(y2 - y1), 0.001), flipV: y2 < y1, line: { color: t.dark, width: 2 } });
      }
      st.forEach((x, i) => {
        const [cx, cy] = pts[i], sen = Number(x.sentiment) || 0;
        txt(s, x.label, { x: b.x + w * i + 0.05, y: b.y, w: w - 0.1, h: 0.5, fontSize: 15, bold: true, align: "center", fit: "shrink" });
        s.addShape(P.ShapeType.ellipse, { x: cx - 0.17, y: cy - 0.17, w: 0.34, h: 0.34, fill: { color: sen > 0 ? GREEN : sen < 0 ? RED : AMBER }, line: { color: "FFFFFF", width: 1.5 } });
        if (i > 0) line(s, b.x + w * i, b.y + 2.7, 0, b.h - 2.7);
        txt(s, x.action || "", { x: b.x + w * i + 0.1, y: b.y + 2.8, w: w - 0.2, h: 1.0, fontSize: 13.5, fit: "shrink" });
        if (x.pain) txt(s, [{ text: "Pain: ", options: { bold: true, color: RED } }, { text: x.pain }], { x: b.x + w * i + 0.1, y: b.y + 3.85, w: w - 0.2, h: b.h - 3.9, fontSize: 13, fit: "shrink" });
      });
    },

    annotatedLine(sp) {
      const lb = sp.labels || [], v = (sp.values || []).map(Number), ev = sp.events || [];
      need(lb.length >= 4 && lb.length === v.length, "annotatedLine needs 4+ labels and as many values");
      const c = frame(sp), s = c.slide, b = body(c), px = b.x + 0.7, pw = b.w - 1.0, py = b.y + 0.9, ph = b.h - 1.5;
      const lo = Math.min(0, ...v), hi = Math.max(...v) * 1.1, X = (i) => px + pw * (i / (lb.length - 1)), Y = (val) => py + ph * (1 - (val - lo) / (hi - lo));
      line(s, px, py + ph, pw, 0, t.ink, 1.25);
      for (let i = 1; i < v.length; i++) {
        const x1 = X(i - 1), y1 = Y(v[i - 1]), x2 = X(i), y2 = Y(v[i]);
        s.addShape(P.ShapeType.line, { x: x1, y: Math.min(y1, y2), w: x2 - x1, h: Math.max(Math.abs(y2 - y1), 0.001), flipV: y2 < y1, line: { color: t.primary, width: 2.5 } });
      }
      v.forEach((val, i) => {
        s.addShape(P.ShapeType.ellipse, { x: X(i) - 0.06, y: Y(val) - 0.06, w: 0.12, h: 0.12, fill: { color: t.primary }, line: { type: "none" } });
        txt(s, (sp.numFmt ? sp.numFmt.replace("#", val) : String(val)), { x: X(i) - 0.5, y: Y(val) - 0.4, w: 1.0, h: 0.3, fontSize: 12, bold: true, align: "center" });
        txt(s, String(lb[i]), { x: X(i) - 0.5, y: py + ph + 0.08, w: 1.0, h: 0.3, fontSize: 12, color: t.mid, align: "center" });
      });
      ev.slice(0, 4).forEach((e, k) => {
        const i = Math.max(0, Math.min(lb.length - 1, Number(e.at))), ex = X(i);
        line(s, ex, b.y + 0.55, 0, Y(v[i]) - b.y - 0.62, GREY, 1, "dash");
        txt(s, e.label, { x: ex - 1.2, y: b.y + (k % 2) * 0.28, w: 2.4, h: 0.5, fontSize: 12, bold: true, align: "center", fit: "shrink" });
      });
      if (sp.unit) txt(s, sp.unit, { x: b.x, y: py - 0.05, w: 0.7, h: 0.3, fontSize: 11, color: t.mid });
    },

    beforeAfter(sp) {
      // paired rows: each "before" point faces its "after" point, big type, KPI jumps at the bottom
      need(sp.before && sp.after, "beforeAfter needs before and after {heading, points}");
      const bp = sp.before.points || [], ap = sp.after.points || [], n = Math.max(bp.length, ap.length);
      need(n >= 2 && n <= 4, "beforeAfter needs 2-4 points per side (paired by position)");
      const ms = (sp.metrics || []).slice(0, 3), c = frame(sp), s = c.slide, b = body(c);
      const mW = ms.length ? 3.6 : 0, lw = (b.w - mW - 1.1) / 2, rx = b.x + lw + 0.9, headH = 0.6, rowH = (b.h - headH) / n;
      txt(s, sp.before.heading, { x: b.x, y: b.y, w: lw, h: headH, fontSize: 20, bold: true, color: GREY, valign: "middle" });
      txt(s, sp.after.heading, { x: rx, y: b.y, w: lw, h: headH, fontSize: 20, bold: true, color: t.primary, valign: "middle" });
      line(s, b.x, b.y + headH, b.w - mW - 0.2, 0, t.ink, 1.25);
      for (let i = 0; i < n; i++) {
        const Y = b.y + headH + i * rowH;
        if (i) line(s, b.x, Y, b.w - mW - 0.2, 0);
        txt(s, bp[i] || "", { x: b.x, y: Y, w: lw, h: rowH, fontSize: 19, color: t.mid, valign: "middle", fit: "shrink" });
        s.addShape(P.ShapeType.chevron, { x: b.x + lw + 0.3, y: Y + rowH / 2 - 0.2, w: 0.3, h: 0.4, fill: { color: t.primary }, line: { type: "none" } });
        txt(s, ap[i] || "", { x: rx, y: Y, w: lw, h: rowH, fontSize: 19, bold: true, valign: "middle", fit: "shrink" });
      }
      if (ms.length) {
        const X = b.x + b.w - mW, mh = b.h / ms.length;
        s.addShape(P.ShapeType.rect, { x: X, y: b.y, w: mW, h: b.h, fill: { color: t.dark }, line: { type: "none" } });
        ms.forEach((m, k) => {
          const Y = b.y + k * mh;
          if (k) line(s, X + 0.3, Y, mW - 0.6, 0, "FFFFFF", 0.75);
          txt(s, m.label, { x: X + 0.25, y: Y + 0.15, w: mW - 0.5, h: 0.4, fontSize: 14, color: "FFFFFF" });
          txt(s, [{ text: `${m.before}  →  `, options: { color: "C9CED6", fontSize: 22 } }, { text: String(m.after), options: { color: "FFFFFF", bold: true, fontSize: 34 } }],
            { x: X + 0.25, y: Y + 0.55, w: mW - 0.5, h: mh - 0.7, valign: "middle", fit: "shrink" });
        });
      }
    },

    compareTable(sp) {
      // feature matrix with big state markers; the highlighted item is the single filled column, scores at the bottom
      const f = sp.features || [], it = sp.items || [];
      need(f.length >= 3 && f.length <= 8 && it.length >= 2 && it.length <= 5, "compareTable needs 3-8 features and 2-5 items {name, marks}");
      it.forEach((x) => need((x.marks || []).length === f.length, `item "${x.name}" needs ${f.length} marks`));
      const c = frame(sp), s = c.slide, b = body(c), fW = 4.0, cw = (b.w - fW) / it.length, headH = 0.7, scoreH = 0.85;
      const rh = Math.min(0.85, (b.h - headH - scoreH - 0.45) / f.length), tableH = headH + rh * f.length + scoreH;
      const val = (m) => (m === "yes" ? 1 : m === "partial" ? 0.5 : m === "no" ? 0 : null);
      it.forEach((x, j) => {
        const hi = x.name === sp.highlight, X = b.x + fW + j * cw;
        if (hi) s.addShape(P.ShapeType.rect, { x: X + 0.08, y: b.y, w: cw - 0.16, h: tableH, fill: { color: t.primary }, line: { type: "none" } });
        txt(s, x.name, { x: X, y: b.y, w: cw, h: headH, fontSize: 18, bold: true, color: hi ? "FFFFFF" : t.ink, align: "center", valign: "middle", fit: "shrink" });
        const marks = x.marks.map((m) => val(String(m).toLowerCase())).filter((v) => v !== null);
        if (marks.length) {
          const sc = marks.reduce((a, v) => a + v, 0);
          txt(s, `${Number.isInteger(sc) ? sc : sc.toFixed(1)}/${marks.length}`, { x: X, y: b.y + headH + rh * f.length, w: cw, h: scoreH, fontSize: 26, bold: true, color: hi ? "FFFFFF" : t.ink, align: "center", valign: "middle" });
        }
      });
      f.forEach((fe, i) => {
        const Y = b.y + headH + i * rh;
        line(s, b.x, Y, fW - 0.1, 0);
        txt(s, fe, { x: b.x, y: Y, w: fW - 0.2, h: rh, fontSize: 17, valign: "middle", fit: "shrink" });
        it.forEach((x, j) => {
          const hi = x.name === sp.highlight, m = String(x.marks[i]).toLowerCase(), cx = b.x + fW + j * cw + cw / 2, cy = Y + rh / 2, r = Math.min(0.24, rh * 0.32);
          const on = hi ? "FFFFFF" : t.primary, off = hi ? "F3B6DB" : PALE;
          if (m === "yes" || m === "partial" || m === "no") {
            s.addShape(P.ShapeType.ellipse, { x: cx - r, y: cy - r, w: 2 * r, h: 2 * r, fill: { color: m === "no" ? (hi ? t.primary : "FFFFFF") : (hi ? t.primary : "FFFFFF") }, line: { color: m === "no" ? off : on, width: 1.75 } });
            if (m === "yes") s.addShape(P.ShapeType.ellipse, { x: cx - r, y: cy - r, w: 2 * r, h: 2 * r, fill: { color: on }, line: { type: "none" } });
            if (m === "partial") s.addShape(P.ShapeType.pie, { x: cx - r, y: cy - r, w: 2 * r, h: 2 * r, fill: { color: on }, line: { type: "none" }, angleRange: [270, 90] });
          } else txt(s, String(x.marks[i]), { x: cx - cw / 2 + 0.08, y: Y, w: cw - 0.16, h: rh, fontSize: 15, bold: true, color: hi ? "FFFFFF" : t.ink, align: "center", valign: "middle", fit: "shrink" });
        });
      });
      const Ys = b.y + headH + f.length * rh;
      line(s, b.x, Ys, fW - 0.1, 0, t.ink, 1.25);
      txt(s, "Score", { x: b.x, y: Ys, w: fW - 0.2, h: scoreH, fontSize: 17, bold: true, valign: "middle" });
      const lx = b.x;
      [["yes", "Full"], ["partial", "Partial"], ["no", "None"]].forEach(([m, l], k) => {
        const cx = lx + 0.15 + k * 1.3, cy = b.y + tableH + 0.25, r = 0.1;
        s.addShape(P.ShapeType.ellipse, { x: cx - r, y: cy - r, w: 2 * r, h: 2 * r, fill: { color: m === "yes" ? t.primary : "FFFFFF" }, line: { color: m === "no" ? PALE : t.primary, width: 1.25 } });
        if (m === "partial") s.addShape(P.ShapeType.pie, { x: cx - r, y: cy - r, w: 2 * r, h: 2 * r, fill: { color: t.primary }, line: { type: "none" }, angleRange: [270, 90] });
        txt(s, l, { x: cx + 0.18, y: cy - 0.14, w: 0.9, h: 0.28, fontSize: 12, color: t.mid });
      });
    },

    heatmap(sp) {
      const rl = sp.rows || [], cl = sp.cols || [], m = sp.values || [];
      need(rl.length >= 2 && rl.length <= 8 && cl.length >= 2 && cl.length <= 7, "heatmap needs 2-8 rows and 2-7 cols");
      need(m.length === rl.length && m.every((r) => r.length === cl.length), "heatmap values must be rows x cols");
      const flat = m.flat().map(Number), lo = Math.min(...flat), hi = Math.max(...flat);
      const shade = (v) => { const f = hi === lo ? 0.5 : (v - lo) / (hi - lo), g = sp.higherIsBetter === false ? 1 - f : f;
        return [[0xF4, 0xC7], [0xC7, 0xE6], [0xC3, 0xC9]].map(([a, z]) => Math.round(a + (z - a) * g).toString(16).padStart(2, "0")).join("").toUpperCase(); };
      const c = frame(sp), s = c.slide, b = body(c);
      const head = [{ text: sp.corner || "", options: { bold: true } }].concat(cl.map((x) => ({ text: String(x), options: { bold: true, align: "center" } })));
      const rows = [head].concat(rl.map((r, i) => [{ text: String(r), options: { bold: true } }].concat(m[i].map((v) => ({ text: `${v}${sp.unit || ""}`, options: { fill: { color: shade(Number(v)) }, align: "center" } })))));
      s.addTable(rows, { x: b.x, y: b.y, w: b.w, fontFace: FONT, fontSize: 17, rowH: Math.min(0.9, b.h / (rl.length + 1)), border: { type: "solid", color: "FFFFFF", pt: 2 }, valign: "middle", autoPage: false });
    },

    milestones(sp) {
      const ev = sp.events || [];
      need(ev.length >= 4 && ev.length <= 8, "milestones needs 4-8 events {date, label, note?, highlight?}");
      const c = frame(sp), s = c.slide, b = body(c), Y = b.y + b.h / 2, step = (b.w - 0.4) / (ev.length - 1);
      line(s, b.x, Y, b.w, 0, t.dark, 2.5);
      ev.forEach((e, i) => {
        const X = b.x + 0.2 + i * step, up = i % 2 === 0, hi = !!e.highlight, r = hi ? 0.2 : 0.13;
        s.addShape(P.ShapeType.ellipse, { x: X - r, y: Y - r, w: 2 * r, h: 2 * r, fill: { color: hi ? t.primary : "FFFFFF" }, line: { color: t.dark, width: 2 } });
        line(s, X, up ? Y - 0.9 : Y + r, 0, 0.9 - r, GREY);
        const bw = Math.min(2.6, step * 1.8), bx = Math.max(b.x, Math.min(X - bw / 2, b.x + b.w - bw));
        txt(s, [{ text: String(e.date), options: { bold: true, color: t.primary, breakLine: true, fontSize: 16 } }, { text: e.label, options: { bold: true, breakLine: !!e.note } }, ...(e.note ? [{ text: e.note, options: { color: t.mid, fontSize: 12 } }] : [])],
          { x: bx, y: up ? b.y : Y + 0.95, w: bw, h: up ? Y - 0.95 - b.y : b.y + b.h - Y - 0.95, fontSize: 14, align: "center", valign: up ? "bottom" : "top", fit: "shrink" });
      });
    },
  };
}
module.exports = { mk3 };
