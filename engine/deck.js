/**
 * deck.js - consulting-style deck engine on top of pptxgenjs.
 *
 * Every slide shares one grid, one type ramp, one palette. Callers pick an
 * archetype and pass content; they never pass coordinates. That is what makes
 * a deck look built rather than assembled.
 *
 * Two things this engine takes seriously:
 *
 *  - Decks are projected. Type is sized for a room, not for a laptop. If a
 *    slide only works when the reader leans in, it does not work.
 *  - Panels are sized to their content. Boxes with text stranded at the top
 *    and an inch of dead air below are the single loudest tell of generated
 *    slides.
 *
 * Canvas: 13.333 x 7.5in (LAYOUT_WIDE). Geometry in inches.
 */

const PptxGenJS = require("pptxgenjs");
const { makeTheme, DEFAULT_THEME, mix } = require("./theme");

// ---------------------------------------------------------------------------
// Type
// ---------------------------------------------------------------------------

// The deck font. Commercial; present on the author's machine, substituted to
// Montserrat for local preview rendering via /etc/fonts/conf.d.
const FONT = "Avenir Next LT Pro";

// Sized for projection. The jump between levels is deliberate: flat hierarchy
// (everything within a few points of everything else) is what makes generated
// decks feel noisy and unscannable.
const TYPE = {
  coverTitle: 40,
  coverSub: 18,
  dividerNum: 60,
  dividerTitle: 30,
  actionTitle: 26,
  kicker: 13,
  execAnswer: 20,
  execPoint: 16,
  takeaway: 16,
  body: 17,
  kpiValue: 44,
  kpiLabel: 14,
  kpiNote: 11,
  quadLabel: 20,
  quadNote: 15,
  stepLabel: 15,
  stepNote: 13,
  tableHead: 14,
  tableBody: 13,
  chartLabel: 13,
  railText: 15,
  label: 13,
  footnote: 10,
};

// Boxes: The house style (2026-09-23) is content in outlined boxes
// with a heavy 2-2.5pt border. Square corners, white fill, no shadow: a
// printed-deck frame, not a floating web card.
const BOX_PT = 2.25;
const BOX_PAD = 0.2;

// Grid
const G = {
  W: 13.333,
  H: 7.5,
  ml: 0.55,
  mr: 0.55,
  titleY: 0.40,
  titleH: 0.95,
  ruleY: 1.45,
  bodyY: 1.68,
  footY: 6.95,
};
G.contentW = G.W - G.ml - G.mr;
G.bodyH = G.footY - G.bodyY - 0.15;

// ---------------------------------------------------------------------------
// Text metrics
//
// pptxgenjs cannot measure text, and panels that size to their content need
// real numbers. An "average character width" constant is a lie for a
// proportional font - it produced KPI numbers that wrapped into their own
// labels. metrics.json holds measured per-character advances (see
// gen-metrics.py); these are Montserrat, which is slightly wider than Avenir
// Next, so fit decisions err toward "also fits on the author's machine".
//
// TEXT_INSET: PowerPoint text boxes carry a default internal margin of 0.1in
// per side. Every addText below passes `margin: 0` so this engine's padding is
// the only padding, and these measurements mean what they say.
// ---------------------------------------------------------------------------

const METRICS = require("./metrics.json");
const LINE_SPACING = 1.28;

/** Width of a single line of text, in inches. */
function textWidth(text, pt, bold = false) {
  const tbl = METRICS.fonts[bold ? "bold" : "regular"];
  let w = 0;
  for (const ch of String(text == null ? "" : text)) w += tbl[ch] ?? tbl._default;
  return w * pt;
}

/** Greedy word wrap, matching how PowerPoint breaks a paragraph. */
function wrapLines(text, widthIn, pt, bold = false) {
  const out = [];
  for (const para of String(text == null ? "" : text).split("\n")) {
    let line = "";
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (textWidth(next, pt, bold) <= widthIn || !line) line = next;
      else {
        out.push(line);
        line = word;
      }
    }
    out.push(line);
  }
  return out;
}

function estLines(text, widthIn, pt, bold = false) {
  return Math.max(1, wrapLines(text, widthIn, pt, bold).length);
}

function estHeight(text, widthIn, pt, bold = false) {
  return estLines(text, widthIn, pt, bold) * (pt / 72) * LINE_SPACING;
}

/** Height of a bulleted list, including inter-item spacing. */
function estListHeight(items, widthIn, pt, spaceAfterPt = 10) {
  return items.reduce(
    (h, t) => h + estHeight(t, widthIn - 0.28, pt) + spaceAfterPt / 72,
    0
  );
}

/**
 * Largest size in [minPt, maxPt] that keeps `text` on one line inside widthIn.
 * For headline numbers, which must never wrap.
 */
function fitOneLine(text, widthIn, maxPt, minPt = 20, bold = true) {
  const unit = textWidth(text, 1, bold);
  if (unit <= 0) return maxPt;
  return Math.max(minPt, Math.min(maxPt, Math.floor(widthIn / unit)));
}

// ---------------------------------------------------------------------------
// Deck
// ---------------------------------------------------------------------------

class Deck {
  /**
   * @param {object} opts
   * @param {string} opts.title    deck title (file metadata)
   * @param {string} opts.author
   * @param {string} opts.footer   persistent footer, e.g. client + date
   * @param {object} [opts.brand]  { primary, secondary, name } - the analysed
   *                               company's real brand colours. Drives the
   *                               whole palette. See theme.js.
   * @param {object} [opts.theme]  a pre-built theme, overrides brand
   */
  constructor(opts = {}) {
    const p = new PptxGenJS();
    // LAYOUT_WIDE is 13.333 x 7.5in, which the G grid assumes. LAYOUT_16x9 is
    // also 16:9 but only 10 x 5.625in, and would push every element off-canvas.
    p.layout = "LAYOUT_WIDE";
    p.author = opts.author || "";
    p.title = opts.title || "";
    this.p = p;
    this.t = opts.theme || (opts.brand ? makeTheme(opts.brand) : DEFAULT_THEME);
    this.footer = opts.footer || "";
    // Optional corner logo on every content slide, e.g. the university's for
    // coursework: { path, w } in inches, height from the aspect ratio.
    this.logo = opts.logo || null;
    this.pageNo = 0;
  }

