---
id: first-person-navigation
area: scene
priority: 50
depends_on: [add-orbit-controls]
description: Replace OrbitControls + auto-rotate toggle with a grid-on-plane ground and a first-person walker (PointerLockControls + WASD), clamped to the ground extent
---

# First-Person Navigation on a Ground Plane

## Goal

Turn the scene from "look at a spinning cube" into "walk around a small world."
Add a flat ground (solid plane plus a grid overlay so motion is perceptible),
park the cube on it as a static prop, and make the camera behave as the
first-person view of a walker that the user can move with WASD and aim with
the mouse via pointer lock. The walker is clamped to the ground extent so they
cannot walk off the edge.

This task fully replaces the `OrbitControls` interaction model and the
auto-rotation toggle from the previous task — they are removed, not coexisting.

## Acceptance Criteria

### Scene structure

1. A flat ground exists at world Y = 0:
   - A `THREE.Mesh` using `PlaneGeometry` sized **50 × 50** units, rotated so
     it lies flat on the XZ plane (e.g. `rotation.x = -Math.PI / 2`).
   - A material that responds to lighting (e.g. `MeshStandardMaterial`) in a
     muted color (e.g. dark gray `#202428` or similar). `side: THREE.DoubleSide`
     is acceptable but not required.
2. A `THREE.GridHelper` is added at the same extent (size **50**, divisions
   **50**, so each cell is 1 unit) and positioned just above the ground (e.g.
   `y = 0.01`) to avoid z-fighting with the plane. Color choices are at the
   implementer's discretion as long as the lines are clearly visible against
   the ground color.
3. The existing cube is repositioned so it visibly sits **on** the ground
   (i.e. its bottom face is flush with `y = 0`). For the existing 1×1×1 cube
   that means `cube.position.y = 0.5`. The cube stays at world `(0, 0.5, 0)`
   — it is now a static prop.
4. The cube's per-frame rotation logic is removed entirely (no `cube.rotation.x +=`
   / `cube.rotation.y +=` in the animation loop, no `autoRotate` flag).
5. The DOM element and CSS for the auto-rotation toggle from
   `add-orbit-controls` are removed entirely (HTML, CSS, and any JS that wires
   it up). No dead checkbox / label / `aria-pressed` button remains.

### Camera and controls

6. `OrbitControls` is no longer imported, instantiated, or referenced anywhere.
   Its per-frame `controls.update()` call is removed. (It is replaced by
   `PointerLockControls`, see below — `controls` may be reused as the variable
   name.)
7. `PointerLockControls` is imported via the existing addon importmap entry:
   `import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';`
   No hard-coded `unpkg.com` URLs in application code. The pinned `three`
   version is **not** changed by this task.
8. A `PointerLockControls` instance is created against the existing `camera`
   and `document.body` (or `renderer.domElement`; either is acceptable, but
   the click-to-lock target in criterion 10 must match).
9. The camera starts at first-person eye height: `camera.position` is set so
   the camera is at `y ≈ 1.6` (a reasonable human eye height in meters). A
   sensible starting XZ that keeps the cube in view is fine — e.g.
   `(0, 1.6, 5)` looking toward the origin. Pointing the camera at the cube
   on load is encouraged but not strictly required.

### Pointer lock UX

