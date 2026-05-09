---
id: add-orbit-controls
area: scene
priority: 50
depends_on: [bootstrap-static-three]
description: Add Three.js OrbitControls (rotate/zoom/pan) plus a UI toggle that turns the cube's auto-rotation on and off
---

# Add OrbitControls and Auto-Rotation Toggle

## Goal

Make the scene interactive: the user can rotate, zoom, and pan the camera with
a mouse/trackpad/touch using Three.js `OrbitControls`. The cube's existing
self-rotation stays available but becomes user-controllable through a small
on-screen toggle so it does not fight the user's camera input.

## Acceptance Criteria

1. The importmap in `index.html` is extended so addon modules from the same
   pinned `three` version can be imported by name. Specifically, add a
   `"three/addons/"` mapping pointing at the matching unpkg
   `examples/jsm/` path (e.g.
   `https://unpkg.com/three@0.160.0/examples/jsm/`). Do not introduce a new
   pinned version; reuse whatever is already pinned for `three`.
2. `OrbitControls` is imported via the bare specifier
   `import { OrbitControls } from 'three/addons/controls/OrbitControls.js';`
   — no hard-coded `unpkg.com` URLs in the application code.
3. An `OrbitControls` instance is created against the existing camera and
   `renderer.domElement`. Rotate, zoom, and pan are all enabled (the
   OrbitControls defaults — left-drag rotates, wheel/pinch zooms, right-drag
   or two-finger drag pans).
4. `controls.enableDamping = true;` and `controls.update()` is called once per
   frame inside the animation loop so damping feels smooth.
5. The page renders a small UI control overlaid on the canvas that toggles the
   cube's auto-rotation. It is a real interactive form control (e.g.
   `<input type="checkbox">` with a `<label>`, or a `<button>` with
   `aria-pressed`) — not a div pretending to be a checkbox.
6. The toggle is visible and legible against the dark background (e.g. fixed
   to a corner with a semi-transparent background and readable text). It must
   not block the entire canvas — clicking the toggle changes the toggle and
   does not start an OrbitControls drag.
7. The cube's auto-rotation defaults to **on** at page load (preserving the
   current spinning-cube behavior). When the toggle is off, the cube does not
   rotate on its own; the user can still orbit/zoom/pan freely.
8. The existing per-frame rotation increments are gated by the toggle state
   (e.g. `if (autoRotate) { cube.rotation.x += …; cube.rotation.y += …; }`),
   not removed.
9. Window resize behavior still works (canvas size + camera aspect updated)
   and `window.devicePixelRatio` is still honored.
10. Loading the page in a current browser shows the cube, allows left-drag to
    orbit / wheel to zoom / right-drag to pan, and the toggle starts/stops the
    cube's spin. No console errors or warnings about missing modules.
11. The page remains a build-free static site: no `package.json`, no
    `node_modules`, no bundler config. All resource references stay relative
    so the page still works under the GitHub Pages project subpath
    (`https://<user>.github.io/3d-explorer/`).

## Out of Scope

- First-person / pointer-lock / WASD controls.
- Custom camera limits (min/max distance, polar angle clamps) beyond
  OrbitControls defaults.
- A settings panel or GUI library (`lil-gui`, `dat.gui`, etc.). The toggle is
  plain HTML/CSS only.
- Persisting the toggle state across reloads (no `localStorage`).
- Loading external models or textures.
- Adding TypeScript, a bundler, or any npm tooling.
- Automated tests / Playwright / visual regression — verification stays manual.

## Design Notes

- **Importmap shape.** OrbitControls' source does
  `import { … } from 'three';`, so the addon path mapping is required; loading
  OrbitControls from a different `three` version will throw "multiple
  instances of THREE" warnings or fail outright. Pin both entries to the
  same version:
  ```html
  <script type="importmap">
    {
      "imports": {
        "three": "https://unpkg.com/three@0.160.0/build/three.module.js",
        "three/addons/": "https://unpkg.com/three@0.160.0/examples/jsm/"
      }
    }
  </script>
  ```
- **Damping requires update().** With `enableDamping = true`, OrbitControls
  needs `controls.update()` called every frame, not just on input. Put it in
  the existing `requestAnimationFrame` loop.
- **Toggle placement.** A `position: fixed` element in the top-right or
  top-left corner with a small padding, semi-transparent dark background, and
  light text works well. Keep it tiny — one checkbox + label.
- **Pointer interactions.** The toggle is a normal DOM element on top of the
  canvas; OrbitControls only attaches listeners to `renderer.domElement`, so
  clicks on the toggle naturally do not start an orbit drag. Do not
  `stopPropagation()` unless you observe an actual conflict.
- **Single-file is still fine.** The bootstrap spec allows extracting to
  `main.js` once the script grows past ~80 lines. With OrbitControls plus a
  toggle, the script may cross that threshold; extracting to a sibling
  `./main.js` referenced via `<script type="module" src="./main.js">` is
  acceptable but not required. Keep the importmap in `index.html` either way.

## Agent Notes

- Do not introduce any library beyond Three.js itself. The toggle is plain
  HTML; no React, no lil-gui, no Tailwind, no preprocessor.
- Reuse the existing pinned `three` version from `index.html`. Do not bump it
  as part of this task.
- Verify by serving the repo root with a static server
  (`python3 -m http.server 8000`) and exercising in a browser:
  1. Left-click + drag rotates the camera around the cube.
  2. Mouse wheel (or trackpad pinch) zooms in/out smoothly (damping visible).
  3. Right-click + drag pans the camera target.
  4. Toggle starts at "on" — cube spins; clicking it stops the spin; clicking
     again resumes. Camera controls keep working in both states.
  5. Resize the window — canvas refits and aspect stays correct.
  6. Browser devtools console shows no errors or warnings.
- Do all edits inside this worktree per `AGENTS.md`. Do not edit the main
  checkout.
- Do not create `package.json`, `vite.config.*`, or any GitHub Actions
  workflow. The site stays build-free static files.
- README updates are optional for this task — the run/deploy instructions from
  the bootstrap task still apply unchanged.
