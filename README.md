# deckforge

An early-stage harness that turns a brief (plus an optional source document) into a consulting-style PowerPoint deck, using any LLM through OpenRouter.

The idea under test: a good deck depends more on the harness than on the model. The model never places shapes by coordinates. It writes a JSON deck spec that picks components from a fixed library, and the harness owns layout, measurement and quality checks.

## Pipeline

1. **Storyline**: a stronger model writes the governing thought and the action titles. Structure rules are checked (`--approve` stops here for a human).
2. **Spec**: a cheaper model fills in every slide of the approved storyline as JSON.
3. **Lint**: structure rules (takeaways, no repeated archetype in a row, text budgets). Errors go back to the model.
4. **Build + QA**: `deckforge/build.cjs` renders the pptx with the engine; `engine/qa.py` checks overflow, overlaps and label-style titles. Errors go back to the model.
5. **Look**: slides are rendered to PNG and shown to the model for a reviewer pass. A revision is kept only if it still builds and passes QA.

## Layout

- `deckforge/`: the harness (`forge.py`), the spec builder (`build.cjs`), custom visual components and the house style rules
- `engine/`: the slide engine on top of pptxgenjs (`deck.js`, `theme.js`), the QA gate (`qa.py`) and the renderer (`render.sh`, needs LibreOffice and pdftoppm)
- `web/`: a minimal web front end (`app.py`, standard library only)

## Setup

```bash
cd engine && npm ci && cd ..
export OPENROUTER_API_KEY=...
python3 deckforge/forge.py --brief "Market entry for X in Hungary" --source brief.pdf --out mydeck
```

Run `python3 deckforge/forge.py --help` for the model options.

## Status

Experimental and rough. The interfaces will change.