10. The page shows an instructional overlay (a normal DOM element, e.g. a
    centered `<div>` with text such as "Click to play — WASD to move, mouse
    to look, ESC to release") that is visible **before** the user has engaged
    the controls.
11. Clicking the overlay (or the canvas, depending on implementer choice —
    pick one and keep it consistent with the lock target in criterion 8) calls
    `controls.lock()`. On the `'lock'` event the overlay is hidden; on the
    `'unlock'` event (e.g. user pressed ESC) the overlay is shown again.
12. Movement input is **only** applied while the controls are locked
    (`controls.isLocked === true`). When unlocked, holding WASD does not move
    the camera and the scene continues to render normally.

### Movement

13. Keyboard state is tracked via `keydown` / `keyup` listeners on `window`.
    Both `KeyW`/`KeyA`/`KeyS`/`KeyD` and `ArrowUp`/`ArrowLeft`/`ArrowDown`/`ArrowRight`
    are accepted as forward / strafe-left / back / strafe-right respectively.
14. Movement is frame-rate independent. Use a `THREE.Clock` (or equivalent
    `performance.now()` delta) and a constant speed (e.g. **5 units/sec**)
    so distance traveled per second is consistent across machines. Movement
    must not depend on rAF tick count.
15. Forward/back movement uses `controls.moveForward(distance)` and strafing
    uses `controls.moveRight(distance)`. (These helpers move the camera on the
    XZ plane regardless of pitch, which is the desired walker behavior — the
    walker should not fly when looking up or sink when looking down.)
16. Diagonal movement is normalized so pressing two perpendicular directions
    (e.g. W + D) does not travel faster than a single direction. A simple
    approach: build an input vector `(right, forward)`, normalize it if its
    length > 1, then scale by `speed * delta`.
17. After applying movement, `camera.position.x` and `camera.position.z` are
    clamped to the ground extent so the walker cannot leave the plane. With a
    50-unit ground centered at the origin, clamp each to roughly
    `[-24.5, 24.5]` (a small margin in from the literal edge so the walker
    doesn't visually hang off). `camera.position.y` stays fixed at the eye
    height set in criterion 9 — no jumping, no gravity, no vertical drift.

### Preserved behavior

18. The directional + ambient lighting from previous tasks remains and now
    illuminates both the cube and the ground (the ground should read as lit,
    not flat black).
19. Window resize behavior still works: canvas size and camera aspect both
    update on resize, and `window.devicePixelRatio` is still honored.
20. The page remains a build-free static site — no `package.json`, no
    `node_modules`, no bundler config, no new GitHub Actions workflows. All
    resource references stay relative so the page still works under the
    GitHub Pages project subpath (`https://<user>.github.io/3d-explorer/`).

### Manual verification

21. Loading the page in a current browser shows: the ground plane with grid,
    the cube sitting on it, and the instructional overlay. Clicking engages
    pointer lock and hides the overlay. Mouse movement looks around (yaw and
    pitch). WASD and arrow keys translate the camera on the XZ plane at a
    constant eye height. Walking toward an edge stops the walker at the edge
    rather than letting them fall off. ESC releases pointer lock and re-shows
    the overlay. No console errors or warnings about missing modules.

## Out of Scope

- Jumping, crouching, sprinting, gravity, or any vertical input. Y stays
  fixed at eye height for this task.
- Collision against the cube or any other scene object — the walker can pass
  through the cube. Only the ground extent is clamped.
- Touch / mobile / gamepad controls. Desktop keyboard + mouse only.
- A minimap, HUD beyond the click-to-play overlay, crosshair, or weapon model.
- Multiple rooms, scene switching, or loading external models / textures
  (no GLTF, no image textures — the grid is via `GridHelper`, not a texture).
- Persisting camera position, look direction, or any state across reloads.
- Procedural terrain, heightmaps, or non-flat ground.
- Adding TypeScript, a bundler, or any npm tooling.
- Automated tests / Playwright / visual regression — verification stays manual.

## Design Notes

- **Use `PointerLockControls`, not `FirstPersonControls`.** Three.js ships
  both addons. `FirstPersonControls` uses on-screen mouse position rather
  than pointer lock and is a poor fit for "click to engage, mouse to look."
  `PointerLockControls` is the standard FPS interaction and exposes
  `moveForward` / `moveRight` helpers that already keep movement on XZ.
- **Pointer lock requires a user gesture.** The browser will reject
  `controls.lock()` if it isn't called from a click/keypress handler. Wire
  it to an explicit click on the overlay (or the canvas), not to page load.
- **`'lock'` / `'unlock'` events.** Subscribe with
  `controls.addEventListener('lock', …)` and `'unlock'` to toggle the
  overlay's visibility. ESC-to-unlock is browser-native — do not try to
  handle it manually.
- **Frame-rate-independent movement.** A `THREE.Clock` with
  `clock.getDelta()` is the path of least resistance. Avoid hard-coding a
  per-frame increment like `0.05` (that ties speed to refresh rate).
- **Diagonal normalization matters.** Without it, W+D feels measurably faster
  than W alone, which players notice immediately. Normalize the input vector
  before scaling by `speed * delta`.
- **Clamping order.** Apply `moveForward` and `moveRight` first, then clamp
  `camera.position.x` / `.z`. Clamping before movement does nothing useful;
  clamping `camera.position.y` is unnecessary because neither helper changes Y.
- **Z-fighting.** A `GridHelper` sitting at exactly `y = 0` on top of a plane
  at `y = 0` flickers. Lift the grid by a tiny amount (e.g. `y = 0.01`) or
  push the plane down by the same. Either is fine.
- **Single-file vs `main.js`.** The bootstrap spec allowed extracting to
  `./main.js` once the script grew past ~80 lines. With first-person
  controls plus movement plus overlay wiring this is very likely. Extracting
  is encouraged but not required; if you do, keep the importmap in
  `index.html` and reference `./main.js` with a relative path.

## Agent Notes

- Do not introduce any library beyond Three.js itself. The overlay is plain
  HTML/CSS; no React, no lil-gui, no Tailwind, no preprocessor.
- Reuse the existing pinned `three` version and the existing
  `three/addons/` importmap entry from the previous task. Do not bump the
  version as part of this task.
- Verify by serving the repo root with a static server
  (`python3 -m http.server 8000`) and exercising in a browser:
  1. Page loads showing ground + grid + cube + overlay; no console errors.
  2. Click engages pointer lock; overlay disappears; mouse look works in
     both yaw and pitch.
  3. W / A / S / D and arrow keys all translate the walker correctly relative
     to look direction; eye height stays constant when looking up/down.
  4. Walking toward each of the four ground edges stops at the edge — the
     walker cannot leave the plane.
  5. Diagonal movement (e.g. W+D) is not faster than single-direction.
  6. ESC releases pointer lock and the overlay reappears; pressing WASD
     while unlocked does nothing.
  7. Resize the window — canvas refits and aspect stays correct.
  8. Browser devtools console shows no errors or warnings.
- Do all edits inside this worktree per `AGENTS.md`. Do not edit the main
  checkout.
- Do not create `package.json`, `vite.config.*`, or any GitHub Actions
  workflow. The site stays build-free static files.
- README updates are optional — running and deploying are unchanged from
  earlier tasks.
