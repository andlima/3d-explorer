# 3d-explorer

A static, build-free 3D scene playground using Three.js loaded over an importmap.

## Run locally

ES modules require an HTTP origin, so opening `index.html` via `file://` will
not work. Serve the repo root with any static server, for example:

```bash
python3 -m http.server 8000
```

Then open <http://localhost:8000/>.

## Deploy on GitHub Pages

The site is just static files at the repo root, so no build step is needed.

1. Push to `main`.
2. In the GitHub repo, go to **Settings → Pages**.
3. Under **Source**, choose **Deploy from a branch**.
4. Set the branch to `main` and the folder to `/` (root). Save.
5. Wait for the Pages deployment to complete; the site will be available at
   `https://<user>.github.io/3d-explorer/`.
