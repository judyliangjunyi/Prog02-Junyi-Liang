# Show Your Work — CS160 PROG 02
*A voter guide that cites every line.*

A single-page, nonpartisan voter guide for four Nov 3, 2026 California measures and five Alameda County down-ballot offices.
**Class assignment. Not official voter information. Do not deploy publicly.**

## Where the API key goes (graders)
Either of these. The key is never committed.
1. **In the page:** paste your OpenRouter key into the **"OpenRouter key"** field in the top-right header. It is kept in this browser's localStorage.
2. **In a file:** copy `js/config.local.example.js` to `js/config.local.js` and paste the key there. `js/config.local.js` is in `.gitignore`.

All API calls are made in **`js/api.js`** (`askModel()` for text, `makeImage()` for images).

## Run
Double-click `index.html` (the data pack is also bundled as `data/datapack.js`, so no server is needed). Or serve the folder:
```
python -m http.server 8000      # or python3 on Mac
```
Then open http://localhost:8000

## Files
| file | what it is |
|---|---|
| `index.html` | the page (three tabs) |
| `js/api.js` | every OpenRouter call, the cost ledger (from `usage.cost`), and the localStorage cache |
| `js/prompts.js` | every prompt template, the reading levels and lengths, topic keyword lists, and the image scenes and template |
| `js/app.js` | the interface |
| `js/fk.js` | Flesch–Kincaid grade (from the course examples) |
| `data/datapack.json` | the only source of facts (from the course examples). The official summary is shown to users but never sent to a model |
