// deckforge consulting archetypes, batch 2 (2026-10-09). Modelled on the
// standard consulting slide library (key trends, Harvey-ball option
// evaluation, RAG status, issue/driver tree, positioning bubble map, SWOT,
// phased roadmap) plus the appendix family (methodology, calculation,
// assumptions, sensitivity grid). All draw inside d.custom(), so they get
// the engine frame (kicker, action title, takeaway band, source, footer).
const RED = "C62828", AMBER = "E0A100", GREEN = "2E7D32", GREY = "8A94A6", PALE = "E6EBF2";

function mk2(d) {
  const { FONT } = require("../engine/deck");
  const t = d.t, P = d.p;
  const txt = (s, text, o) => s.addText(text, { fontFace: FONT, margin: 0, color: t.ink, valign: "top", ...o });
  const frame = (sp) => d.custom({ title: sp.title, kicker: sp.kicker, takeaway: sp.takeaway, source: sp.source });
  const body = (c) => ({ x: c.grid.ml, y: c.grid.bodyY, w: c.grid.contentW, h: c.grid.bodyH });
  const rag = (v) => ({ green: GREEN, g: GREEN, amber: AMBER, a: AMBER, yellow: AMBER, red: RED, r: RED }[String(v || "").toLowerCase()] || GREY);
  const need = (cond, msg) => { if (!cond) throw new Error(msg); };
  const rect = (s, x, y, w, h, fill, line) => s.addShape(P.ShapeType.rect, { x, y, w, h, fill: { color: fill }, line: line ? { color: line, width: 1 } : { type: "none" } });

  function harvey(s, cx, cy, r, score) {
    // 0-4 Harvey ball: outline circle + filled pie slice
    s.addShape(P.ShapeType.ellipse, { x: cx - r, y: cy - r, w: 2 * r, h: 2 * r, fill: { color: "FFFFFF" }, line: { color: t.primary, width: 1.25 } });
    const q = Math.max(0, Math.min(4, Number(score) || 0));
    if (q === 4) s.addShape(P.ShapeType.ellipse, { x: cx - r, y: cy - r, w: 2 * r, h: 2 * r, fill: { color: t.primary }, line: { color: t.primary, width: 1.25 } });
    else if (q > 0) s.addShape(P.ShapeType.pie, { x: cx - r, y: cy - r, w: 2 * r, h: 2 * r, fill: { color: t.primary }, line: { type: "none" }, angleRange: [270, (270 + 90 * q) % 360] });
  }

  return {
    keyTrends(sp) {
      const items = sp.items || [];
      need(items.length >= 3 && items.length <= 5, "keyTrends needs 3-5 items");
      const c = frame(sp), s = c.slide, b = body(c), gap = 0.25, w = (b.w - gap * (items.length - 1)) / items.length;
      items.forEach((it, i) => {
        const x = b.x + i * (w + gap);
        if (i > 0) s.addShape(P.ShapeType.line, { x: x - gap / 2, y: b.y + 0.3, w: 0, h: b.h - 0.6, line: { color: PALE, width: 1 } });
        s.addShape(P.ShapeType.ellipse, { x: x + w / 2 - 0.4, y: b.y + 0.4, w: 0.8, h: 0.8, fill: { color: t.primary }, line: { type: "none" } });
        txt(s, String(i + 1), { x: x + w / 2 - 0.4, y: b.y + 0.4, w: 0.8, h: 0.8, fontSize: 24, bold: true, color: t.onAccent || "FFFFFF", align: "center", valign: "middle" });
        txt(s, it.heading, { x: x + 0.1, y: b.y + 1.4, w: w - 0.2, h: 0.85, fontSize: 19, bold: true, align: "center", valign: "middle", fit: "shrink" });
        if (it.stat) txt(s, it.stat, { x: x + 0.1, y: b.y + 2.3, w: w - 0.2, h: 0.8, fontSize: 34, bold: true, color: t.primary, align: "center", valign: "middle", fit: "shrink" });
        const ty = b.y + (it.stat ? 3.2 : 2.4);
        txt(s, it.text, { x: x + 0.15, y: ty, w: w - 0.3, h: b.y + b.h - 0.2 - ty, fontSize: 16, color: t.mid, align: "center", fit: "shrink" });
      });
    },

    harveyTable(sp) {
      const crit = sp.criteria || [], opts = sp.options || [];
      need(crit.length >= 2 && crit.length <= 6, "harveyTable needs 2-6 criteria");
      need(opts.length >= 2 && opts.length <= 6, "harveyTable needs 2-6 options");
      opts.forEach((o) => need((o.scores || []).length === crit.length, `option "${o.name}" needs ${crit.length} scores (0-4)`));
      const c = frame(sp), s = c.slide, b = body(c), nameW = 3.2, noteW = sp.options.some((o) => o.note) ? 3.2 : 0;
      const colW = (b.w - nameW - noteW) / crit.length, headH = 0.7, rowH = Math.min(1.15, (b.h - headH - 0.55) / opts.length);
      crit.forEach((cr, j) => txt(s, cr, { x: b.x + nameW + j * colW, y: b.y, w: colW, h: headH, fontSize: 15, bold: true, align: "center", valign: "bottom", fit: "shrink" }));
      if (noteW) txt(s, "Comment", { x: b.x + nameW + crit.length * colW + 0.15, y: b.y, w: noteW - 0.15, h: headH, fontSize: 13, bold: true, valign: "bottom" });
      opts.forEach((o, i) => {
        const y = b.y + headH + 0.1 + i * rowH;
        if (i % 2 === 0) rect(s, b.x, y, b.w, rowH, t.wash);
        txt(s, o.name, { x: b.x + 0.1, y, w: nameW - 0.2, h: rowH, fontSize: 16, bold: true, valign: "middle", fit: "shrink" });
        o.scores.forEach((v, j) => harvey(s, b.x + nameW + j * colW + colW / 2, y + rowH / 2, Math.min(0.27, rowH * 0.3), v));
        if (noteW && o.note) txt(s, o.note, { x: b.x + nameW + crit.length * colW + 0.15, y, w: noteW - 0.2, h: rowH, fontSize: 14, color: t.mid, valign: "middle", fit: "shrink" });
      });
      const ly = b.y + headH + 0.15 + opts.length * rowH;
      [0, 1, 2, 3, 4].forEach((q, k) => harvey(s, b.x + 0.25 + k * 1.3, ly + 0.22, 0.14, q));
      [0, 1, 2, 3, 4].forEach((q, k) => txt(s, ["None", "Low", "Medium", "High", "Full"][k], { x: b.x + 0.47 + k * 1.3, y: ly + 0.08, w: 0.9, h: 0.3, fontSize: 12, color: t.mid }));
    },

    statusTable(sp) {
      const cols = sp.columns || [], rows = sp.rows || [];
      need(rows.length >= 2 && rows.length <= 7, "statusTable needs 2-7 rows");
      const c = frame(sp), s = c.slide, b = body(c), itemW = 3.2, statW = 1.1;
      const colW = cols.length ? (b.w - itemW - statW) / cols.length : 0, headH = 0.6, rowH = Math.min(1.1, (b.h - headH) / rows.length);
      rect(s, b.x, b.y, b.w, headH, t.dark);
      txt(s, sp.itemHeader || "Item", { x: b.x + 0.1, y: b.y, w: itemW, h: headH, fontSize: 13, bold: true, color: t.onDark, valign: "middle" });
      txt(s, "Status", { x: b.x + itemW, y: b.y, w: statW, h: headH, fontSize: 13, bold: true, color: t.onDark, valign: "middle", align: "center" });
      cols.forEach((h, j) => txt(s, h, { x: b.x + itemW + statW + j * colW + 0.1, y: b.y, w: colW - 0.2, h: headH, fontSize: 13, bold: true, color: t.onDark, valign: "middle" }));
      rows.forEach((r, i) => {
        const y = b.y + headH + i * rowH;
        if (i % 2) rect(s, b.x, y, b.w, rowH, t.wash);
        txt(s, r.item, { x: b.x + 0.1, y, w: itemW - 0.2, h: rowH, fontSize: 16, bold: true, valign: "middle", fit: "shrink" });
        s.addShape(P.ShapeType.ellipse, { x: b.x + itemW + statW / 2 - 0.19, y: y + rowH / 2 - 0.19, w: 0.38, h: 0.38, fill: { color: rag(r.status) }, line: { type: "none" } });
        (r.cells || []).slice(0, cols.length).forEach((v, j) => txt(s, String(v), { x: b.x + itemW + statW + j * colW + 0.1, y, w: colW - 0.2, h: rowH, fontSize: 15, color: t.mid, valign: "middle", fit: "shrink" }));
      });
    },

    issueTree(sp) {
      const br = sp.branches || [];
      need(sp.root && br.length >= 2 && br.length <= 4, "issueTree needs root and 2-4 branches");
      const c = frame(sp), s = c.slide, b = body(c), rootW = 2.6, brW = 3.3, leafX = b.x + rootW + brW + 0.9, leafW = b.x + b.w - leafX - 0.25;
      const slotH = b.h / br.length, rootY = b.y + b.h / 2 - 0.6;
      rect(s, b.x, rootY, rootW, 1.2, t.dark);
      txt(s, [{ text: sp.root, options: { breakLine: !!sp.rootValue } }, ...(sp.rootValue ? [{ text: sp.rootValue, options: { bold: true, fontSize: 18 } }] : [])],
        { x: b.x + 0.1, y: rootY, w: rootW - 0.2, h: 1.2, fontSize: 14, bold: true, color: t.onDark, align: "center", valign: "middle", fit: "shrink" });
      const lineX = b.x + rootW + 0.3;
      s.addShape(P.ShapeType.line, { x: b.x + rootW, y: rootY + 0.6, w: 0.3, h: 0, line: { color: GREY, width: 1.25 } });
      s.addShape(P.ShapeType.line, { x: lineX, y: b.y + slotH / 2, w: 0, h: slotH * (br.length - 1), line: { color: GREY, width: 1.25 } });
      br.forEach((bn, i) => {
        const cy = b.y + slotH * i + slotH / 2, bx = lineX + 0.3;
        s.addShape(P.ShapeType.line, { x: lineX, y: cy, w: 0.3, h: 0, line: { color: GREY, width: 1.25 } });
        rect(s, bx, cy - 0.42, brW, 0.84, t.wash, t.primary);
        txt(s, [{ text: bn.label, options: { bold: true, breakLine: !!bn.value } }, ...(bn.value ? [{ text: bn.value, options: { color: t.primary, bold: true } }] : [])],
          { x: bx + 0.12, y: cy - 0.42, w: brW - 0.24, h: 0.84, fontSize: 15, valign: "middle", fit: "shrink" });
        s.addShape(P.ShapeType.line, { x: bx + brW, y: cy, w: 0.3, h: 0, line: { color: GREY, width: 1 } });
        txt(s, (bn.leaves || []).slice(0, 3).map((l, k, a) => ({ text: l, options: { bullet: true, breakLine: k < a.length - 1 } })),
          { x: leafX, y: cy - slotH / 2 + 0.08, w: leafW, h: slotH - 0.16, fontSize: 14, color: t.ink, valign: "middle", fit: "shrink" });
      });
    },

    bubbleMatrix(sp) {
      const items = sp.items || [], xa = sp.xAxis || {}, ya = sp.yAxis || {};
      need(items.length >= 3 && items.length <= 10, "bubbleMatrix needs 3-10 items");
      const c = frame(sp), s = c.slide, b = body(c), px = b.x + 0.9, py = b.y + 0.05, pw = b.w - 1.2, ph = b.h - 0.75;
      const [x0, x1] = [xa.min ?? 0, xa.max ?? 10], [y0, y1] = [ya.min ?? 0, ya.max ?? 10];
      s.addShape(P.ShapeType.line, { x: px + pw / 2, y: py, w: 0, h: ph, line: { color: GREY, width: 0.75, dashType: "dash" } });
      s.addShape(P.ShapeType.line, { x: px, y: py + ph / 2, w: pw, h: 0, line: { color: GREY, width: 0.75, dashType: "dash" } });
      s.addShape(P.ShapeType.line, { x: px, y: py + ph, w: pw, h: 0, line: { color: t.ink, width: 1.25 } });
      s.addShape(P.ShapeType.line, { x: px, y: py, w: 0, h: ph, line: { color: t.ink, width: 1.25 } });
      txt(s, `${xa.label || ""} →`, { x: px, y: py + ph + 0.1, w: pw, h: 0.3, fontSize: 12, bold: true, align: "right" });
      txt(s, `${ya.label || ""} →`, { x: b.x + 0.35 - ph / 2, y: py + ph / 2 - 0.17, w: ph, h: 0.34, fontSize: 13, bold: true, rotate: 270, align: "center" });
      (sp.quadrantLabels || []).slice(0, 4).forEach((q, k) => txt(s, q, { x: px + (k % 2) * pw / 2 + 0.1, y: k < 2 ? py + 0.08 : py + ph - 0.38, w: pw / 2 - 0.2, h: 0.3, fontSize: 13, bold: true, color: GREY, align: k % 2 ? "right" : "left" }));
      const maxSize = Math.max(...items.map((it) => it.size || 1));
      items.forEach((it) => {
        const r = 0.16 + 0.32 * Math.sqrt((it.size || 1) / maxSize);
        const cx = px + pw * ((it.x - x0) / (x1 - x0)), cy = py + ph * (1 - (it.y - y0) / (y1 - y0));
        s.addShape(P.ShapeType.ellipse, { x: cx - r, y: cy - r, w: 2 * r, h: 2 * r, fill: { color: it.highlight ? t.primary : GREY, transparency: 20 }, line: { color: "FFFFFF", width: 1 } });
        txt(s, it.label, { x: cx + r + 0.04, y: cy - 0.15, w: 2.4, h: 0.32, fontSize: 13.5, bold: !!it.highlight, valign: "middle" });
      });
    },

    swot(sp) {
      const q = [["Strengths", sp.strengths, GREEN], ["Weaknesses", sp.weaknesses, RED], ["Opportunities", sp.opportunities, t.primary], ["Threats", sp.threats, AMBER]];
      q.forEach(([n, v]) => need(Array.isArray(v) && v.length >= 2 && v.length <= 4, `swot ${n.toLowerCase()} needs 2-4 points`));
      const c = frame(sp), s = c.slide, b = body(c), w = (b.w - 0.2) / 2, h = (b.h - 0.2) / 2;
      s.addShape(P.ShapeType.line, { x: b.x + b.w / 2, y: b.y, w: 0, h: b.h, line: { color: GREY, width: 1 } });
      s.addShape(P.ShapeType.line, { x: b.x, y: b.y + b.h / 2, w: b.w, h: 0, line: { color: GREY, width: 1 } });
      q.forEach(([name, pts, col], k) => {
        const x = b.x + (k % 2) * (w + 0.2), y = b.y + Math.floor(k / 2) * (h + 0.2);
        txt(s, name, { x: x + 0.2, y: y + 0.1, w: w - 0.4, h: 0.4, fontSize: 18, bold: true, color: col });
        txt(s, pts.map((p_, i) => ({ text: p_, options: { bullet: true, breakLine: i < pts.length - 1 } })), { x: x + 0.3, y: y + 0.55, w: w - 0.45, h: h - 0.65, fontSize: 16, fit: "shrink" });
      });
    },

    roadmap(sp) {
      const ph_ = sp.phases || [];
      need(ph_.length >= 3 && ph_.length <= 5, "roadmap needs 3-5 phases");
      const c = frame(sp), s = c.slide, b = body(c), gap = 0.12, w = (b.w - gap * (ph_.length - 1)) / ph_.length;
      ph_.forEach((p_, i) => {
        const x = b.x + i * (w + gap);
        s.addShape(i === 0 ? P.ShapeType.homePlate : P.ShapeType.chevron, { x, y: b.y, w, h: 0.75, fill: { color: i === ph_.length - 1 ? t.dark : t.primary }, line: { type: "none" } });
        txt(s, [{ text: p_.label, options: { bold: true, breakLine: true } }, { text: p_.period || "", options: { fontSize: 13 } }],
          { x: x + 0.3, y: b.y, w: w - 0.55, h: 0.75, fontSize: 16, color: "FFFFFF", valign: "middle", fit: "shrink" });
        if (i > 0) s.addShape(P.ShapeType.line, { x: x - gap / 2, y: b.y + 0.95, w: 0, h: b.h - (sp.milestone ? 1.5 : 1.0), line: { color: PALE, width: 1 } });
        const its = (p_.items || []).slice(0, 4);
        txt(s, its.map((it, k) => ({ text: it, options: { bullet: true, breakLine: k < its.length - 1, paraSpaceAfter: 6 } })),
          { x: x + 0.12, y: b.y + 1.0, w: w - 0.3, h: b.h - (sp.milestone ? 1.65 : 1.15), fontSize: 16, fit: "shrink" });
      });
      if (sp.milestone) {
        const y = b.y + b.h - 0.42;
        s.addShape(P.ShapeType.diamond, { x: b.x, y, w: 0.35, h: 0.35, fill: { color: RED }, line: { type: "none" } });
        txt(s, sp.milestone, { x: b.x + 0.5, y, w: b.w - 0.5, h: 0.35, fontSize: 15, bold: true, valign: "middle" });
      }
    },

    callout(sp) {
      need(sp.quote, "callout needs quote");
      const c = frame(sp), s = c.slide, b = body(c);
      rect(s, b.x, b.y + 0.2, 0.15, b.h - 0.6, t.primary);
      txt(s, `“${sp.quote}”`, { x: b.x + 0.5, y: b.y + 0.2, w: b.w - 4.2, h: b.h - 1.3, fontSize: 24, italic: true, valign: "middle", fit: "shrink" });
      txt(s, sp.author ? `${sp.author}${sp.role ? ", " + sp.role : ""}` : "", { x: b.x + 0.5, y: b.y + b.h - 1.0, w: b.w - 4.2, h: 0.4, fontSize: 16, bold: true, color: t.mid });
      const pts = sp.points || [];
      rect(s, b.x + b.w - 3.4, b.y + 0.2, 3.4, b.h - 0.6, t.wash);
      txt(s, [{ text: sp.pointsHeading || "What it tells us", options: { bold: true, breakLine: true, color: t.primary } },
              ...pts.map((p_, i) => ({ text: p_, options: { bullet: true, breakLine: i < pts.length - 1 } }))],
        { x: b.x + b.w - 3.25, y: b.y + 0.35, w: 3.1, h: b.h - 0.9, fontSize: 16, fit: "shrink" });
    },

    // ---- appendix family ---------------------------------------------------
    methodology(sp) {
      const st = sp.steps || [];
      need(st.length >= 3 && st.length <= 5, "methodology needs 3-5 steps");
      const c = frame(sp), s = c.slide, b = body(c), srcH = sp.dataSources ? 0.9 : 0, rowH = (b.h - srcH) / st.length;
      st.forEach((x, i) => {
        const y = b.y + i * rowH;
        s.addShape(P.ShapeType.ellipse, { x: b.x, y: y + rowH / 2 - 0.25, w: 0.5, h: 0.5, fill: { color: t.primary }, line: { type: "none" } });
        txt(s, String(i + 1), { x: b.x, y: y + rowH / 2 - 0.25, w: 0.5, h: 0.5, fontSize: 15, bold: true, color: "FFFFFF", align: "center", valign: "middle" });
        txt(s, x.label, { x: b.x + 0.7, y, w: 3.0, h: rowH, fontSize: 17, bold: true, valign: "middle", fit: "shrink" });
        txt(s, x.detail, { x: b.x + 3.85, y, w: b.w - 3.85, h: rowH, fontSize: 15, color: t.ink, valign: "middle", fit: "shrink" });
        if (i < st.length - 1) s.addShape(P.ShapeType.line, { x: b.x + 0.7, y: y + rowH, w: b.w - 0.7, h: 0, line: { color: PALE, width: 1 } });
      });
      if (sp.dataSources) txt(s, [{ text: "Data sources: ", options: { bold: true } }, { text: sp.dataSources.join("; ") }],
        { x: b.x, y: b.y + b.h - srcH + 0.1, w: b.w, h: srcH - 0.1, fontSize: 13, color: t.mid, fit: "shrink" });
    },

    calcTable(sp) {
      const rows = sp.rows || [];
      need(rows.length >= 3 && rows.length <= 10 && rows[0].length >= 2 && rows[0].length <= 5, "calcTable needs 3-10 rows (incl. header) of 2-5 columns");
      const c = frame(sp), s = c.slide, b = body(c), fH = sp.formula ? 0.8 : 0;
      const tbl = rows.map((r, i) => r.map((v) => ({ text: String(v), options: { bold: i === 0 || (sp.totalRow && i === rows.length - 1), color: i === 0 ? "FFFFFF" : t.ink, fill: { color: i === 0 ? t.dark : (sp.totalRow && i === rows.length - 1 ? PALE : (i % 2 ? "FFFFFF" : t.wash)) } } })));
      s.addTable(tbl, { x: b.x, y: b.y, w: b.w, fontFace: FONT, fontSize: 15, rowH: Math.min(0.62, (b.h - fH - 0.25) / rows.length), border: { type: "solid", color: PALE, pt: 0.75 }, valign: "middle", autoPage: false });
      if (sp.formula) {
        rect(s, b.x, b.y + b.h - fH, b.w, fH, t.wash, t.primary);
        txt(s, [{ text: "Calculation: ", options: { bold: true, color: t.primary } }, { text: sp.formula }], { x: b.x + 0.15, y: b.y + b.h - fH, w: b.w - 0.3, h: fH, fontSize: 15, valign: "middle", fit: "shrink" });
      }
    },

    assumptions(sp) {
      const rows = sp.rows || [];
      need(rows.length >= 3 && rows.length <= 8, "assumptions needs 3-8 rows {assumption, value, basis}");
      const tbl = [["Assumption", "Value used", "Basis / rationale"].map((h) => ({ text: h, options: { bold: true, color: "FFFFFF", fill: { color: d.t.dark } } }))]
        .concat(rows.map((r, i) => [r.assumption, r.value, r.basis].map((v, j) => ({ text: String(v ?? ""), options: { bold: j === 1, color: j === 1 ? d.t.primary : d.t.ink, fill: { color: i % 2 ? "FFFFFF" : d.t.wash } } }))));
      const c = frame(sp), s = c.slide, b = body(c);
      s.addTable(tbl, { x: b.x, y: b.y, w: b.w, colW: [b.w * 0.34, b.w * 0.16, b.w * 0.5], fontFace: FONT, fontSize: 15, rowH: Math.min(0.85, b.h / (rows.length + 1)), border: { type: "solid", color: PALE, pt: 0.75 }, valign: "middle", autoPage: false });
    },

    sensitivity(sp) {
      const rv = sp.rowValues || [], cv = sp.colValues || [], m = sp.matrix || [];
      need(rv.length >= 3 && rv.length <= 6 && cv.length >= 3 && cv.length <= 6, "sensitivity needs 3-6 rowValues and colValues");
      need(m.length === rv.length && m.every((r) => r.length === cv.length), "sensitivity matrix must be rowValues x colValues");
      const c = frame(sp), s = c.slide, b = body(c), flat = m.flat().map(Number), lo = Math.min(...flat), hi = Math.max(...flat);
      const shade = (v) => {
        const f = hi === lo ? 0.5 : (v - lo) / (hi - lo), good = sp.higherIsBetter !== false ? f : 1 - f;
        const mix = (a, z) => Math.round(a + (z - a) * good);
        const [r1, g1, b1] = [0xF4, 0xC7, 0xC3], [r2, g2, b2] = [0xC8, 0xE6, 0xC9];
        return [mix(r1, r2), mix(g1, g2), mix(b1, b2)].map((x) => x.toString(16).padStart(2, "0")).join("").toUpperCase();
      };
      const head = [{ text: `${sp.rowVar} \\ ${sp.colVar}`, options: { bold: true, color: "FFFFFF", fill: { color: d.t.dark }, fontSize: 11 } }]
        .concat(cv.map((v) => ({ text: String(v), options: { bold: true, color: "FFFFFF", fill: { color: d.t.dark } } })));
      const tbl = [head].concat(rv.map((r, i) => [{ text: String(r), options: { bold: true, fill: { color: d.t.wash } } }]
        .concat(m[i].map((v, j) => ({ text: `${v}${sp.unit || ""}`, options: { bold: sp.base && sp.base[0] === i && sp.base[1] === j, fill: { color: shade(Number(v)) }, align: "center" } })))));
      s.addTable(tbl, { x: b.x + 1.0, y: b.y + 0.2, w: b.w - 2.0, fontFace: FONT, fontSize: 16, rowH: Math.min(0.8, (b.h - 0.8) / (rv.length + 1)), border: { type: "solid", color: "FFFFFF", pt: 1.5 }, valign: "middle", autoPage: false });
      if (sp.base) txt(s, "Bold cell = base case used in the main deck", { x: b.x + 1.0, y: b.y + b.h - 0.4, w: b.w - 2, h: 0.3, fontSize: 11, color: t.mid, italic: true });
    },
  };
}
module.exports = { mk2 };
