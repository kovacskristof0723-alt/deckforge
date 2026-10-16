// deckforge visual components: the Richter deck's custom visuals (2026-09-26),
// generalised so a model can pick them by name and fill them with data instead
// of placing shapes by coordinates. Every component draws inside d.custom(),
// so it inherits the engine's frame: kicker, action title, takeaway band,
// source line, footer, logo.
//
// Semantic colours are fixed (red = bad/high, amber = medium, green =
// good/low); everything else comes from the brand theme.
const RED = "C62828", AMBER = "E0A100", GREEN = "2E7D32", GREY = "8A94A6", PALE = "C9D3E3";

function mk(d) {
  const { FONT } = require("../engine/deck");
  const t = d.t;
  const txt = (s, text, o) => s.addText(text, { fontFace: FONT, margin: 0, color: t.ink, valign: "top", ...o });
  const frame = (spec) => d.custom({ title: spec.title, kicker: spec.kicker, takeaway: spec.takeaway, source: spec.source });
  const lvl = (l) => {
    const v = String(l || "").toLowerCase();
    if (v.startsWith("high")) return RED;
    if (v.startsWith("low") && !v.includes("medium")) return GREEN;
    return AMBER;
  };

  // ---- panel kinds, used by `panels` -------------------------------------
  const PANEL = {
    doughnut(c, x, y, w, h, p) {
      c.slide.addChart(d.p.ChartType.doughnut, [{ name: p.heading || "Share", labels: p.labels, values: p.values }], {
        x: x + 0.1, y, w: w - 0.2, h, holeSize: 55,
        chartColors: [t.primary, PALE, GREY, "6D8FC7"].slice(0, p.values.length),
        showPercent: true, showValue: false, showLegend: true, legendPos: w > 4 ? "r" : "b", legendFontSize: 13,
        legendFontFace: FONT, dataLabelFontSize: 14, dataLabelFontBold: true, dataLabelColor: "FFFFFF", dataLabelFontFace: FONT,
      });
    },
    countdown(c, x, y, w, h, p) {
      // a time bar: elapsed part pale, remaining part red, deadline labelled
      const s = c.slide, barX = x + 0.3, barW = w - 0.6, barY = y + Math.max(0, (h - 1.2) / 2);
      const span = p.to - p.from, nowX = barX + barW * ((p.now - p.from) / span);
      s.addShape(d.p.ShapeType.rect, { x: barX, y: barY, w: nowX - barX, h: 0.42, fill: { color: PALE }, line: { type: "none" } });
      s.addShape(d.p.ShapeType.rect, { x: nowX, y: barY, w: barX + barW - nowX, h: 0.42, fill: { color: RED }, line: { type: "none" } });
      if (p.remainingLabel)
        txt(s, p.remainingLabel, { x: nowX, y: barY + 0.07, w: barX + barW - nowX, h: 0.3, fontSize: 14, bold: true, color: "FFFFFF", align: "center", fit: "shrink" });
      // "now" label above the bar at the now marker, deadline below the bar end:
      // separate rows, so they never collide even in a narrow panel
      s.addShape(d.p.ShapeType.line, { x: nowX, y: barY - 0.12, w: 0, h: 0.66, line: { color: t.dark, width: 1.5 } });
      txt(s, p.nowLabel || "Today", { x: Math.max(x + 0.1, Math.min(nowX - 0.9, x + w - 1.9)), y: barY - 0.42, w: 1.8, h: 0.25, fontSize: 12, color: t.mid, align: "center" });
      txt(s, p.toLabel || String(p.to), { x: barX + barW - 1.8, y: barY + 0.52, w: 1.8, h: 0.25, fontSize: 12, bold: true, color: RED, align: "right" });
      if (p.fromLabel) txt(s, p.fromLabel, { x: barX, y: barY + 0.52, w: 1.4, h: 0.25, fontSize: 12, color: t.mid });
    },
    bars(c, x, y, w, h, p) {
      const n = p.values.length, hl = p.highlight;
      const colors = p.values.map((v, i) => (hl === undefined ? t.primary : i === hl ? t.primary : PALE));
      c.slide.addChart(d.p.ChartType.bar, [{ name: p.heading || "Value", labels: p.labels, values: p.values }], {
        x: x + 0.1, y, w: w - 0.2, h, barDir: n > 4 ? "bar" : "col", catAxisOrientation: n > 4 ? "maxMin" : "minMax",
        chartColors: colors, varyColors: true, showValue: true, dataLabelFormatCode: p.numFmt || "0.0",
        dataLabelFontSize: 14, dataLabelFontBold: true, dataLabelColor: t.dark, dataLabelFontFace: FONT, dataLabelPosition: "outEnd",
        valAxisHidden: true, valAxisMinVal: Math.min(0, ...p.values) * 1.3, valAxisMaxVal: Math.max(...p.values) * 1.3,
        catAxisLabelPos: "low", catAxisLabelFontSize: 13, catAxisLabelColor: t.mid, catAxisLabelFontFace: FONT,
        valGridLine: { style: "none" }, showLegend: false, barGapWidthPct: 50,
      });
    },
    gauge(c, x, y, w, h, p) {
      // vertical bar: today filled, target as a dashed line
      const s = c.slide, max = p.max || Math.max(p.today, p.target) * 1.25;
      // bar on the left third, labels take the rest of the panel width
      const bw = Math.min(0.85, w * 0.22), bx = x + Math.max(0.25, w * 0.08), by = y + 0.15, bh = h - 0.3;
      const lx = bx + bw + 0.15, lw = x + w - 0.15 - lx;
      const yAt = (v) => by + bh * (1 - v / max);
      const good = p.direction === "down" ? p.today <= p.target : p.today >= p.target;
      const unit = p.unit ? (/^[%x]/.test(p.unit) ? p.unit : " " + p.unit) : "";
      s.addShape(d.p.ShapeType.rect, { x: bx, y: by, w: bw, h: bh, fill: { color: "F1F4F8" }, line: { color: PALE, width: 1 } });
      s.addShape(d.p.ShapeType.rect, { x: bx, y: yAt(p.today), w: bw, h: by + bh - yAt(p.today), fill: { color: good ? GREEN : t.primary }, line: { type: "none" } });
      s.addShape(d.p.ShapeType.line, { x: bx - 0.1, y: yAt(p.target), w: bw + 0.2, h: 0, line: { color: GREEN, width: 3, dashType: "dash" } });
      // keep the two labels at least 0.45in apart so they never overlap
      let ty = yAt(p.target) - 0.2, vy = Math.min(yAt(p.today) - 0.2, by + bh - 0.4);
      if (Math.abs(ty - vy) < 0.45) { if (ty <= vy) vy = ty + 0.45; else ty = vy + 0.45; }
      txt(s, `${p.targetLabel || "Target"} ${p.target}${unit}`, { x: lx, y: ty, w: lw, h: 0.4, fontSize: 14, fit: "shrink", bold: true, color: GREEN, valign: "middle" });
      txt(s, `${p.todayLabel || "Today"} ${p.today}${unit}`, { x: lx, y: vy, w: lw, h: 0.4, fontSize: 14, fit: "shrink", bold: true, color: good ? GREEN : t.primary, valign: "middle" });
    },
  };

  // ---- slide components ---------------------------------------------------
  return {
    // 2-4 side-by-side boxed panels, each one visual (doughnut, countdown, bars, gauge)
    panels(spec) {
      const c = frame(spec), G = c.grid, ps = spec.panels;
      const gap = 0.3, w = (G.contentW - gap * (ps.length - 1)) / ps.length, top = G.bodyY, h = G.bodyH;
      ps.forEach((p, i) => {
        const x = G.ml + i * (w + gap);
        c.box(x, top, w, h);
        txt(c.slide, p.heading, { x: x + 0.2, y: top + 0.15, w: w - 0.4, h: 0.55, fontSize: 14, bold: true, color: t.dark, fit: "shrink" });
        const vy = top + 0.75, vh = h - 0.85 - (p.note ? 0.45 : 0);
        if (!PANEL[p.kind]) throw new Error(`unknown panel kind "${p.kind}"`);
        PANEL[p.kind](c, x, vy, w, vh, p);
        if (p.note) txt(c.slide, p.note, { x: x + 0.2, y: top + h - 0.5, w: w - 0.4, h: 0.4, fontSize: 12, color: t.mid, align: "center" });
      });
    },

    // Porter's five forces: rivalry circle, four arrows, colour = strength
    porter(spec) {
      const c = frame(spec), G = c.grid, s = c.slide, f = spec.forces;
      const cx = G.W / 2, midY = G.bodyY + G.bodyH / 2, R = 0.95, aw = 1.9, ah = 1.0;
      const lab = (color, name, level, why, x, y, w, align, h = 0.6) => txt(s, [
        { text: `${name}: ${level}`, options: { bold: true, color, breakLine: true } },
        { text: why, options: { color: t.ink } },
      ], { x, y: y + (0.85 - h) / 2, w, h, fontSize: 13, align, valign: "middle" });
      const arrow = (shape, x, y, w, h, color) => s.addShape(shape, { x, y, w, h, fill: { color }, line: { type: "none" } });
      const rc = lvl(f.rivalry.level);
      s.addShape(d.p.ShapeType.ellipse, { x: cx - R, y: midY - R, w: 2 * R, h: 2 * R, fill: { color: rc }, line: { color: "FFFFFF", width: 3 } });
      txt(s, [{ text: "RIVALRY", options: { bold: true, breakLine: true } }, { text: f.rivalry.level }],
        { x: cx - R, y: midY - R, w: 2 * R, h: 2 * R, fontSize: 15, color: "FFFFFF", align: "center", valign: "middle" });
      const vH = (G.bodyH - 2 * R) / 2 - 0.05, vW = 1.1;
      const leftW = cx - R - 0.2 - G.ml, rightX = cx + R + 0.2, rightW = G.ml + G.contentW - rightX;
      const sideW = rightW + (rightX - cx - vW / 2 - 0.2);
      arrow(d.p.ShapeType.downArrow, cx - vW / 2, G.bodyY, vW, vH, lvl(f.entrants.level));
      lab(lvl(f.entrants.level), "NEW ENTRANTS", f.entrants.level, f.entrants.why, cx + vW / 2 + 0.2, G.bodyY + (vH - 0.85) / 2, sideW, "left");
      arrow(d.p.ShapeType.upArrow, cx - vW / 2, midY + R + 0.1, vW, vH, lvl(f.substitutes.level));
      lab(lvl(f.substitutes.level), "SUBSTITUTES", f.substitutes.level, f.substitutes.why, cx + vW / 2 + 0.2, midY + R + 0.1 + (vH - 0.85) / 2, sideW, "left");
      arrow(d.p.ShapeType.rightArrow, cx - R - 0.1 - aw, midY - ah / 2, aw, ah, lvl(f.suppliers.level));
      lab(lvl(f.suppliers.level), "SUPPLIERS", f.suppliers.level, f.suppliers.why, G.ml, midY + ah / 2 + 0.05, leftW, "right");
      arrow(d.p.ShapeType.leftArrow, cx + R + 0.1, midY - ah / 2, aw, ah, lvl(f.buyers.level));
      lab(lvl(f.buyers.level), "BUYERS", f.buyers.level, f.buyers.why, rightX, midY + ah / 2 + 0.05, rightW, "left");
      lab(rc, "RIVALRY", f.rivalry.level, f.rivalry.why, G.ml, G.bodyY + (vH - 0.85) / 2, cx - vW / 2 - 0.2 - G.ml, "right", 0.85);
    },

    // one panel per criterion: subject vs peer, paired mini columns
    peerPanels(spec) {
      const c = frame(spec), G = c.grid, s = c.slide, ps = spec.panels, subj = spec.subject;
      const gap = 0.2, w = (G.contentW - gap * (ps.length - 1)) / ps.length;
      ps.forEach((pn, i) => {
        const x = G.ml + i * (w + gap), y = G.bodyY;
        c.box(x, y, w, G.bodyH);
        txt(s, pn.category, { x: x + 0.15, y: y + 0.12, w: w - 0.3, h: 0.35, fontSize: 17, bold: true, color: t.dark, align: "center", fit: "shrink" });
        txt(s, `${subj} vs ${pn.peer}`, { x: x + 0.15, y: y + 0.5, w: w - 0.3, h: 0.3, fontSize: 13, color: t.mid, align: "center" });
        const lo = Math.min(0, pn.subjectValue, pn.peerValue) * 3.5, hi = Math.max(pn.subjectValue, pn.peerValue) * 1.25;
        s.addChart(d.p.ChartType.bar, [{ name: pn.metric, labels: [subj, pn.peer], values: [pn.subjectValue, pn.peerValue] }], {
          x: x + 0.1, y: y + 0.85, w: w - 0.2, h: G.bodyH - 1.4, barDir: "col", chartColors: [t.primary, GREY], varyColors: true,
          showValue: true, dataLabelFormatCode: pn.numFmt || "0.0", dataLabelFontSize: 15, dataLabelFontBold: true, dataLabelColor: t.dark,
          dataLabelFontFace: FONT, dataLabelPosition: "outEnd", valAxisHidden: true, valAxisMinVal: lo, valAxisMaxVal: hi, catAxisLabelPos: "low",
          catAxisLabelFontSize: 13, catAxisLabelColor: t.ink, catAxisLabelFontFace: FONT, valGridLine: { style: "none" },
          showLegend: false, barGapWidthPct: 60,
        });
        txt(s, pn.metric, { x: x + 0.1, y: y + G.bodyH - 0.5, w: w - 0.2, h: 0.4, fontSize: 12, color: t.mid, align: "center", fit: "shrink" });
      });
    },

    // risk | exposure (red box, with a number) -> mitigation (green box)
    riskMitigation(spec) {
      const c = frame(spec), G = c.grid, s = c.slide, rows = spec.rows;
      const hdrH = 0.35, gap = 0.12, rowH = (G.bodyH - hdrH - gap * (rows.length - 1)) / rows.length;
      const c1 = 2.2, c2 = (G.contentW - c1 - 0.7) / 2, arrowW = 0.5;
      const x1 = G.ml, x2 = x1 + c1 + 0.1, x3 = x2 + c2 + arrowW, y0 = G.bodyY;
      [["Risk", x1, c1], ["Exposure (data)", x2, c2], ["Mitigation", x3, c2]].forEach(([h, x, w]) =>
        txt(s, h.toUpperCase(), { x, y: y0, w, h: hdrH, fontSize: 12, bold: true, color: t.mid, charSpacing: 1 }));
      rows.forEach((r, i) => {
        const y = y0 + hdrH + i * (rowH + gap);
        txt(s, r.risk, { x: x1, y, w: c1, h: rowH, fontSize: 16, bold: true, color: t.dark, valign: "middle", fit: "shrink" });
        c.box(x2, y, c2, rowH, RED);
        txt(s, r.exposure, { x: x2 + 0.15, y, w: c2 - 0.3, h: rowH, fontSize: 14, valign: "middle", fit: "shrink" });
        s.addShape(d.p.ShapeType.rightArrow, { x: x2 + c2 + 0.08, y: y + rowH / 2 - 0.15, w: arrowW - 0.16, h: 0.3, fill: { color: t.mid }, line: { type: "none" } });
        c.box(x3, y, c2, rowH, GREEN);
        txt(s, r.mitigation, { x: x3 + 0.15, y, w: c2 - 0.3, h: rowH, fontSize: 14, valign: "middle", fit: "shrink" });
      });
    },

    // Gantt over years with an optional deadline marker
    gantt(spec) {
      const c = frame(spec), G = c.grid, s = c.slide;
      const y0Year = spec.startYear, years = spec.endYear - spec.startYear + 1;
      const labW = 2.9, x0 = G.ml + labW, wAll = G.contentW - labW, y0 = G.bodyY + 0.62, yw = wAll / years;
      for (let k = 0; k < years; k++) {
        txt(s, String(y0Year + k), { x: x0 + k * yw, y: G.bodyY, w: yw, h: 0.3, fontSize: years > 10 ? 11 : 13, bold: true, color: t.mid, align: "center" });
        if (k) s.addShape(d.p.ShapeType.line, { x: x0 + k * yw, y: y0, w: 0, h: G.bodyH - 0.5, line: { color: t.rule, width: 0.5 } });
      }
      const X = (yr) => x0 + Math.max(0, Math.min(years, yr - y0Year)) * yw;
      const rh = (G.bodyH - 0.7) / spec.bars.length;
      spec.bars.forEach((b, i) => {
        const y = y0 + i * rh, col = b.emphasis === false ? "6D8FC7" : t.primary;
        txt(s, b.label, { x: G.ml, y, w: labW - 0.1, h: rh, fontSize: 13, bold: true, color: t.dark, valign: "middle", fit: "shrink" });
        s.addShape(d.p.ShapeType.rect, { x: X(b.from), y: y + rh * 0.2, w: X(b.to) - X(b.from), h: rh * 0.6, fill: { color: col }, line: { type: "none" } });
        if (b.note) txt(s, b.note, { x: X(b.from) + 0.1, y: y + rh * 0.2, w: Math.max(0.5, X(b.to) - X(b.from) - 0.2), h: rh * 0.6, fontSize: 12, bold: true, color: "FFFFFF", valign: "middle", fit: "shrink" });
      });
      if (spec.marker) {
        const lx = X(spec.marker.at);
        s.addShape(d.p.ShapeType.line, { x: lx, y: y0 - 0.05, w: 0, h: G.bodyH - 0.6, line: { color: RED, width: 2.25, dashType: "dash" } });
        txt(s, spec.marker.label, { x: lx + 0.05, y: G.bodyY + 0.33, w: 2.2, h: 0.25, fontSize: 12, bold: true, color: RED });
      }
    },

    // 2-4 target panels: gauge today vs target + a today/target strip
    scorecard(spec) {
      const c = frame(spec), G = c.grid, s = c.slide, ts = spec.targets;
      const gap = 0.2, w = (G.contentW - gap * (ts.length - 1)) / ts.length, y = G.bodyY, h = G.bodyH;
      ts.forEach((tg, i) => {
        const x = G.ml + i * (w + gap);
        c.box(x, y, w, h);
        txt(s, `TARGET ${i + 1}`, { x: x + 0.2, y: y + 0.15, w: w - 0.4, h: 0.25, fontSize: 12, bold: true, color: t.primary, charSpacing: 1 });
        txt(s, tg.heading, { x: x + 0.2, y: y + 0.42, w: w - 0.4, h: 0.35, fontSize: 17, bold: true, color: t.dark, fit: "shrink" });
        PANEL.gauge(c, x, y + 0.95, w, h - 1.9, { today: tg.todayValue, target: tg.targetValue, max: tg.max, unit: tg.unit, direction: tg.direction });
        const sy = y + h - 0.72;
        s.addShape(d.p.ShapeType.line, { x: x + 0.2, y: sy - 0.08, w: w - 0.4, h: 0, line: { color: PALE, width: 1 } });
        txt(s, [{ text: "Today  ", options: { color: t.mid } }, { text: tg.today, options: { bold: true, color: RED } }], { x: x + 0.2, y: sy, w: w - 0.4, h: 0.26, fontSize: 13, fit: "shrink" });
        txt(s, [{ text: "Target  ", options: { color: t.mid } }, { text: tg.target, options: { bold: true, color: GREEN } }], { x: x + 0.2, y: sy + 0.3, w: w - 0.4, h: 0.26, fontSize: 13, fit: "shrink" });
      });
    },
  };
}

module.exports = { mk };
