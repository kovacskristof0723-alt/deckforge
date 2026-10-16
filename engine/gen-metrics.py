#!/usr/bin/env python3
"""
gen-metrics.py - dump per-character advance widths to metrics.json.

Why: deck.js sizes panels to their content, and a flat "average character
width" constant is a lie for a proportional font - 'W' and 'i' are not the
same. Guessing produced KPI numbers that wrapped into their own labels.

We measure Montserrat, not Avenir Next LT Pro: Avenir is commercial and not
installed here. Montserrat is the geometric stand-in used for preview
rendering and is slightly WIDER than Avenir, so every fit decision made from
these numbers errs toward "fits on the author's machine too".

Output: widths in inches per point of font size, per character.
Re-run only if the substitute font changes.
"""
import json
import os
import sys

from PIL import ImageFont

FONTS = {
    "regular": "/usr/share/fonts/truetype/montserrat/Montserrat-Regular.ttf",
    "bold": "/usr/share/fonts/truetype/montserrat/Montserrat-Bold.ttf",
}

# Printable ASCII plus the symbols decks actually use.
CHARS = [chr(c) for c in range(32, 127)] + list("€£→—–‘’“”•·%±≥≤×")

SIZE = 200  # measure large, scale down: quantisation error becomes negligible


def main():
    out = {"_note": "inches per point of font size, per character", "fonts": {}}
    for name, path in FONTS.items():
        if not os.path.exists(path):
            sys.exit(f"missing font: {path}")
        f = ImageFont.truetype(path, SIZE)
        widths = {}
        for ch in CHARS:
            widths[ch] = round(f.getlength(ch) / 72.0 / SIZE, 6)
        # Fallback for anything not in the table.
        widths["_default"] = round(
            sum(widths[c] for c in "abcdefghijklmnopqrstuvwxyz") / 26, 6
        )
        out["fonts"][name] = widths
    dest = os.path.join(os.path.dirname(os.path.abspath(__file__)), "metrics.json")
    with open(dest, "w") as fh:
        json.dump(out, fh, indent=0, ensure_ascii=False)
    print("wrote", dest)
    for name in FONTS:
        w = out["fonts"][name]
        print(f"  {name}: {len(w)-1} chars, avg lowercase {w['_default']:.5f} in/pt")


if __name__ == "__main__":
    main()
