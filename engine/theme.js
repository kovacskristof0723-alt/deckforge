/**
 * theme.js - derive a full deck palette from a company's brand colours.
 *
 * Why this exists: hardcoding one navy makes every deck look like the same
 * deck. But you cannot simply drop a brand colour into a template either -
 * brand colours are chosen for logos, not for 13pt text on a filled panel.
 * Ferrari red and Deutsche Post yellow both "work" as a brand primary and
 * neither is safe as a text colour or a dark field.
 *
 * So: take the brand colour as the *seed*, derive everything else from it
 * under luminance and contrast constraints, and never let a derived colour
 * carry text it cannot support.
 */

// ---------------------------------------------------------------------------
// Colour maths
// ---------------------------------------------------------------------------

const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));

function hexToRgb(hex) {
  const h = String(hex).replace("#", "").trim();
  const n = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  return [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) / 255);
}

function rgbToHex([r, g, b]) {
  return [r, g, b]
    .map((v) => Math.round(clamp(v) * 255).toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

function rgbToHsl([r, g, b]) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [h, s, l];
}

function hslToRgb([h, s, l]) {
  if (s === 0) return [l, l, l];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [f(h + 1 / 3), f(h), f(h - 1 / 3)];
}

/** WCAG relative luminance. */
function luminance(hex) {
  const [r, g, b] = hexToRgb(hex).map((c) =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio, 1..21. */
function contrast(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

const withL = (hex, l) => rgbToHex(hslToRgb([...rgbToHsl(hexToRgb(hex)).slice(0, 2), clamp(l)]));
const withS = (hex, s) => {
  const [h, , l] = rgbToHsl(hexToRgb(hex));
  return rgbToHex(hslToRgb([h, clamp(s), l]));
};
const rotate = (hex, deg) => {
  const [h, s, l] = rgbToHsl(hexToRgb(hex));
  return rgbToHex(hslToRgb([(h + deg / 360 + 1) % 1, s, l]));
};
const mix = (a, b, t) => {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  return rgbToHex(A.map((v, i) => v + (B[i] - v) * t));
};

/** Pick whichever of light/dark reads better on bg. Never guess. */
function textOn(bg, light = "FFFFFF", dark = "0A0F14") {
  return contrast(bg, light) >= contrast(bg, dark) ? light : dark;
}

/**
 * Darken a hue until white text clears `min` contrast on it. Used for the
 * navy-equivalent field: whatever the brand hue is, the dark field must
 * support white text.
 */
function toDarkField(hex, min = 11) {
  const [h, s] = rgbToHsl(hexToRgb(hex));
  // Desaturate slightly: fully saturated dark fields vibrate behind text.
  const sat = clamp(s * 0.85, 0, 0.7);
  for (let l = 0.22; l >= 0.04; l -= 0.01) {
    const c = rgbToHex(hslToRgb([h, sat, l]));
    if (contrast(c, "FFFFFF") >= min) return c;
  }
  return rgbToHex(hslToRgb([h, sat, 0.05]));
}

/**
 * Force a hue to a luminance band where it works as an accent on white:
 * bright enough to read as the brand colour, dark enough for a data label
 * to sit beside it.
 */
function toAccent(hex, minContrastOnWhite = 3.0) {
  const [h, s] = rgbToHsl(hexToRgb(hex));
  const sat = clamp(Math.max(s, 0.55), 0, 1);
  for (let l = 0.55; l >= 0.2; l -= 0.01) {
    const c = rgbToHex(hslToRgb([h, sat, l]));
    if (contrast(c, "FFFFFF") >= minContrastOnWhite) return c;
  }
  return rgbToHex(hslToRgb([h, sat, 0.3]));
}

// ---------------------------------------------------------------------------
// Theme
// ---------------------------------------------------------------------------

/**
 * @param {object} brand
 * @param {string} brand.primary    the company's main brand hex (required)
 * @param {string} [brand.secondary] a second brand hex; derived if absent
 * @param {string} [brand.name]      for provenance only
 * @returns full palette used by deck.js
 */
function makeTheme(brand = {}) {
  const primary = (brand.primary || "051C2C").replace("#", "");
  const secondary = brand.secondary
    ? brand.secondary.replace("#", "")
    // No second brand colour: rotate 150 degrees for a distinguishable but
    // related hue rather than inventing an unrelated one.
    : rotate(primary, 150);

  const dark = toDarkField(primary);
  const accent = toAccent(primary);
  const accent2 = toAccent(secondary);

  // Neutrals are tinted toward the brand hue so greys belong to the deck
  // rather than looking like a different template underneath.
  const [h] = rgbToHsl(hexToRgb(primary));
  const neutral = (l, s = 0.08) => rgbToHex(hslToRgb([h, s, l]));

  /**
   * Walk a tinted neutral darker until it clears `target` contrast on white.
   * Footnotes and axis labels are small text; "looks grey enough" is not a
   * standard, 4.5:1 is. Starting light and stepping down keeps the colour as
   * light as it is allowed to be rather than defaulting to near-black.
   */
  const neutralOnWhite = (startL, target, s = 0.06) => {
    for (let l = startL; l >= 0.05; l -= 0.01) {
      const c = neutral(l, s);
      if (contrast(c, "FFFFFF") >= target) return c;
    }
    return neutral(0.05, s);
  };

  const theme = {
    name: brand.name || "",
    // Structural
    dark, // dark fields: cover, dividers, exec answer band, table header
    ink: neutralOnWhite(0.22, 12, 0.12), // body text on white
    mid: neutralOnWhite(0.5, 4.6, 0.06), // labels, axis, footnotes (small text)
    rule: neutral(0.82, 0.05), // hairlines, borders (never carries text)
    wash: neutral(0.955, 0.04), // panel fills, zebra rows
    white: "FFFFFF",
    // Brand
    primary: accent,
    secondary: accent2,
    // Semantics. Kept hue-independent: a green brand does not get to make
    // "negative" green.
    good: "1E8E3E",
    bad: "D0021B",
    // Categorical ramp. Ordered so the first three carry most charts.
    series: [
      dark,
      accent,
      mix(accent, "FFFFFF", 0.42),
      accent2,
      mix(accent2, "FFFFFF", 0.42),
      neutral(0.55, 0.05),
    ],
  };

  // Takeaway: the brand's second hue, so conclusions never read as data
  // (primary carries the series). Fill is a pale tint; the label ink is the
  // hue walked darker until it clears 4.5:1 on that tint.
  // Red and green are reserved for bad/good, and a navy brand's rotated
  // second hue lands on red: a takeaway band in red reads as an alarm. So a
  // red- or green-ish hue falls back to a fixed amber. brand.takeaway wins.
  const [th] = rgbToHsl(hexToRgb(accent2));
  const hueDeg = th <= 1 ? th * 360 : th;
  const semantic = hueDeg < 25 || hueDeg > 335 || (hueDeg > 85 && hueDeg < 165);
  theme.takeaway = brand.takeaway ? brand.takeaway.replace("#", "") : semantic ? "D08A0A" : accent2;
  theme.takeawayFill = mix(theme.takeaway, "FFFFFF", 0.86);
  theme.takeawayInk = theme.takeaway;
  for (let k = 0; k <= 1 && contrast(theme.takeawayInk, theme.takeawayFill) < 4.5; k += 0.05) {
    theme.takeawayInk = mix(theme.takeaway, "000000", k);
  }

  // Text colours are decided by contrast, not by assumption.
  theme.onDark = textOn(theme.dark);
  theme.onAccent = textOn(theme.primary);
  theme.onWash = textOn(theme.wash);

  return theme;
}

/** Default: the classic consulting navy. Used when no brand is supplied. */
const DEFAULT_THEME = makeTheme({ primary: "0A2540", secondary: "2251FF", name: "default" });

/**
 * Report a theme's readability so a human can sanity-check a brand palette.
 * Anything below 4.5 for body text is a fail.
 */
function auditTheme(t) {
  return [
    ["body ink on white", contrast(t.ink, "FFFFFF")],
    ["mid on white", contrast(t.mid, "FFFFFF")],
    ["text on dark field", contrast(t.dark, t.onDark)],
    ["accent on white", contrast(t.primary, "FFFFFF")],
    ["ink on wash", contrast(t.ink, t.wash)],
    ["series1 vs series2", contrast(t.series[0], t.series[1])],
  ].map(([label, v]) => ({ label, ratio: Math.round(v * 100) / 100 }));
}

module.exports = {
  makeTheme,
  auditTheme,
  DEFAULT_THEME,
  contrast,
  luminance,
  textOn,
  mix,
  withL,
  withS,
  rotate,
  toDarkField,
  toAccent,
};