  // --- internals ---------------------------------------------------------

  _frame(slide, { title, kicker, source, noPage, takeaway } = {}) {
    const t = this.t;
    this.bodyH = G.bodyH;
    if (takeaway) this._takeaway(slide, takeaway);
    if (this.logo) {
      const { path, w, aspect } = this.logo;
      const h = w / (aspect || 3.5);
      // Top-right, inside the kicker band; the action title starts below it.
      slide.addImage({ path, x: G.W - G.mr - w, y: Math.max(0.06, G.titleY - h - 0.04), w, h });
    }
    if (kicker) {
      slide.addText(kicker.toUpperCase(), {
        x: G.ml,
        y: 0.14,
        w: G.contentW,
        h: 0.26,
        fontSize: TYPE.kicker,
        bold: true,
        color: t.primary,
        fontFace: FONT,
        margin: 0,
        charSpacing: 1,
      });
    }
    if (title) {
      slide.addText(title, {
        x: G.ml,
        y: G.titleY,
        w: G.contentW,
        h: G.titleH,
        fontSize: TYPE.actionTitle,
        bold: true,
        color: t.dark,
        fontFace: FONT,
        margin: 0,
        valign: "top",
        lineSpacingMultiple: 1.05,
      });
      slide.addShape(this.p.ShapeType.line, {
        x: G.ml,
        y: G.ruleY,
        w: G.contentW,
        h: 0,
        line: { color: t.rule, width: 0.75 },
      });
    }
    if (source) {
      slide.addText(`Source: ${source}`, {
        x: G.ml,
        y: G.footY,
        w: G.contentW - 0.6,
        h: 0.24,
        fontSize: TYPE.footnote,
        color: t.mid,
        fontFace: FONT,
        margin: 0,
      });
    }
    // Footer and page number are drawn on every content slide or none.
    // Intermittent chrome is a tell; consistency is invisible, which is the
    // point.
    if (!noPage) {
      if (this.footer) {
        slide.addText(this.footer, {
          x: G.ml,
          y: G.footY + 0.22,
          w: G.contentW - 0.6,
          h: 0.22,
          fontSize: TYPE.footnote,
          color: t.rule,
          fontFace: FONT,
        margin: 0,
        });
      }
      this.pageNo += 1;
      slide.addText(String(this.pageNo), {
        x: G.W - G.mr - 0.5,
        y: G.footY,
        w: 0.5,
        h: 0.24,
        fontSize: TYPE.footnote,
        color: t.mid,
        fontFace: FONT,
        margin: 0,
        align: "right",
      });
    }
    return slide;
  }

  _new() {
    return this.p.addSlide();
  }

  _cols(n, gutter = 0.3) {
    const w = (G.contentW - gutter * (n - 1)) / n;
    return Array.from({ length: n }, (_, i) => ({ x: G.ml + i * (w + gutter), w }));
  }

  /**
   * Right-hand insight rail, shared by chart() and matrix().
   *
   * A hairline and whitespace, not a filled card. Filled panels with a tinted
   * background read as a web component, not a consulting slide, and they turn
   * any spare room into a visibly empty box.
   */
  /** Outlined content box. Draw it before the text that sits inside it. */
  _box(s, x, y, w, h, color) {
    s.addShape(this.p.ShapeType.rect, {
      x, y, w, h,
      fill: { color: this.t.white },
      line: { color: color || this.t.dark, width: BOX_PT },
    });
  }

  /**
   * The slide's takeaway: a band above the source line, in the takeaway colour
   * (the brand's second hue), so the conclusion is findable at a glance on
   * every slide. It shrinks the body zone; archetypes lay out in this.bodyH.
   */
  _takeaway(s, text) {
    const t = this.t;
    const padX = 0.25;
    const padY = 0.13;
    const label = "Takeaway: ";
    const textW = G.contentW - padX * 2;
    const h = estHeight(label + text, textW, TYPE.takeaway, true) + padY * 2;
    const y = G.footY - 0.12 - h;
    s.addShape(this.p.ShapeType.rect, {
      x: G.ml, y, w: G.contentW, h,
      fill: { color: t.takeawayFill },
      line: { color: t.takeaway, width: BOX_PT },
    });
    s.addText(
      [
        { text: label, options: { bold: true, color: t.takeawayInk } },
        { text, options: { bold: true, color: t.ink } },
      ],
      {
        x: G.ml + padX, y: y + padY, w: textW, h: h - padY * 2,
        fontSize: TYPE.takeaway, fontFace: FONT, margin: 0, valign: "middle",
      }
    );
    this.bodyH = y - 0.2 - G.bodyY;
  }

  _rail(s, insights, x, w) {
    const t = this.t;
    const pad = BOX_PAD + 0.05;
    const textW = w - pad * 2;
    const h = 0.34 + estListHeight(insights, textW, TYPE.railText, 14) + pad * 2 - 0.14;
    const y = G.bodyY + Math.max(0, (this.bodyH - h) / 2);
    this._box(s, x, y, w, h);
    s.addText("WHAT THIS MEANS", {
      x: x + pad,
      y: y + pad,
      w: textW,
      h: 0.26,
      fontSize: TYPE.kicker,
      bold: true,
      color: t.mid,
      fontFace: FONT,
      margin: 0,
      charSpacing: 1,
    });
    s.addText(
      insights.map((txt) => ({
        text: txt,
        options: { bullet: { code: "25AA" }, breakLine: true, paraSpaceAfter: 14 },
      })),
      {
        x: x + pad,
        y: y + pad + 0.34,
        w: textW,
        h: h - 0.34 - pad * 2,
        fontSize: TYPE.railText,
        color: t.ink,
        fontFace: FONT,
        margin: 0,
        valign: "top",
      }
    );
  }

  // --- archetypes --------------------------------------------------------

