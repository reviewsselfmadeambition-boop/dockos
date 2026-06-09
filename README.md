# DockOS

A Work OS for small port drayage operators (San Pedro Bay — Long Beach / LA).
Dispatch board, per-diem free-time alerts, broker pay tracking, one-tap
invoicing, and CARB/ZEV compliance. Data persists in your browser via
localStorage — no backend, no account.

---

## Run it locally

You need [Node.js](https://nodejs.org) 18 or newer.

```bash
npm install
npm run dev
```

Open the URL it prints (usually http://localhost:5173).

---

## Deploy to GitHub Pages

### One-time setup

1. Create a repo on GitHub named **`dockos`** and push this folder to it:
   ```bash
   git init
   git add .
   git commit -m "DockOS initial commit"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/dockos.git
   git push -u origin main
   ```
2. In the repo on GitHub: **Settings → Pages → Build and deployment → Source**,
   choose **GitHub Actions**.

That's it. Every push to `main` builds and publishes automatically via the
included workflow (`.github/workflows/deploy.yml`). Your live site will be at:

```
https://YOUR_USERNAME.github.io/dockos/
```

### Important: the repo name must match `base`

`vite.config.js` has `base: "/dockos/"`. This MUST match your repo name, or the
page loads blank (CSS/JS 404s). Rules:

| Your repo | Set `base` to |
|---|---|
| `github.com/you/dockos` | `"/dockos/"` (default, already set) |
| `github.com/you/my-app` | `"/my-app/"` |
| `github.com/you/you.github.io` | `"/"` |
| Custom domain | `"/"` |

---

## Manual deploy (alternative to Actions)

If you'd rather push the built site by hand:

```bash
npm run deploy
```

This builds and pushes `dist/` to a `gh-pages` branch using the `gh-pages`
package. If you use this method, set **Settings → Pages → Source** to
**Deploy from a branch → gh-pages → / (root)** instead of GitHub Actions.

---

## Project layout

```
dockos/
├─ index.html              # entry point
├─ vite.config.js          # build config (base path lives here)
├─ package.json
├─ .github/workflows/
│  └─ deploy.yml            # auto-deploy to Pages on push to main
└─ src/
   ├─ main.jsx              # mounts React
   └─ DockOS.jsx            # the entire app
```

## Resetting the data

DockOS ships with sample Long Beach loads. To wipe everything and start clean,
open your browser console on the site and run:

```js
localStorage.removeItem("dockos:data:v1"); location.reload();
```
