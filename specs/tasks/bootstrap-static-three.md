---
id: bootstrap-static-three
area: bootstrap
priority: 50
depends_on: []
description: Standalone index.html with Three.js via importmap rendering a spinning lit cube; GitHub Pages-ready, no build step
---

# Bootstrap: Standalone Three.js `index.html`

## Goal

Create the project's first runnable artifact: a single `index.html` at the
repo root that renders a spinning, lit cube using vanilla Three.js loaded from
unpkg via an importmap. The page must be servable as static files with no build
step, so GitHub Pages can host it directly. This is the foundation that future
3d-explorer tasks build on.

## Acceptance Criteria

1. `index.html` exists at the repo root and is fully self-contained — no
   `package.json`, no `node_modules`, no build output.
2. Three.js is loaded via an `<script type="importmap">` pointing at unpkg with
   a pinned version (e.g. `three@0.160.0`); the application code uses
   `import * as THREE from 'three'` rather than hard-coded CDN URLs.
3. The scene renders a single cube mesh with a material that responds to lighting
   (e.g. `MeshStandardMaterial`), illuminated by at least one directional light
   plus an ambient light. The cube is visibly not flat-shaded.
4. The cube rotates continuously via a `requestAnimationFrame` loop.
5. A perspective camera is positioned so the cube is fully in view on load.
6. The renderer fills the viewport and updates correctly on window resize
   (canvas size + camera aspect both updated). `window.devicePixelRatio` is
   applied for crisp rendering.
7. All asset/resource references are relative paths (no leading `/`), so the
   page works when served from a GitHub Pages project subpath like
   `https://<user>.github.io/3d-explorer/`.
8. A `README.md` at the repo root documents:
   - One-line project description
   - How to run locally (e.g. `python3 -m http.server 8000` then open
     `http://localhost:8000/`) and a note that opening the file via `file://`
     will not work because ES modules require an HTTP origin
   - How to enable GitHub Pages for this repo (Settings → Pages → Source:
     "Deploy from a branch", branch `main`, folder `/`)
9. Manual verification: serving the directory with a local static server and
   loading the page in a current browser shows the spinning lit cube with no
   console errors.

## Out of Scope

- Camera controls (OrbitControls, pointer-lock, WASD) — defer to a follow-up task.
- Loading external models (GLTF, OBJ, textures from disk).
- TypeScript, Vite, or any build/bundler tooling.
- A `package.json` or any npm dependencies.
- Automated GitHub Pages deployment via Actions (manual enable only, per spec).
- Automated tests / test framework setup (no harness exists yet; verification
  is manual for this task).
- Multiple scenes, scene switching, UI overlays.

## Design Notes

- **Single-file layout.** Put HTML, importmap, and the entry script in
  `index.html`. If the entry script grows beyond ~80 lines it is fine to extract
  it to a sibling `main.js` and reference it with `<script type="module"
  src="./main.js">` — but keep the importmap in `index.html`.
- **Importmap example** (pin an explicit version; do not use `latest`):
  ```html
  <script type="importmap">
    {
      "imports": {
        "three": "https://unpkg.com/three@0.160.0/build/three.module.js"
      }
    }
  </script>
  ```
  If a more recent stable Three.js release is available at implementation time,
  pin to that instead — but always pin a specific version.
- **Material choice matters.** `MeshBasicMaterial` ignores lights and would
  hide a lighting bug. Use `MeshStandardMaterial` (or `MeshLambertMaterial`).
- **Resize handling.** Add a `resize` listener that updates
  `renderer.setSize(innerWidth, innerHeight)` and
  `camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix()`.
- **Body styling.** Reset default body margin (`margin: 0`) and set the canvas
  to `display: block` so there is no scrollbar / sub-pixel gap.
- **Relative paths only.** Do not use leading-slash URLs like `/main.js` —
  they break under the GitHub Pages project subpath. Use `./main.js`.

## Agent Notes

- Verify by running a local static server from the repo root (e.g.
  `python3 -m http.server 8000`) and loading `http://localhost:8000/` in a
  browser. The cube must visibly rotate and be lit (visible shading on
  faces, not a flat silhouette). `file://` will fail — that is expected.
- Keep the implementation tiny. This task is intentionally a thin foundation;
  resist adding controls, multiple meshes, post-processing, or abstractions.
- Do not create a `package.json`, `vite.config.*`, or any `.github/workflows/`
  files — Pages is documented but not auto-deployed in this task.
- Read `AGENTS.md` first; in particular, do all edits inside the provided
  worktree (never the main checkout).
- The repo currently contains only `AGENTS.md`, `CLAUDE.md`, `.spec.toml`,
  `specs/`, and `.github/`. Adding `index.html` and `README.md` at the root is
  the expected shape after this task.