  cover({ title, subtitle, meta }) {
    const t = this.t;
    const s = this._new();
    s.background = { color: t.dark };
    // Size the title box to its text so a two-line title pushes the subtitle
    // down instead of crowding it.
    const titleW = G.contentW - 1.8;
    const titleH = Math.max(0.75, estHeight(title, titleW, TYPE.coverTitle, true) * 1.05);
    s.addText(title, {
      x: G.ml,
      y: 3.25,
      w: titleW,
      h: titleH,
      fontSize: TYPE.coverTitle,
      bold: true,
      color: t.onDark,
      fontFace: FONT,
        margin: 0,
      valign: "top",
      lineSpacingMultiple: 1.05,
    });
    if (subtitle) {
      s.addText(subtitle, {
        x: G.ml,
        y: 3.25 + titleH + 0.25,
        w: G.contentW - 3,
        h: estHeight(subtitle, G.contentW - 3, TYPE.coverSub) + 0.1,
        fontSize: TYPE.coverSub,
        color: t.rule,
        fontFace: FONT,
        margin: 0,
        valign: "top",
      });
    }
    if (meta) {
      s.addText(meta, {
        x: G.ml,
        y: 6.55,
        w: G.contentW,
        h: 0.3,
        fontSize: TYPE.footnote,
        color: t.mid,
        fontFace: FONT,
        margin: 0,
      });
    }
    return s;
  }

  divider({ number, title, blurb }) {
    const t = this.t;
    const s = this._new();
    s.background = { color: t.dark };
    if (number != null) {
      s.addText((/^\d+$/.test(String(number)) ? String(number).padStart(2, "0") : String(number)), {
        x: G.ml,
        y: 2.55,
        w: 1.8,
        h: 1.1,
        fontSize: TYPE.dividerNum,
        bold: true,
        color: t.primary,
        fontFace: FONT,
        margin: 0,
      });
    }
    s.addText(title, {
      x: G.ml,
      y: 3.65,
      w: G.contentW - 2,
      h: 0.9,
      fontSize: TYPE.dividerTitle,
      bold: true,
      color: t.onDark,
      fontFace: FONT,
        margin: 0,
    });
    if (blurb) {
      s.addText(blurb, {
        x: G.ml,
        y: 4.6,
        w: G.contentW - 4,
        h: 0.9,
        fontSize: TYPE.coverSub,
        color: t.rule,
        fontFace: FONT,
        margin: 0,
        valign: "top",
      });
    }
    return s;
  }

  executiveSummary({ title, kicker, takeaway, answer, points, source }) {
    const t = this.t;
    const s = this._new();
    this._frame(s, { title, kicker, source, takeaway });

    // The answer band hugs its text.
    const pad = 0.26;
    const bandH = Math.max(
      0.95,
      estHeight(answer, G.contentW - pad * 2, TYPE.execAnswer) + pad * 2
    );
    s.addShape(this.p.ShapeType.rect, {
      x: G.ml,
      y: G.bodyY,
      w: G.contentW,
      h: bandH,
      fill: { color: t.dark },
    });
    s.addText(answer, {
      x: G.ml + pad,
      y: G.bodyY + pad * 0.6,
      w: G.contentW - pad * 2,
      h: bandH - pad * 1.2,
      fontSize: TYPE.execAnswer,
      bold: true,
      color: t.onDark,
      fontFace: FONT,
        margin: 0,
      valign: "middle",
    });

    // Support points: each row is exactly as tall as its text needs, and the
    // stack is centred in the space that is left. No uniform rows with air.
    const top = G.bodyY + bandH + 0.32;
    const avail = G.bodyY + this.bodyH - top;
    const bpad = BOX_PAD + 0.05;
    const textW = G.contentW - bpad * 2;
    const heights = points.map((p) =>
      Math.max(0.36, estHeight(p, textW, TYPE.execPoint) + 0.06)
    );
    const sum = heights.reduce((a, b) => a + b, 0);
    // Gaps absorb the squeeze first (a takeaway band takes body height), so
    // the box always holds every point.
    const room = avail - sum - (BOX_PAD + 0.05) * 2;
    const gap = points.length > 1 ? Math.min(0.34, Math.max(0.06, room / (points.length - 1))) : 0;
    const blockH = sum + gap * (points.length - 1);
    const boxH = Math.min(avail, blockH + bpad * 2);
    const boxY = top + Math.max(0, (avail - boxH) / 2);
    this._box(s, G.ml, boxY, G.contentW, boxH);
    let y = boxY + bpad;

    points.forEach((pt, i) => {
      const h = heights[i];
      // A hairline between points, not an accent-coloured tab beside each one.
      if (i > 0) {
        s.addShape(this.p.ShapeType.line, {
          x: G.ml + bpad,
          y: y - gap / 2,
          w: G.contentW - bpad * 2,
          h: 0,
          line: { color: t.rule, width: 0.5 },
        });
      }
      s.addText(pt, {
        x: G.ml + bpad,
        y,
        w: textW,
        h,
        fontSize: TYPE.execPoint,
        color: t.ink,
        fontFace: FONT,
        margin: 0,
        valign: "middle",
      });
      y += h + gap;
    });
    return s;
  }

  bullets({ title, kicker, takeaway, bullets, source }) {
    const t = this.t;
    const s = this._new();
    this._frame(s, { title, kicker, source, takeaway });
    const items = bullets.map((b) => (typeof b === "string" ? { text: b } : b));
    const listH = estListHeight(items.map((b) => b.text), G.contentW, TYPE.body, 12);
    const y = G.bodyY + Math.max(0, (this.bodyH - listH) / 2);
    s.addText(
      items.map((b) => ({
        text: b.text,
        options: {
          bullet: { code: "25AA" },
          indentLevel: b.level || 0,
          breakLine: true,
          paraSpaceAfter: 12,
        },
      })),
      {
        x: G.ml,
        y,
        w: G.contentW,
        h: Math.min(this.bodyH, listH + 0.2),
        fontSize: TYPE.body,
        color: t.ink,
        fontFace: FONT,
        margin: 0,
        valign: "top",
      }
    );
    return s;
  }

