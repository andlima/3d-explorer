---
id: camera-mode-aim-shoot
area: scene
priority: 50
depends_on: [random-objects-and-collision, night-stars]
description: Add a togglable camera mode (C) with a center crosshair, mouse-wheel zoom, and click-to-shoot raycasting that briefly highlights the hit prop and displays its info
---

# Camera Mode with Aim and Shoot

## Goal

Add a togglable camera mode that turns the existing first-person view
into an "inspect / aim" mode. While camera mode is on, the player sees
a fixed center crosshair, can zoom in/out with the mouse wheel
(smoothly easing the camera's FOV), and can left-click to "shoot" a
prop. A shot is **non-destructive**: it briefly highlights the hit
prop with an emissive pulse and shows a small info card at the bottom
of the screen with the prop's shape, dimensions, color, material
properties, and texture name. Walking, sprinting, jumping, prop
regeneration (R), the day/night cycle, and the night sky are all
unchanged. This adds a way to interact with the random props
introduced by `random-objects-and-collision` without touching physics
or world state.

## Acceptance Criteria

### Mode toggle

1. Camera mode is **off** at startup.
2. Pressing **C** (only on `keydown`, not on auto-repeat) toggles
   camera mode. The toggle works regardless of pointer-lock state.
3. A small HUD mode indicator (a fixed-position DOM element in the
   top-left of the viewport, ~12 px text such as `CAM ON`,
   semi-transparent dark background, white text) is visible exactly
   when camera mode is on. It is hidden otherwise.
4. The instructional overlay (`#lock-overlay`) text is updated to
   include `C to toggle camera` (placement among existing hints is
   the author's choice but the new key must be listed).

### Crosshair

5. A crosshair (a fixed-position DOM element centered on the
   viewport) is visible exactly when camera mode is on. It is hidden
   otherwise.
6. The crosshair must read as a center-of-screen reticle (e.g., a
   ~12 px white plus with a 1 px black outline, or a small centered
   dot — the exact glyph is the author's choice but it must be
   centered to the pixel and visible against both bright sky and
   dark night sky).

### Zoom

7. Define `DEFAULT_FOV = 60`, `MIN_FOV = 20`, `MAX_FOV = 60`. The
   `PerspectiveCamera` is constructed with FOV `60` (already in
   `index.html`); leave that alone. Maintain a separate
   `targetFov` state that starts at `DEFAULT_FOV`.
8. While camera mode is on, mouse `wheel` events adjust `targetFov`
   by `Math.sign(event.deltaY) * 5` degrees per event, clamped to
   `[MIN_FOV, MAX_FOV]`. Scroll up (`deltaY < 0`) zooms in
   (decreases FOV); scroll down zooms out (increases FOV). The
   wheel listener must call `event.preventDefault()` so the page
   does not scroll, which requires registering the listener with
   `{ passive: false }`.
9. When camera mode is **off**, `wheel` events are ignored: no FOV
   change and no `preventDefault()` (the page can scroll normally if
   it ever has scrollable content).
10. Each animate frame, ease the camera's FOV toward `targetFov`:
    ```js
    camera.fov += (targetFov - camera.fov) * Math.min(1, delta * 8);
    camera.updateProjectionMatrix();
    ```
    `updateProjectionMatrix()` must be called after every FOV change.
11. Toggling camera mode **off** sets `targetFov = DEFAULT_FOV` so
    the camera smoothly eases back to 60. Toggling on leaves
    `targetFov` at its previous (default `DEFAULT_FOV`) value.

### Shooting

12. While camera mode is on **and** `controls.isLocked === true`,
    a left mouse-button down (`mousedown` with `event.button === 0`)
    triggers a shot. Mouse-down outside camera mode, or while not
    pointer-locked, has no effect (this prevents the lock-acquiring
    click from being interpreted as a shot).
13. The shot raycasts from the camera through the screen center
    using a single shared `THREE.Raycaster` and a fixed
    `THREE.Vector2(0, 0)`:
    ```js
    raycaster.setFromCamera(aimNdc, camera);
    ```
    `Raycaster.setFromCamera` interprets the vector as NDC where
    `(0, 0)` is the center.
14. The raycast intersects only the active props
    (`props.map(p => p.mesh)`). It does **not** hit the ground,
    grid, sky dome, sun disc, moon disc, or stars.
15. Take the closest hit (`hits[0]`). If `hits.length === 0`, the
    shot is a miss: no highlight, no info card, no console error.
    The crosshair itself does not change appearance on hit or miss.

### Highlight

16. On a hit, the hit prop is briefly highlighted by setting its
    `MeshStandardMaterial.emissive` to white (`0xffffff`) and
    animating `emissiveIntensity` from `0.8` down to `0.0` over
    `HIGHLIGHT_DURATION = 0.6` seconds. After the duration ends,
    set `emissiveIntensity = 0` (the emissive color value can stay
    white; intensity 0 produces no visible glow).
17. Track `highlightT` (seconds remaining) per prop in the existing
    `props` array (extend the prop record). Each animate frame,
    decrement `highlightT` by `delta` (clamp to `>= 0`) and write
    `material.emissiveIntensity = (highlightT / HIGHLIGHT_DURATION) * 0.8`.
18. If a prop is shot again while still highlighted, reset its
    `highlightT` to `HIGHLIGHT_DURATION` (do not stack intensities).
19. Re-generating props (R) disposes the old props and their
    materials; no special highlight cleanup beyond the existing
    `disposeProps()` is required.

### Info card

20. On a hit, an info card (a fixed-position DOM element near the
    bottom-center of the viewport) is shown for
    `INFO_DURATION = 2.5` seconds, then hidden. Visual: semi-transparent
    dark background, white monospace text, ~12–14 px,
    padding ~8 px 12 px, rounded ~4 px corners. It must not block
    pointer-lock interactions (`pointer-events: none`).
21. The info card displays five lines describing the hit prop:
    - `shape: <Box | Sphere | Cylinder | Cone>`
    - `dims:` human-readable, two decimals — e.g. `1.20 × 0.85 × 1.40`
      for a box (`w × h × d`), `r=0.85` for a sphere,
      `r=0.60 h=1.40` for a cylinder or cone.
    - `color: #RRGGBB` — hex of `material.color`.
    - `material: rough=<R> metal=<M>` — `R` and `M` to two decimals.
    - `texture: <checker | stripes | dots | noise>` — the base-texture
      name used for the prop.
22. To support criterion 21, extend each prop record at generation
    time with an `info` object containing `shape`, `dims`
    (pre-formatted string per criterion 21), `colorHex`,
    `roughness`, `metalness`, `textureName`. Add a parallel array
    `TEXTURE_NAMES = ['checker', 'stripes', 'dots', 'noise']` and
    use the same index for both texture selection and naming. Do
    not refactor the existing texture creator functions.
23. A subsequent hit (on any prop) replaces the info card content
    immediately and resets the 2.5 s timer.
24. Pressing **R** clears the info card immediately (the prop it
    referred to is gone) and zeroes the info timer.

### Integration and constraints

25. Walking, sprint, jump, gravity, AABB collision, spawn-exclusion,
    `HALF_EXTENT` clamp, day/night cycle, sky dome, sun/moon
    behavior, stars, `DirectionalLight` / `AmbientLight` intensities,
    prop regeneration (R), and the pointer-lock overlay flow are
    all **functionally unchanged**. The only behavior changes are
    the new C-key toggle, mouse-wheel behavior in camera mode,
    click-to-shoot in camera mode, the new DOM elements (crosshair,
    mode indicator, info card), and the addition of `info` and
    `highlightT` fields to prop records.
26. Animate-loop ordering is preserved. Insert the new per-frame
    work — FOV easing (`updateProjectionMatrix`), per-prop
    `highlightT` decrement and `emissiveIntensity` write, and
    info-card timer countdown / hide — **after the stars update
    block** and **before the walker physics block**. None of this
    work is gated on `controls.isLocked`; it runs every frame.
27. The page remains a build-free static site. No `package.json`,
    no bundler, no new runtime dependencies. Three.js stays at the
    pinned version. All resource references stay relative.
28. No new files. All changes happen inside `index.html` (HTML, CSS,
    JS). The existing `<style>` block and the existing
    `<script type="module">` block are extended in place.
29. No memory leaks: the `Raycaster`, the `Vector2(0, 0)`
    aim-center, the crosshair / mode-indicator / info-card DOM
    elements, and the `wheel` / `mousedown` / `keydown` listeners
    are each created **once** at startup. Per-frame work writes to
    existing fields only.

### Manual verification

30. Load the page. Crosshair, "CAM" indicator, and info card are
    all hidden. Camera FOV is 60 (default).
31. Click the lock overlay to lock pointer. Press **C**: the "CAM"
    indicator and crosshair appear. The crosshair sits exactly at
    the geometric center of the viewport. Press **C** again: both
    hide.
32. With camera mode on, scroll wheel up: FOV smoothly decreases
    (props look bigger). Continue scrolling: FOV stops decreasing
    at 20. Scroll down: FOV smoothly returns toward 60 and stops
    there.
33. Toggle camera mode off while zoomed in: FOV smoothly eases back
    to 60. Toggle off → on → off cycles all reset to 60 on each off.
34. With camera mode off, scroll wheel: nothing happens; the page
    does not scroll.
35. With camera mode on, click the left mouse button while aiming
    at a prop: the prop briefly glows on its surface and an info
    card appears at the bottom of the viewport showing
    shape / dims / color / material / texture. The card disappears
    after ~2.5 s.
36. Click while aiming at empty sky or ground: no flash, no card,
    no console error.
37. Click the same prop twice in quick succession: the highlight
    pulses fresh on the second click (does not appear stuck or
    stacked); the info card resets its 2.5 s timer.
38. Two props in line of sight: clicking aims at the closer one
    only — only the closer prop flashes.
39. Press **R** while in camera mode with a card visible: props
    regenerate, the card hides immediately, camera mode and zoom
    state persist across the regenerate.
40. ESC to release pointer lock. Camera mode and zoom state
    persist; clicking the lock overlay re-locks and shooting works
    immediately.
41. Walk with WASD, sprint with Shift, jump with Space all behave
    identically to before whether camera mode is on or off. The
    crosshair stays centered while you move.
42. Browser devtools console shows no errors and no warnings.

## Out of Scope

- Destructive shooting (removing props), pushing, knocking back,
  splitting, or any physical effect on props. Highlighting and
  info display are non-destructive.
- Bullet trails, muzzle flashes, sound effects, hit sparks, recoil,
  ammo counters, or any "shooter" feel beyond the brief emissive
  pulse and info card.
- A reticle that changes color/shape on hover, hit, or miss. The
  crosshair is static.
- Right-click hold-to-aim, scope overlays, sniper-rifle visuals,
  ADS animations. Zoom is wheel-driven only.
- Configurable FOV range, sensitivity scaling with FOV, on-screen
  zoom indicators (e.g., "1.5×"). Constants are hardcoded per the
  spec.
- Persistent tagging across regenerates, kill counts,
  leaderboards, achievements, scoring, or shot history.
- Touch / mobile / gamepad bindings. Mouse and keyboard only.
- "Lock-on" or selection state — each shot is independent; there
  is no current-target concept beyond the most recent info card.
- Outline shaders, postprocessing passes, or `EffectComposer` work.
  Highlight uses the existing `MeshStandardMaterial.emissive` only.
- Day/night-cycle-aware crosshair / HUD recoloring. White text
  with a dark outline / background is sufficient for both halves
  of the cycle.
- Adding TypeScript, a bundler, npm tooling, or any new runtime
  dependency. Three.js stays at its current pinned version.
- Automated tests / Playwright / visual regression — verification
  stays manual per the existing project pattern.
- README updates. Running and deploying the page are unchanged.

## Design Notes

- **Why DOM elements over in-scene HUD**: the crosshair, mode
  indicator, and info card are 2D, viewport-relative, and do not
  need to interact with the 3D scene's lighting / depth /
  postprocessing. Plain CSS is the simplest path and keeps the
  file build-free.
- **Why `MeshStandardMaterial.emissive` for highlight**: every
  prop already uses `MeshStandardMaterial`. Modulating
  `emissiveIntensity` is a per-frame uniform write — no shader
  rebuild, no outline pass, no `EffectComposer`. Setting
  `emissive` to white once means subsequent intensity bumps glow
  white. The default emissive color is black, where any intensity
  is invisible — so the white assignment is required.
- **Why FOV-based zoom (not a separate camera)**: a single
  `PerspectiveCamera` keeps `PointerLockControls`, raycasting,
  the sky-dome / sun / moon / star follow code, and skybox math
  all unchanged. Only `camera.fov` + `updateProjectionMatrix()`
  change.
- **Why ease toward `targetFov`**: instantaneous FOV jumps are
  visually jarring and break the "smooth zoom" feel. The
  `delta * 8` factor (~125 ms time-constant) feels responsive but
  not abrupt, and is frame-rate independent because of `delta`.
- **Why raycast from screen-center NDC `(0, 0)`**: the crosshair
  sits at the screen center, so a single fixed `Vector2(0, 0)`
  matches the player's aim. `Raycaster.setFromCamera(ndc, camera)`
  already accepts NDC where `(0, 0)` is the center of the
  viewport.
- **Why exclude ground / grid / sky / sun / moon / stars**: only
  props are interactive targets per the user's choice.
  Restricting `raycaster.intersectObjects` to
  `props.map(p => p.mesh)` is the cleanest way to enforce this
  without per-object `userData` filtering or `Layers`.
- **Texture name surface**: the existing `baseTextures` array is
  index-only. Add a parallel
  `TEXTURE_NAMES = ['checker', 'stripes', 'dots', 'noise']` and
  use the same index for both selection and naming. Do not
  refactor the texture creator functions.
- **Pointer-lock and the first click**: the `lock-overlay`
  fullscreen `div` (z-index 10) catches the first click and locks
  the pointer; only after lock are subsequent `mousedown` events
  delivered to the canvas. Guarding the shot handler with
  `controls.isLocked && cameraMode` is therefore sufficient — the
  lock-acquiring click cannot also fire a shot.

## Agent Notes

- All edits in this worktree per `AGENTS.md` / `CLAUDE.md`. Do not
  touch the main checkout.
- This is a single-file change to `index.html`. Add CSS for the
  new DOM elements inside the existing `<style>` block. Add the
  new DOM elements inside `<body>` near the existing
  `#lock-overlay`. Add JS inside the existing
  `<script type="module">` block; keep the existing structure
  (constants near the top, helpers, generation, animate loop) and
  slot the new logic into the existing positions.
- Implementation order suggestion:
  1. Add CSS + DOM for crosshair, mode indicator, info card. All
     hidden by default.
  2. Add `cameraMode` boolean state, **C** keydown handler,
     indicator/crosshair show/hide.
  3. Add `targetFov` state, `wheel` handler with
     `{ passive: false }` and guarded `preventDefault()`, per-frame
     FOV ease in the animate loop.
  4. Add `TEXTURE_NAMES`, extend `generate()` so each prop record
     gets `prop.info` and `prop.highlightT = 0`.
  5. Add a single `Raycaster`, a fixed `Vector2(0, 0)`, and a
     `mousedown` handler guarded on
     `controls.isLocked && cameraMode && event.button === 0`.
  6. Add highlight: per-frame `highlightT` decrement and
     `emissiveIntensity` write across all props.
  7. Add info-card show/hide + 2.5 s timer; clear on **R**.
- Test locally with `python3 -m http.server 8000` from the
  worktree root. Walk through criteria 30–42.
- Watch for these pitfalls:
  - The `wheel` listener must be `{ passive: false }` for
    `event.preventDefault()` to work in Chrome/Firefox.
  - The `mousedown` handler **must** guard
    `controls.isLocked && cameraMode` to avoid firing on the
    pointer-lock-acquiring click.
  - `camera.updateProjectionMatrix()` must be called **after**
    every `camera.fov` change.
  - Hex color: use `material.color.getHexString()` and prepend
    `#` to produce `#RRGGBB`.
  - Set `material.emissive.setRGB(1, 1, 1)` once (e.g., at
    material creation in `generate()`), so subsequent
    `emissiveIntensity` bumps glow white. The default emissive
    color is black, where any intensity is invisible.
  - Set `pointer-events: none` on all three new DOM elements so
    they never intercept clicks intended for the canvas.
- README updates are optional; running and deploying are
  unchanged.
