/**
 * example.js - builds a deck exercising every archetype.
 * Doubles as the smoke test: `node example.js /tmp/out.pptx`
 */
const { Deck } = require("./deck");

const out = process.argv[2] || "example.pptx";
const d = new Deck({
  title: "Market Entry Assessment",
  author: "Marveen",
  footer: "CLIENT CONFIDENTIAL | July 2026",
  // The palette is derived from the analysed company's real brand colours,
  // never hardcoded. See references/brand.md for how to source these.
  brand: { name: "Brauhaus", primary: "0F5C3F", secondary: "C8A046" },
});

d.cover({
  title: "Entering the German premium segment",
  subtitle: "Assessment of demand, competitive position, and the route to a EUR 40M revenue run-rate",
  meta: "Prepared for the Executive Committee | 15 July 2026",
});

d.executiveSummary({
  kicker: "Executive summary",
  title: "Germany is attractive, but only through a partner-led entry in year one",
  takeaway: "Approve partner-led entry now; waiting cedes the EUR 8-12 band to private label.",
  answer:
    "Enter Germany in Q1 2027 via a distribution partnership, not a direct salesforce: it reaches breakeven 18 months earlier and caps downside at EUR 6M.",
  points: [
    "Demand is real: the premium segment grows 11% p.a. and is underserved in the EUR 8-12 price band, where our margin is strongest.",
    "Direct entry is too slow: building a salesforce costs EUR 14M over three years and does not break even before 2031.",
    "Two partners cover 63% of the target retail footprint; both are open to exclusivity in exchange for a three-year term.",
    "The main risk is channel conflict with our Austrian business, which is contained by a clear territorial carve-out.",
  ],
  source: "Team analysis; Euromonitor 2026",
});

d.divider({ number: 1, title: "Analysis", blurb: "How large is the prize and who is already taking it" });

d.kpis({
  kicker: "Analysis | Market sizing",
  title: "The addressable premium segment is EUR 1.2B and growing three times faster than the category",
  takeaway: "The prize is large enough to justify entry, and it grows fastest where we are strongest.",
  stats: [
    { value: "EUR 1.2B", label: "Addressable premium segment, 2026", note: "Retail value" },
    { value: "11%", label: "Segment CAGR, 2023-26", note: "Category grows 3.4%" },
    { value: "63%", label: "Retail footprint via top 2 partners", note: "Weighted distribution" },
    { value: "EUR 40M", label: "Revenue run-rate by 2030", note: "Base case" },
  ],
  body:
    "Growth is concentrated in the EUR 8-12 price band, which now accounts for 44% of segment value versus 31% three years ago. This is precisely the band where our gross margin exceeds 52%.",
  source: "Euromonitor 2026; Nielsen retail panel",
});

d.chart({
  kicker: "Analysis | Competitive landscape",
  title: "Three incumbents hold 71% of the segment, but none is strong in the EUR 8-12 band",
  takeaway: "The gap in the EUR 8-12 band is our entry point, not a head-on fight with incumbents.",
  type: "bar",
  numFmt: '0"%"',
  highlight: 5, // our own position
  data: [
    {
      name: "Segment share",
      labels: ["Nordwerk", "Brauhaus Sud", "Kellermann", "Others", "Private label", "Us (Austria)"],
      values: [28, 24, 19, 13, 12, 4],
    },
  ],
  insights: [
    "The top three compete almost entirely above EUR 12, leaving the fastest-growing band contested only by private label.",
    "Private label wins on price, not brand, and has no premium credibility to defend.",
    "Our Austrian brand already has 4% unaided awareness in Bavaria with zero media spend.",
  ],
  source: "Nielsen retail panel, Q1 2026",
});

d.chart({
  kicker: "Analysis | Trajectory",
  title: "Partner-led entry reaches breakeven in 2028, three years ahead of a direct build",
  takeaway: "Speed to breakeven, not peak margin, decides the route.",
  type: "line",
  data: [
    { name: "Partner-led", labels: ["2027", "2028", "2029", "2030", "2031"], values: [-4.2, 0.8, 6.5, 12.1, 17.4] },
    { name: "Direct salesforce", labels: ["2027", "2028", "2029", "2030", "2031"], values: [-6.1, -5.4, -3.2, -0.9, 2.6] },
  ],
  insights: [
    "Partner-led turns cash-positive in 2028 and compounds from a lower fixed base.",
    "The direct model carries EUR 14M of cumulative investment before its first positive year.",
    "Switching from partner to direct in 2030 remains open and is cheaper than starting direct.",
  ],
  source: "Team model, base case",
});