  kpis({ title, kicker, takeaway, stats, body, source }) {
    const t = this.t;
    const s = this._new();
    this._frame(s, { title, kicker, source, takeaway });
    const cols = this._cols(stats.length, 0.28);
    const pad = BOX_PAD + 0.05;
    // Measure against the inner width: the tile is a box with padding.
    const inner = cols.map((c) => ({ x: c.x + pad, w: c.w - pad * 2 }));

    // The headline number must never wrap: a wrapped "EUR 1.2B" collides with
    // its own label. Shrink to fit one line, and use the SAME size on every
    // tile - a KPI row with four different number sizes reads as broken, so
    // the longest value sets the size for all of them.
    const valuePt = Math.min(
      ...stats.map((st, i) => fitOneLine(st.value, inner[i].w, TYPE.kpiValue, 22))
    );
    const valueH = (valuePt / 72) * 1.22;

    // Labels reserve the same height on every tile so the notes below them sit
    // on one baseline. Ragged notes across a KPI row are exactly the kind of
    // small inconsistency that reads as "assembled by a machine".
    const maxLabelH = Math.max(
      ...stats.map((st, i) => estHeight(st.label, inner[i].w, TYPE.kpiLabel))
    );
    const maxNoteH = Math.max(
      0,
      ...stats.map((st, i) => (st.note ? estHeight(st.note, inner[i].w, TYPE.kpiNote) : 0))
    );
    const tileH = valueH + 0.1 + maxLabelH + (maxNoteH ? 0.1 + maxNoteH : 0) + pad * 2;

    // Centre the whole block in the body zone rather than pinning it to the
    // top and leaving a band of dead air underneath.
    const bodyH = body ? 0.5 + estHeight(body, G.contentW, TYPE.body) : 0;
    const blockTop = G.bodyY + Math.max(0, (this.bodyH - tileH - bodyH) / 2);

    cols.forEach((col, i) => {
      const st = stats[i];
      // One box per tile, sized to the tallest tile so the row reads as one.
      this._box(s, col.x, blockTop, col.w, tileH);
      const c = inner[i];
      let y = blockTop + pad;
      s.addText(st.value, {
        x: c.x,
        y,
        w: c.w,
        h: valueH,
        fontSize: valuePt,
        bold: true,
        color: t.dark,
        fontFace: FONT,
        margin: 0,
        valign: "top",
      });
      y += valueH + 0.1;
      s.addText(st.label, {
        x: c.x,
        y,
        w: c.w,
        h: maxLabelH,
        fontSize: TYPE.kpiLabel,
        color: t.ink,
        fontFace: FONT,
        margin: 0,
        valign: "top",
      });
      if (st.note) {
        s.addText(st.note, {
          x: c.x,
          y: y + maxLabelH + 0.1,
          w: c.w,
          h: maxNoteH,
          fontSize: TYPE.kpiNote,
          color: t.mid,
          fontFace: FONT,
          margin: 0,
          valign: "top",
        });
      }
    });

    if (body) {
      const by = blockTop + tileH + 0.4;
      s.addText(body, {
        x: G.ml,
        y: by,
        w: G.contentW,
        h: Math.min(G.bodyY + this.bodyH - by, estHeight(body, G.contentW, TYPE.body) + 0.1),
        fontSize: TYPE.body,
        color: t.ink,
        fontFace: FONT,
        margin: 0,
        valign: "top",
      });
    }
    return s;
  }

  chart({ title, kicker, takeaway, type, data, insights, source, highlight, numFmt, chartOpts = {} }) {
    const t = this.t;
    const s = this._new();
    this._frame(s, { title, kicker, source, takeaway });
    const hasRail = insights && insights.length;
    const chartW = hasRail ? G.contentW * 0.66 : G.contentW;
    const single = data.length === 1;

    this._box(s, G.ml, G.bodyY, chartW, this.bodyH);
    const base = {
      x: G.ml + BOX_PAD,
      y: G.bodyY + BOX_PAD,
      w: chartW - BOX_PAD * 2,
      h: this.bodyH - BOX_PAD * 2,
      chartColors: t.series,
      showLegend: data.length > 1,
      legendPos: "b",
      legendFontSize: TYPE.chartLabel,
      legendColor: t.mid,
      catAxisLabelFontSize: TYPE.chartLabel,
      catAxisLabelColor: t.mid,
      valAxisLabelFontSize: TYPE.chartLabel,
      valAxisLabelColor: t.mid,
      catAxisLineShow: true,
      catAxisLineColor: t.rule,
      valAxisLineShow: false,
      valGridLine: { style: "none" },
      catGridLine: { style: "none" },
      showValue: true,
      dataLabelFontSize: TYPE.chartLabel,
      dataLabelColor: t.dark,
      dataLabelFontBold: true,
      dataLabelPosition: "outEnd",
      dataLabelFontFace: FONT,
      fontFace: FONT,
        margin: 0,
    };

    if (type === "bar" || type === "col") {
      Object.assign(base, {
        barDir: type === "bar" ? "bar" : "col",
        barGapWidthPct: 45,
        valAxisHidden: true,
        valAxisLabelFontSize: 1,
      });
      if (single) {
        // One series means categories are not colour-coded groups. Colour per
        // bar would imply a distinction that does not exist; paint them all
        // and let `highlight` carry the emphasis.
        const n = data[0].values.length;
        base.chartColors = Array.from({ length: n }, (_, i) =>
          highlight === i ? t.primary : t.dark
        );
        base.varyColors = true; // required for per-point chartColors to apply
        base.showLegend = false;
      }
      // Horizontal bars render bottom-up by default, inverting a ranking.
      if (type === "bar") base.catAxisOrientation = "maxMin";
    }
    if (type === "line") {
      Object.assign(base, {
        lineSize: 3,
        lineSmooth: false,
        showValue: false,
        valAxisHidden: false,
        valGridLine: { style: "solid", color: t.wash, size: 1 },
        lineDataSymbol: "circle",
        lineDataSymbolSize: 7,
      });
    }
    if (type === "pie" || type === "doughnut") {
      Object.assign(base, {
        showPercent: true,
        showValue: false,
        showLegend: true,
        legendPos: "r",
        dataLabelPosition: "bestFit",
        holeSize: type === "doughnut" ? 60 : 0,
      });
    }
    if (type === "area") Object.assign(base, { showValue: false, lineSize: 2 });

    if (numFmt) base.dataLabelFormatCode = numFmt;

    const ct = {
      bar: this.p.ChartType.bar,
      col: this.p.ChartType.bar,
      line: this.p.ChartType.line,
      pie: this.p.ChartType.pie,
      doughnut: this.p.ChartType.doughnut,
      area: this.p.ChartType.area,
    }[type];

    s.addChart(ct, data, { ...base, ...chartOpts });

    if (hasRail) {
      const rx = G.ml + chartW + 0.35;
      this._rail(s, insights, rx, G.contentW - chartW - 0.35);
    }
    return s;
  }

