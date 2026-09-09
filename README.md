# databricks-workspace-setup-app

A tiny **client-side-only** web app (HTML + JS, no build step, no backend). Scaffold —
replace with your app.

## Run locally

Just open `index.html` in a browser, or serve the folder:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

## Files

- `index.html` — the page
- `app.js` — client-side logic
- `style.css` — styles (theme-aware: light/dark)

## Deploy (GitHub Pages)

This repo is hosted on GitHub Pages from `main` / root:

- **Settings → Pages → Build and deployment → Source: Deploy from a branch**, branch `main`, folder `/ (root)`.
- Live URL: `https://klevisa.github.io/databricks-workspace-setup-app/`

Everything is static and shipped to the browser — don't put secrets here.
