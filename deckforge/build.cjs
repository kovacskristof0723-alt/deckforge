// deckforge builder: deck spec (JSON) -> pptx through the consulting-deck engine.
//   node build.cjs spec.json out.pptx
// Prints one JSON line: {ok, errors:[{slide, type, message}]}. A slide that
// throws is skipped and reported, so the model gets a precise error to fix.
// Spec: {meta, slides: [...main...], appendix?: [...{supports: N, ...}]}.
// Appendix slides are numbered A1..An after an "Appendix" divider; the main
// slide they back gets "Backup: A2" appended to its source line.
const fs = require("fs");
const { Deck } = require("../engine/deck");
const { mk } = require("./components.cjs");
const { mk2 } = require("./components2.cjs");
const { mk3 } = require("./components3.cjs");

const [, , specPath, out] = process.argv;
const spec = JSON.parse(fs.readFileSync(specPath, "utf8"));
const m = spec.meta || {};
const d = new Deck({
  title: m.title || "", author: m.author || "", footer: m.footer || "",
  brand: { name: m.company || "", primary: (m.brandPrimary || "1F3A5F").replace("#", ""),
           ...(m.brandSecondary ? { secondary: m.brandSecondary.replace("#", "") } : {}) },
  ...(m.logo ? { logo: m.logo } : {}),
});
const comp = { ...mk(d), ...mk2(d), ...mk3(d) };
const ENGINE = ["cover", "divider", "executiveSummary", "bullets", "kpis", "chart", "waterfall",
                "matrix", "process", "table", "twoUp", "closing", "weightedScorecard"];
const STACK = { stackedCol: ["col", "col", "stacked"], stackedBar: ["bar", "bar", "stacked"],
                percentCol: ["col", "col", "percentStacked"], percentBar: ["bar", "bar", "percentStacked"] };
const errors = [];
const main = spec.slides || [], app = spec.appendix || [];

// the frame prints "Source: " itself; models often repeat it
[...main, ...app].forEach((sl) => { if (typeof sl.source === "string") sl.source = sl.source.replace(/^\s*(source|sources)\s*:\s*/i, ""); });
// methodology step labels: the circle already shows the number
app.forEach((sl) => (sl.steps || []).forEach((st) => { if (st && typeof st.label === "string") st.label = st.label.replace(/^\s*\d+[.)]?\s+/, ""); }));

// backup references on the main slides
app.forEach((a, k) => {
  const tgt = main[(a.supports || 0) - 1];
  if (tgt) tgt.source = `${tgt.source || ""}${tgt.source ? " | " : ""}Backup: A${k + 1}`;
});

function draw(sl, idx) {
  const { type, supports, ...args } = sl;
  if (type === "chart" && args.chartType) {
    const st = STACK[args.chartType];
    if (st) { args.type = st[0]; args.chartOpts = { ...(args.chartOpts || {}), barDir: st[1], barGrouping: st[2] }; }
    else args.type = args.chartType;
    delete args.chartType;
  }
  try {
    if (ENGINE.includes(type)) d[type](args);
    else if (comp[type]) comp[type](args);
    else throw new Error(`unknown slide type "${type}"`);
  } catch (e) {
    errors.push({ slide: idx, type, message: String(e.message || e) });
  }
}
main.forEach((sl, i) => draw(sl, i + 1));
if (app.length) {
  draw({ type: "divider", number: "A", title: "Appendix", blurb: "Method, calculations, assumptions and backup analyses" }, "appendix-divider");
  app.forEach((sl, k) => draw({ ...sl, kicker: `Appendix A${k + 1} | ${(sl.kicker || "").split("|").pop().trim() || "Backup"}` }, `A${k + 1}`));
}
d.save(out).then(() => console.log(JSON.stringify({ ok: errors.length === 0, errors })));