  /**
   * Waterfall / bridge: how a start value becomes an end value.
   *
   * Drawn with shapes, not a chart object. pptxgenjs has no waterfall type,
   * and the stacked-column-with-invisible-base trick cannot hide the base
   * series' labels or survive a bar crossing zero. Shapes give exact labels,
   * signs and connectors, and stay editable in PowerPoint.
   *
   * steps: [{ label, value, total }]. A total with no value is the running
   * sum at that point, so the arithmetic cannot drift from the deltas.
   * yMin: start the axis above zero when the deltas are small next to the
   * totals (a 1,000 -> 1,040 bridge is flat from zero). Totals then show a
   * break mark so nobody reads bar length as magnitude.
   */
  waterfall({ title, kicker, takeaway, steps, unit, decimals = 0, highlight, yMin, insights, source }) {
    const t = this.t;
    const s = this._new();
    this._frame(s, { title, kicker, source, takeaway });
    const hasRail = insights && insights.length;
    const boxW = hasRail ? G.contentW * 0.66 : G.contentW;
    this._box(s, G.ml, G.bodyY, boxW, this.bodyH);
    // Everything below lays out inside the box: X0/areaW/Y0/areaH are the
    // padded interior.
    const X0 = G.ml + BOX_PAD;
    const areaW = boxW - BOX_PAD * 2;
    const Y0 = G.bodyY + BOX_PAD;
    const areaH = this.bodyH - BOX_PAD * 2;

    // Resolve the bars: every bar spans [from, to] on the value axis.
    let run = 0;
    const bars = steps.map((st, i) => {
      if (st.total) {
        const v = st.value == null ? run : st.value;
        if (st.value != null && i > 0 && Math.abs(st.value - run) > 1e-6 * Math.max(1, Math.abs(run))) {
          throw new Error(`waterfall: total "${st.label}" is ${st.value} but the steps sum to ${run}`);
        }
        run = v;
        return { ...st, from: 0, to: v, kind: "total", shown: v };
      }
      const from = run;
      run += st.value;
      return { ...st, from, to: run, kind: st.value >= 0 ? "up" : "down", shown: st.value };
    });

    // A bridge (starts from a total) signs its deltas; a build-up from zero
    // (segments stacking to a whole) does not, "+34%" of a whole reads wrong.
    const bridge = !!(steps[0] && steps[0].total);
    const fmtNum = (v, signed) => {
      const abs = Math.abs(v).toLocaleString("en-US", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      });
      if (v < 0) return `−${abs}`;
      return signed ? `+${abs}` : abs;
    };

    const lo = yMin != null ? yMin : Math.min(0, ...bars.map((b) => Math.min(b.from, b.to)));
    const hi = Math.max(...bars.map((b) => Math.max(b.from, b.to)));
    const broken = yMin != null && yMin > 0;

    // Category labels: reserve the tallest one so every label shares a baseline.
    const n = bars.length;
    const slot = areaW / n;
    const barW = Math.min(1.1, slot * 0.62);
    const catPt = TYPE.chartLabel;
    const catH = Math.max(...bars.map((b) => estHeight(b.label, slot - 0.08, catPt, b.kind === "total")));
    const valH = (TYPE.chartLabel + 1) / 72 * LINE_SPACING;
    const unitH = unit ? 0.28 : 0;

    const top = Y0 + unitH + valH + 0.05;
    // A negative total carries its label underneath: keep room for it above
    // the category labels.
    const underRoom = bars.some((b) => b.kind === "total" && b.to < 0) ? valH + 0.06 : 0;
    const bottom = Y0 + areaH - catH - 0.12 - underRoom;
    const scale = (bottom - top) / (hi - lo || 1);
    const yOf = (v) => bottom - (Math.max(v, lo) - lo) * scale;

    if (unit) {
      s.addText(unit, {
        x: X0, y: Y0, w: areaW, h: 0.24,
        fontSize: TYPE.label, color: t.mid, fontFace: FONT, margin: 0,
      });
    }
    // Axis line at zero (or at the break).
    s.addShape(this.p.ShapeType.line, {
      x: X0, y: yOf(Math.max(lo, 0)), w: areaW, h: 0,
      line: { color: t.rule, width: 0.75 },
    });

    const fill = { total: t.dark, up: t.primary, down: t.series[5] };
    bars.forEach((b, i) => {
      const cx = X0 + slot * i + slot / 2;
      const x = cx - barW / 2;
      const y1 = yOf(Math.max(b.from, b.to));
      const y2 = yOf(Math.min(b.from, b.to));
      const color = highlight === i ? t.primary : fill[b.kind];
      const hl = highlight != null && highlight !== i && b.kind !== "total";
      s.addShape(this.p.ShapeType.rect, {
        x, y: y1, w: barW, h: Math.max(0.02, y2 - y1),
        fill: { color: hl ? mix(color, "FFFFFF", 0.35) : color },
        line: { type: "none" },
      });
      if (broken && b.kind === "total") {
        // Two white strokes across the base: the axis does not start at zero.
        const by = bottom - 0.16;
        for (const d of [0, 0.07]) {
          s.addShape(this.p.ShapeType.line, {
            x: x - 0.05, y: by - d, w: barW + 0.1, h: -0.05,
            line: { color: t.white, width: 2.5 },
          });
        }
      }
      // Value label: above the bar, signed for deltas. A negative total hangs
      // below zero, so its label goes under it.
      const under = b.kind === "total" && b.to < 0;
      s.addText(fmtNum(b.shown, b.kind !== "total" && bridge), {
        x: cx - slot / 2, y: under ? y2 + 0.03 : y1 - valH - 0.03, w: slot, h: valH,
        fontSize: TYPE.chartLabel + 1, bold: true, align: "center",
        color: b.kind === "down" ? t.mid : t.dark, fontFace: FONT, margin: 0,
      });
      s.addText(b.label, {
        x: cx - slot / 2 + 0.04, y: bottom + 0.1 + underRoom, w: slot - 0.08, h: catH,
        fontSize: catPt, bold: b.kind === "total", align: "center", valign: "top",
        color: b.kind === "total" ? t.ink : t.mid, fontFace: FONT, margin: 0,
      });
      // Connector to the next bar at the running level.
      if (i < n - 1) {
        const level = yOf(b.to);
        s.addShape(this.p.ShapeType.line, {
          x: x + barW, y: level, w: slot - barW, h: 0,
          line: { color: t.mid, width: 0.75, dashType: "dash" },
        });
      }
    });