d.divider({ number: 2, title: "Strategy", blurb: "How we enter, with whom, and what could go wrong" });

d.matrix({
  kicker: "Strategy | Option assessment",
  title: "Partner-led entry is the only option that combines high reach with contained downside",
  takeaway: "Partner-led wins because it is the only option with both reach and a capped downside.",
  xAxis: "Retail reach in year one",
  yAxis: "Downside contained",
  quadrants: [
    { label: "Licensing", note: "Low capital at risk, but reach depends entirely on a licensee we do not control. Margin ceiling of 18%." },
    { label: "Partner-led entry", note: "63% weighted distribution from month one, EUR 6M downside cap, exclusivity available for a three-year term.", highlight: true },
    { label: "Do nothing", note: "No downside, no upside. Cedes the EUR 8-12 band to private label permanently." },
    { label: "Direct salesforce", note: "Full control and margin, but EUR 14M invested before breakeven and no revenue before month 14." },
  ],
  source: "Team analysis",
});

d.table({
  kicker: "Strategy | Partner comparison",
  title: "Nordkette offers better reach; Sudhandel offers better terms and a faster start",
  takeaway: "Lead with Nordkette for reach; keep Sudhandel as the fallback that protects our terms.",
  rows: [
    ["Criterion", "Nordkette Distribution", "Sudhandel Gruppe", "Implication"],
    ["Weighted distribution", "41%", "34%", "Nordkette reaches more shelf"],
    ["Premium credibility", "High", "Medium", "Nordkette fits the brand better"],
    ["Margin to partner", "32%", "26%", "Sudhandel is EUR 2.4M cheaper p.a."],
    ["Exclusivity offered", "Three years", "Two years", "Nordkette locks the position longer"],
    ["Earliest start", "Q2 2027", "Q1 2027", "Sudhandel starts a quarter sooner"],
    ["Austrian conflict", "Contained", "Requires carve-out", "Both are manageable"],
  ],
  colW: [1.3, 1.1, 1.1, 1.7],
  source: "Partner discussions, June 2026",
});

d.twoUp({
  kicker: "Strategy | Risk",
  title: "The two live risks are channel conflict and pilot rate of sale, both mitigable before the gate",
  takeaway: "Neither risk blocks the decision; both are closed before money is committed.",
  left: {
    heading: "What could go wrong",
    body: [
      "Channel conflict: German listings cannibalise Austrian volume through cross-border retail buying.",
      "Rate of sale: the Bavaria pilot fails to clear 2.4 units per store per week, breaking the rollout economics.",
      "Partner concentration: a single partner controls our entire route to the German consumer.",
    ],
  },
  right: {
    heading: "What we do about it",
    body: [
      "Territorial carve-out written into the term sheet, with pricing corridors that remove the arbitrage.",
      "Gate the rollout on pilot performance; the EUR 6M cap means a failed pilot is survivable.",
      "Keep the direct option costed and open, and hold the second partner warm through the pilot.",
    ],
  },
  source: "Team analysis",
});

d.divider({ number: 3, title: "Implementation", blurb: "The gated plan from shortlist to national listing" });

d.process({
  kicker: "Implementation | Roadmap",
  title: "Four gated stages take us from partner shortlist to national listing in 14 months",
  takeaway: "Each gate is a stop-or-go decision, so the downside stays capped at every stage.",
  steps: [
    { label: "Shortlist\n& approach", note: "Confirm the two-partner shortlist and open commercial talks. Gate: signed NDAs." },
    { label: "Negotiate\nterms", note: "Agree exclusivity, margin split, and the Austrian territorial carve-out. Gate: term sheet." },
    { label: "Bavaria\npilot", note: "Six-month pilot in 180 stores to validate rate of sale. Gate: 2.4 units/store/week." },
    { label: "National\nrollout", note: "Scale to national listing and switch on media support. Gate: pilot economics hold." },
  ],
  source: "Team analysis",
});

d.closing({
  title: "What we need from the Committee",
  points: [
    "Approve partner-led entry as the German route to market, with a Q1 2027 start.",
    "Release EUR 6M for the pilot phase, gated on the term sheet being signed by December.",
    "Mandate the Austrian carve-out so partner negotiations can close before year end.",
  ],
  meta: "Decision requested: 29 July 2026",
});

d.save(out).then(() => console.log("written:", out));
