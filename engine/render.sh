#!/usr/bin/env bash
# render.sh <deck.pptx> [outdir] - rasterise a deck so it can actually be looked at.
#
# pptx -> pdf (LibreOffice) -> png per slide (pdftoppm). The PNGs are the
# review artefact: read them back with the Read tool and check the layout the
# way a human would. Never ship a deck you have not looked at.
set -euo pipefail

PPTX="${1:?usage: render.sh <deck.pptx> [outdir]}"
OUT="${2:-$(dirname "$PPTX")/preview}"

command -v soffice >/dev/null || { echo "soffice missing: apt-get install -y libreoffice-impress" >&2; exit 1; }
command -v pdftoppm >/dev/null || { echo "pdftoppm missing: apt-get install -y poppler-utils" >&2; exit 1; }

# Preview fidelity depends on the Avenir -> Montserrat substitution (see
# SKILL.md Gotchas). Without it LibreOffice falls back to DejaVu Sans, which
# wraps differently from what deck.js and qa.py measured.
if [ "$(fc-match -f '%{family[0]}' 'Avenir Next LT Pro')" != "Montserrat" ]; then
  echo "WARNING: Avenir Next LT Pro does not map to Montserrat; preview will not match." >&2
  echo "         restore /etc/fonts/conf.d/99-avenir-preview-substitute.conf and run fc-cache -f" >&2
fi

mkdir -p "$OUT"
BASE="$(basename "${PPTX%.*}")"

# -env:UserInstallation gives this run its own profile; without it a second
# concurrent soffice silently does nothing.
soffice --headless \
        -env:UserInstallation="file:///tmp/lo-render-$$" \
        --convert-to pdf --outdir "$OUT" "$PPTX" >/dev/null 2>&1

[ -f "$OUT/$BASE.pdf" ] || { echo "pdf conversion failed for $PPTX" >&2; exit 1; }

pdftoppm -png -r 110 "$OUT/$BASE.pdf" "$OUT/slide"

echo "rendered:"
ls -1 "$OUT"/slide-*.png 2>/dev/null || ls -1 "$OUT"/slide*.png