    if (hasRail) {
      const rx = G.ml + boxW + 0.3;
      this._rail(s, insights, rx, G.contentW - boxW - 0.3);
    }
    return s;
  }

  matrix({ title, kicker, takeaway, xAxis, yAxis, quadrants, insights, source }) {
    const t = this.t;
    const s = this._new();
    this._frame(s, { title, kicker, source, takeaway });
    const hasRail = insights && insights.length;

    const yGutter = 0.55; // rotated y-axis label
    const xGutter = 0.5; // x-axis label under the grid
    const x0 = G.ml + yGutter;
    const mw = (hasRail ? G.contentW * 0.62 : G.contentW) - yGutter;
    const hw = mw / 2;
    const pad = 0.26;

    // A hairline grid, not four filled cards. Filled quadrants turn every bit
    // of spare room into a visibly empty box; an open grid reads as a chart
    // axis, so the whitespace inside it is structure rather than dead air.
    // Exactly one quadrant may be filled: the recommendation.
    const mh = this.bodyH - xGutter;
    const y0 = G.bodyY;
    const qh = mh / 2;

    const pos = [
      { x: x0, y: y0 },
      { x: x0 + hw, y: y0 },
      { x: x0, y: y0 + qh },
      { x: x0 + hw, y: y0 + qh },
    ];

    // The one shaded quadrant goes down first so the grid lines sit on top.
    quadrants.forEach((q, i) => {
      if (!q.highlight) return;
      s.addShape(this.p.ShapeType.rect, {
        x: pos[i].x,
        y: pos[i].y,
        w: hw,
        h: qh,
        fill: { color: t.dark },
      });
    });

    // Axes: left and bottom, heavier than the internal cross.
    s.addShape(this.p.ShapeType.line, {
      x: x0, y: y0, w: 0, h: mh, line: { color: t.mid, width: 1 },
    });
    s.addShape(this.p.ShapeType.line, {
      x: x0, y: y0 + mh, w: mw, h: 0, line: { color: t.mid, width: 1 },
    });
    // Internal cross.
    s.addShape(this.p.ShapeType.line, {
      x: x0 + hw, y: y0, w: 0, h: mh, line: { color: t.rule, width: 0.75 },
    });
    s.addShape(this.p.ShapeType.line, {
      x: x0, y: y0 + qh, w: mw, h: 0, line: { color: t.rule, width: 0.75 },
    });

    quadrants.forEach((q, i) => {
      const w = hw - pad * 2;
      const labelH = estHeight(q.label, w, TYPE.quadLabel, true);
      const noteH = q.note ? estHeight(q.note, w, TYPE.quadNote) : 0;
      // Centre the text block in its cell so nothing is stranded at the top.
      const blockH = labelH + (q.note ? 0.14 + noteH : 0);
      const ty = pos[i].y + Math.max(pad, (qh - blockH) / 2);
      s.addText(q.label, {
        x: pos[i].x + pad,
        y: ty,
        w,
        h: labelH,
        fontSize: TYPE.quadLabel,
        bold: true,
        color: q.highlight ? t.onDark : t.dark,
        fontFace: FONT,
        margin: 0,
        valign: "top",
      });
      if (q.note) {
        s.addText(q.note, {
          x: pos[i].x + pad,
          y: ty + labelH + 0.14,
          w,
          h: noteH,
          fontSize: TYPE.quadNote,
          color: q.highlight ? t.rule : t.ink,
          fontFace: FONT,
          margin: 0,
          valign: "top",
        });
      }
    });

    // Rotated text spins around the box centre, so position by centre.
    s.addText(`${yAxis}  \u2192`, {
      x: x0 - 0.32 - mh / 2,
      y: y0 + mh / 2 - 0.15,
      w: mh,
      h: 0.3,
      fontSize: TYPE.label,
      bold: true,
      color: t.mid,
      fontFace: FONT,
      margin: 0,
      rotate: 270,
      align: "center",
    });
    s.addText(`${xAxis}  \u2192`, {
      x: x0,
      y: y0 + mh + 0.14,
      w: mw,
      h: 0.3,
      fontSize: TYPE.label,
      bold: true,
      color: t.mid,
      fontFace: FONT,
      margin: 0,
      align: "center",
    });

    if (hasRail) {
      const rx = G.ml + G.contentW * 0.62 + 0.4;
      this._rail(s, insights, rx, G.contentW - G.contentW * 0.62 - 0.4);
    }
    return s;
  }

  process({ title, kicker, takeaway, steps, source }) {
    const t = this.t;
    const s = this._new();
    this._frame(s, { title, kicker, source, takeaway });
    const gap = 0.12;
    const w = (G.contentW - gap * (steps.length - 1)) / steps.length;
    const h = 1.15;
    const noteH = steps.reduce(
      (mx, st) => (st.note ? Math.max(mx, estHeight(st.note, w - 0.2 - BOX_PAD * 2, TYPE.stepNote)) : mx),
      0
    );
    const boxH = noteH ? noteH + BOX_PAD * 2 : 0;
    const blockH = h + (noteH ? 0.22 + boxH : 0);
    const y = G.bodyY + (this.bodyH - blockH) / 2;

    steps.forEach((st, i) => {
      const x = G.ml + i * (w + gap);
      s.addShape(this.p.ShapeType.chevron, {
        x,
        y,
        w,
        h,
        fill: { color: i === 0 ? t.dark : t.primary },
        line: { color: t.white, width: 1 },
      });
      s.addText(st.label, {
        x: x + 0.3,
        y,
        w: w - 0.5,
        h,
        fontSize: TYPE.stepLabel,
        bold: true,
        color: i === 0 ? t.onDark : t.onAccent,
        fontFace: FONT,
        margin: 0,
        align: "center",
        valign: "middle",
      });
      if (st.note) {
        this._box(s, x + 0.1, y + h + 0.22, w - 0.2, boxH);
        s.addText(st.note, {
          x: x + 0.1 + BOX_PAD,
          y: y + h + 0.22 + BOX_PAD,
          w: w - 0.2 - BOX_PAD * 2,
          h: noteH,
          fontSize: TYPE.stepNote,
          color: t.ink,
          fontFace: FONT,
        margin: 0,
          align: "center",
          valign: "top",
        });
      }
    });
    return s;
  }

  table({ title, kicker, takeaway, rows, colW, source }) {
    const t = this.t;
    const s = this._new();
    this._frame(s, { title, kicker, source, takeaway });
    const n = rows[0].length;
    const weights = colW || Array(n).fill(1);
    const sum = weights.reduce((a, b) => a + b, 0);
    const widths = weights.map((w) => (w / sum) * G.contentW);

    const body = rows.map((r, ri) =>
      r.map((cell) => ({
        text: String(cell),
        options: {
          fontSize: ri === 0 ? TYPE.tableHead : TYPE.tableBody,
          bold: ri === 0,
          color: ri === 0 ? t.onDark : t.ink,
          fill: { color: ri === 0 ? t.dark : ri % 2 ? t.white : t.wash },
          fontFace: FONT,
        margin: 0,
          align: "left",
          valign: "middle",
          margin: [7, 10, 7, 10],
        },
      }))
    );
    // rowH is a minimum, not a cap: PowerPoint grows rows to fit. Size it to
    // fill the body zone so the table does not strand in the top half.
    const rowH = Math.min(0.72, (this.bodyH - 0.1) / rows.length);
    s.addTable(body, {
      x: G.ml,
      y: G.bodyY,
      w: G.contentW,
      colW: widths,
      rowH,
      border: { type: "solid", color: t.rule, pt: 0.5 },
      autoPage: false,
    });
    return s;
  }

  twoUp({ title, kicker, takeaway, left, right, source }) {
    const t = this.t;
    const s = this._new();
    this._frame(s, { title, kicker, source, takeaway });
    const pad = BOX_PAD + 0.05;
    const cols = this._cols(2, 0.4);
    // Both boxes share the height of the fuller side, so they read as a pair.
    const need = [left, right].map((side, i) => {
      const w = cols[i].w - pad * 2;
      const items = Array.isArray(side.body) ? side.body : [side.body];
      return (side.heading ? 0.62 : 0) + estListHeight(items, w, TYPE.body, 12) + pad * 2;
    });
    const boxH = Math.min(this.bodyH, Math.max(...need));
    const top = G.bodyY + Math.max(0, (this.bodyH - boxH) / 2);
    [left, right].forEach((side, i) => {
      this._box(s, cols[i].x, top, cols[i].w, boxH);
      const c = { x: cols[i].x + pad, w: cols[i].w - pad * 2 };
      let y = top + pad;
      if (side.heading) {
        s.addText(side.heading, {
          x: c.x,
          y,
          w: c.w,
          h: 0.4,
          fontSize: TYPE.body,
          bold: true,
          color: t.dark,
          fontFace: FONT,
        margin: 0,
        });
        s.addShape(this.p.ShapeType.line, {
          x: c.x,
          y: y + 0.44,
          w: c.w,
          h: 0,
          line: { color: t.rule, width: 0.75 },
        });
        y += 0.62;
      }
      const items = Array.isArray(side.body) ? side.body : [side.body];
      s.addText(
        items.map((txt) => ({
          text: txt,
          options: {
            bullet: Array.isArray(side.body) ? { code: "25AA" } : false,
            breakLine: true,
            paraSpaceAfter: 12,
          },
        })),
        {
          x: c.x,
          y,
          w: c.w,
          h: top + boxH - pad - y,
          fontSize: TYPE.body,
          color: t.ink,
          fontFace: FONT,
        margin: 0,
          valign: "top",
        }
      );
    });
    return s;
  }

  closing({ title, points, meta }) {
    const t = this.t;
    const s = this._new();
    s.background = { color: t.dark };
    s.addText(title, {
      x: G.ml,
      y: 1.8,
      w: G.contentW - 2,
      h: 1.0,
      fontSize: TYPE.dividerTitle,
      bold: true,
      color: t.onDark,
      fontFace: FONT,
        margin: 0,
      valign: "top",
    });
    if (points && points.length) {
      s.addText(
        points.map((txt) => ({
          text: txt,
          options: { bullet: { code: "25AA" }, breakLine: true, paraSpaceAfter: 16 },
        })),
        {
          x: G.ml,
          y: 3.05,
          w: G.contentW - 2.5,
          h: 3.0,
          fontSize: TYPE.execPoint,
          color: t.rule,
          fontFace: FONT,
        margin: 0,
          valign: "top",
        }
      );
    }
    if (meta) {
      s.addText(meta, {
        x: G.ml,
        y: 6.55,
        w: G.contentW,
        h: 0.3,
        fontSize: TYPE.footnote,
        color: mix(t.onDark, t.dark, 0.35),
        fontFace: FONT,
        margin: 0,
      });
    }
    return s;
  }

  /**
   * Weighted option scorecard: options (rows) scored 1..scale on weighted criteria
   * (columns), drawn as cell bars, with the weighted total out of 100 computed here
   * (never typed by hand) and the winner highlighted. Use when several strategies or
   * alternatives must be compared and one recommended.
   *   criteria: [{ label, weight }]   weights in % or fractions, normalised here
   *   options:  [{ id: "A", name, note, scores: [..] }]   one score per criterion
   *   verdict:  optional "Strategic choice" line under the table
   */
  weightedScorecard({ title, kicker, takeaway, criteria, options, scale = 5, verdict, verdictLabel = "Strategic choice:", source }) {
    const t = this.t, P = this.p;
    const s = this._new();
    this._frame(s, { title, kicker, source, takeaway });
    const wsum = criteria.reduce((a, c) => a + c.weight, 0);
    const wn = criteria.map((c) => c.weight / wsum);
    const totals = options.map((o) => Math.round(o.scores.reduce((a, v, i) => a + wn[i] * v / scale, 0) * 100));
    const best = totals.indexOf(Math.max(...totals));

    const optW = 3.75, scoreW = 1.45, gap = 0.12;
    // big bold score digits only need 3:1, so white usually works on the brand accent even when body text would not
    const lum = (h) => { const c = [0, 2, 4].map((k) => parseInt(h.slice(k, k + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
    const winInk = 1.05 / (lum(t.primary) + 0.05) >= 3 ? "FFFFFF" : t.onAccent;
    const critW = (G.contentW - optW - scoreW - gap) / criteria.length;
    const headH = 0.72, verdictH = verdict ? 0.62 : 0, vgap = verdict ? 0.18 : 0;
    const rowGap = 0.1;
    const rowH = Math.min(0.95, (this.bodyH - headH - verdictH - vgap - rowGap * options.length) / options.length);
    const y0 = G.bodyY;

    criteria.forEach((c, j) => {
      const x = G.ml + optW + j * critW;
      s.addText([{ text: c.label, options: { bold: true, color: t.ink, fontSize: TYPE.label - 2, breakLine: true } },
                 { text: `Weight ${Math.round(wn[j] * 100)}%`, options: { color: t.primary, fontSize: TYPE.label - 2, bold: true } }],
        { x: x + 0.05, y: y0, w: critW - 0.1, h: headH, fontFace: FONT, align: "center", valign: "bottom", margin: 0 });
    });
    s.addText([{ text: "Weighted score", options: { bold: true, color: t.ink, fontSize: TYPE.label - 1, breakLine: true } },
               { text: "out of 100", options: { color: t.primary, fontSize: TYPE.label - 2, bold: true } }],
      { x: G.ml + G.contentW - scoreW, y: y0, w: scoreW, h: headH, fontFace: FONT, align: "center", valign: "bottom", margin: 0 });

    options.forEach((o, i) => {
      const y = y0 + headH + 0.1 + i * (rowH + rowGap), win = i === best;
      s.addShape(P.ShapeType.rect, { x: G.ml, y, w: G.contentW - scoreW - gap, h: rowH,
        fill: { color: win ? t.white : t.wash }, line: win ? { color: t.primary, width: 2 } : { type: "none" } });
      const bd = Math.min(0.52, rowH - 0.25);
      s.addShape(P.ShapeType.ellipse, { x: G.ml + 0.15, y: y + (rowH - bd) / 2, w: bd, h: bd,
        fill: { color: win ? t.primary : t.white }, line: { color: t.primary, width: 1.5 } });
      s.addText(o.id, { x: G.ml + 0.15, y: y + (rowH - bd) / 2, w: bd, h: bd, fontFace: FONT, fontSize: 16, bold: true,
        color: win ? winInk : t.primary, align: "center", valign: "middle", margin: 0 });
      s.addText([{ text: o.name, options: { bold: true, fontSize: TYPE.label, color: t.ink, breakLine: !!o.note } },
                 ...(o.note ? [{ text: o.note, options: { italic: true, fontSize: TYPE.label - 2.5, color: t.mid } }] : [])],
        { x: G.ml + 0.3 + bd, y, w: optW - bd - 0.4, h: rowH, fontFace: FONT, valign: "middle", margin: 0, fit: "shrink" });
      o.scores.forEach((v, j) => {
        const cx = G.ml + optW + j * critW;
        const cell = Math.min(0.2, (critW - 0.5) / scale), cg = 0.03;
        const barW = scale * cell + (scale - 1) * cg, bx = cx + (critW - barW - 0.3) / 2, by = y + (rowH - cell) / 2;
        for (let k = 0; k < scale; k++) {
          s.addShape(P.ShapeType.rect, { x: bx + k * (cell + cg), y: by, w: cell, h: cell,
            fill: { color: k < v ? t.primary : t.white }, line: { color: k < v ? t.primary : t.rule, width: 0.75 } });
        }
        s.addText(String(v), { x: bx + barW + 0.05, y: by - 0.05, w: 0.25, h: cell + 0.1, fontFace: FONT, fontSize: TYPE.label - 2,
          color: t.ink, bold: true, valign: "middle", margin: 0 });
      });
      const sx = G.ml + G.contentW - scoreW;
      s.addShape(P.ShapeType.rect, { x: sx, y, w: scoreW, h: rowH, fill: { color: win ? t.primary : t.wash }, line: { type: "none" } });
      s.addText([{ text: String(totals[i]), options: { bold: true, fontSize: 26, color: win ? winInk : t.ink } },
                 { text: " /100", options: { fontSize: 11, color: win ? winInk : t.mid } }],
        { x: sx, y, w: scoreW, h: rowH, fontFace: FONT, align: "center", valign: "middle", margin: 0 });
    });

    if (verdict) {
      const vy = y0 + headH + 0.1 + options.length * (rowH + rowGap) - rowGap + vgap;
      this._box(s, G.ml, vy, G.contentW, verdictH, t.primary);
      s.addText([{ text: verdictLabel + " ", options: { bold: true, color: t.primary } }, { text: verdict, options: { color: t.ink } }],
        { x: G.ml + 0.25, y: vy, w: G.contentW - 0.5, h: verdictH, fontFace: FONT, fontSize: TYPE.label + 1, valign: "middle", margin: 0, fit: "shrink" });
    }
    s._scorecardTotals = totals;
    return s;
  }

  custom({ title, kicker, takeaway, source }) {
    const s = this._new();
    this._frame(s, { title, kicker, source, takeaway });
    return {
      slide: s,
      box: (x, y, w, h, color) => this._box(s, x, y, w, h, color),
      grid: { ...G, bodyH: this.bodyH },
      theme: this.t,
      type: TYPE,
      font: FONT,
      pptx: this.p,
      estHeight,
      estLines,
    };
  }

  save(file) {
    return this.p.writeFile({ fileName: file });
  }
}

module.exports = { Deck, G, FONT, TYPE, estHeight, estLines, makeTheme };
