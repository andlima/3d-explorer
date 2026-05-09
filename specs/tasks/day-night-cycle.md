---
id: day-night-cycle
area: scene
priority: 50
depends_on: [sprint-and-jump]
description: Replace the flat dark background with a 60-second animated day/night cycle — sky-dome gradient, sun/moon discs, and DirectionalLight all driven by a single phase parameter
---

# Day/Night Cycle with Sun and Moon

## Goal

Make the scene feel alive by replacing the flat `0x111111` background with a
**continuously animated day/night cycle**. A sky dome with a top/horizon
gradient sweeps through sunrise → noon → sunset → midnight every **60 s**.
A visible sun disc tracks an east-west arc through the zenith; a visible moon
disc tracks the opposite arc and is shown only at night. The scene's
`DirectionalLight` follows the sun (intensity and color), and ambient lighting
dips at night. Walker physics and pointer-lock controls from
`sprint-and-jump` are unchanged.

## Acceptance Criteria

### Cycle timing and phase

1. Add a constant `DAY_LENGTH = 60` (seconds). The cycle phase is
   `t = (clock.getElapsedTime() % DAY_LENGTH) / DAY_LENGTH`, so `t ∈ [0, 1)`
   and one full loop takes 60 s of wall-clock time. The cycle runs
   continuously from the moment the page loads — it does **not** require
   pointer lock to advance, and is **not** paused on unlock.
2. Phase `t` maps to a unit "sun direction" vector via:
   ```js
   const θ = t * 2 * Math.PI;
   sunDir = new THREE.Vector3(Math.cos(θ), Math.sin(θ), 0);
   ```
   This means: `t=0` → sun at `(+1, 0, 0)` (east horizon — **sunrise**),
   `t=0.25` → `(0, +1, 0)` (zenith — **noon**), `t=0.5` → `(-1, 0, 0)`
   (west horizon — **sunset**), `t=0.75` → `(0, -1, 0)` (nadir — **midnight**).
3. The cycle is **frame-rate independent** — it is driven by elapsed time,
   not by a per-frame increment. Pausing the tab (or switching to another
   tab) and returning still produces the correct phase for the new wall-clock
   time. (`THREE.Clock.getElapsedTime()` already gives this; the criterion
   is just "do not accumulate `delta` into a phase counter".)

### Sky dome and gradient

4. Replace `scene.background = new THREE.Color(0x111111)` with a **sky dome**:
   a `THREE.Mesh` using `SphereGeometry` of radius **80**, rendered with
   `side: THREE.BackSide` so the camera sees its inside. The dome is added
   to the scene once at startup. (Removing the old `scene.background`
   assignment is fine; setting it to `null` is also fine.)
5. The sky dome's material is a `THREE.ShaderMaterial` (or equivalent
   custom material) that produces a vertical gradient from a `topColor`
   uniform at the zenith to a `horizonColor` uniform near the horizon.
   Implementation hint: in the fragment shader, blend by the world-space
   y-component of the view direction, e.g.
   `mix(horizonColor, topColor, smoothstep(0.0, 0.5, normalize(vWorldPos).y))`.
6. The dome **follows the camera** every frame so the sky stays "infinite":
   `skyDome.position.copy(camera.position)`. This applies regardless of
   pointer-lock state.
7. `topColor` and `horizonColor` are updated **every frame** as a function
   of `t` by linearly interpolating in RGB between four phase keyframes:
   - `k=0` (sunrise, `t=0.00`):    top `#7891B8`, horizon `#FF9966`
   - `k=1` (noon,    `t=0.25`):    top `#5BA3DD`, horizon `#B0D8F0`
   - `k=2` (sunset,  `t=0.50`):    top `#7891B8`, horizon `#FF7755`
   - `k=3` (midnight,`t=0.75`):    top `#02061A`, horizon `#0F1B40`
   Between adjacent keyframes, lerp linearly using
   `u = (t - t_prev) / (t_next - t_prev)`. The cycle wraps from `k=3` back
   to `k=0` over `t ∈ [0.75, 1.0)` (lerping from midnight back to sunrise).
   The exact hex values above are the requirement; do not retune.
8. The sky-dome material does **not** receive lighting — it is unaffected
   by `DirectionalLight` / `AmbientLight`. The colors specified in
   criterion 7 are the final on-screen colors.

### Sun and moon discs

9. A **sun disc** is added to the scene: a `THREE.Mesh` with
   `MeshBasicMaterial` (color `#FFE9A8`) using either a small
   `SphereGeometry` or `CircleGeometry` sized to appear roughly **3 units**
   across at the dome distance. Each frame it is positioned at
   `camera.position + sunDir * 75` (i.e. slightly inside the sky dome
   radius of 80 so it always renders in front of the dome).
10. A **moon disc** is added to the scene: same geometry approach as the
    sun, color `#DDDDEE`. Each frame it is positioned at the antipode of
    the sun: `camera.position + (-sunDir) * 75`. (So when the sun is at
    the eastern horizon, the moon is at the western horizon; when the sun
    is at the zenith, the moon is at the nadir.)
11. The sun disc is **visible only when the sun is above the horizon**
    (`sunDir.y > 0`) and hidden otherwise (`mesh.visible = false`).
    Symmetrically, the moon disc is visible only when `sunDir.y < 0`
    (i.e. the moon's own position has y > 0). A hard cutoff at the
    horizon is fine; no fade required.
12. Sun and moon materials use `depthWrite: false`, and both meshes have
    `renderOrder = -1` (or are otherwise rendered before scene geometry)
    so the cube and ground always draw in front of them. They must never
    appear "in front of" the cube when the camera looks toward the
    horizon through the cube.
13. Sun and moon are billboarded toward the camera if using a
    `CircleGeometry`. If using a `SphereGeometry`, no billboarding is
    needed. Either approach is acceptable — pick one.

### Lighting follows the sun

14. The existing `DirectionalLight` (currently named `sun`) is **repositioned
    every frame** to `sunDir.clone().multiplyScalar(50)` so the light
    always shines from the sun's direction onto the origin
    (`light.target` stays at the default `(0,0,0)`).
15. The DirectionalLight's `intensity` tracks sun elevation:
    `intensity = Math.max(0, sunDir.y) * 1.0`. So at noon
    (`sunDir.y = 1`) it is `1.0`, at the horizons it is `0`, and below
    the horizon it stays at `0`. (No moon-sourced lighting — the moon is
    purely visual.)
16. The DirectionalLight's `color` warms at low sun elevations to mimic
    sunrise/sunset tinting. Concretely: `color = lerpColor(warmColor,
    whiteColor, clamp(sunDir.y / 0.3, 0, 1))` where
    `warmColor = #FFD09E` and `whiteColor = #FFFFFF`. At elevations ≥ 0.3
    the light is pure white; near the horizon it is fully warm.
17. The existing `AmbientLight` intensity tracks elevation too:
    `intensity = 0.15 + Math.max(0, sunDir.y) * 0.25` so it ranges between
    `0.15` (night floor — scene is dim but not pitch black) and `0.40`
    (peak day). Color stays white. The intensity must update every frame.
18. No new lights are added. Total light count remains: 1 ambient + 1
    directional. (Plus the sun/moon meshes, which are not lights.)

### Camera and walker integration

19. The camera's `far` plane must accommodate the sky dome and sun/moon
    positions. Bump `camera.far` from `100` to **200** (or larger), and
    call `camera.updateProjectionMatrix()` once after the change. All
    other camera parameters (`fov`, `near`, initial position) are
    unchanged.
20. **Walker physics from `sprint-and-jump` are unchanged.** WASD,
    Shift-sprint, Space-jump, gravity, ground clamp, the 50×50 XZ extent,
    pointer-lock gating, and the instructional overlay all behave
    identically. The day/night cycle is purely visual + lighting.
21. The day/night animation runs **regardless of pointer-lock state**.
    Specifically: while the overlay is showing (lock not yet engaged, or
    after ESC), the sky still gradients, the sun/moon still sweep, and
    the lights still update. Only player input is gated on
    `controls.isLocked`.

### Project constraints

22. The page remains a build-free static site — no `package.json`, no
    bundler, no new runtime dependencies beyond Three.js itself
    (`three` and `three/addons` already in the importmap). All resource
    references stay relative so the page still works under the GitHub
    Pages project subpath.
23. Do not bump the pinned Three.js version. Do not add `package.json`,
    `vite.config.*`, or any GitHub Actions workflow.
24. The instructional overlay text from `sprint-and-jump` is **not**
    required to change. Layout/CSS changes are not required and should
    not be made.

### Manual verification

25. Loading the page: the flat dark background is gone. The sky shows a
    visible top-to-horizon gradient (warm at the horizon if the load
    happened during the sunrise/sunset segment, blue at noon, near-black
    at midnight).
26. Without clicking (no pointer lock yet): watch the sky for ~60 s. It
    visibly cycles through sunrise → noon → sunset → midnight → sunrise.
    The sun disc is visible during the day half and traces an east-west
    arc through the zenith; the moon is visible during the night half on
    the opposite arc.
27. The transition between phases is smooth — there is no visible jump or
    flicker at `t=0.25, 0.50, 0.75` keyframe boundaries.
28. Click to lock and walk around with WASD: the sky and sun follow the
    camera (they don't appear to "move past" the player as you walk; the
    sky stays at infinity). Sprint and jump still work.
29. Stand still and look up at noon (or scrub to that part of the cycle):
    the sun is overhead. Look down: ground is brightly lit, with shadows
    softer at noon than at sunrise/sunset due to the warm-to-white color
    shift. (No actual shadow rendering is required by this spec; the
    perceived softening is from light color, not shadow maps.)
30. Stand still at midnight: scene is dim but the cube and grid are still
    discernible (ambient floor of `0.15` keeps them visible). The moon is
    overhead and the sky is near-black at the zenith.
31. Walk to the edge of the 50×50 ground at midnight and look up: the
    sky gradient and moon position are unchanged because the dome and
    moon both follow the camera. There is no parallax popping.
32. Pressing ESC mid-cycle releases pointer lock; the day/night cycle
    keeps advancing while the overlay is shown. Re-locking does not jump
    or reset the cycle.
33. Browser devtools console shows no errors or warnings. In particular,
    no shader compilation warnings from the sky dome material.

## Out of Scope

- Stars, starfield, milky way, planets, comets, shooting stars — only
  the moon disc is required at night.
- Clouds, fog, atmospheric scattering shaders, volumetric light shafts,
  god rays, lens flares, or any post-processing pass.
- Real shadow rendering (`shadowMap`, `castShadow`, `receiveShadow`).
  Lighting is direct illumination only; the existing scene has no shadow
  setup and this spec adds none.
- Time-of-day controls (pause, scrub, speed up/slow down, jump-to-noon
  hotkey). The cycle is fully automatic at a fixed 60 s rate.
- Persisting the time-of-day across reloads. Each load starts at `t=0`
  (sunrise) when `THREE.Clock` begins.
- HUD or overlay indicators showing time of day, sun position, etc.
- Weather effects (rain, snow, wind), seasonal variation, or any
  parameter beyond the four hardcoded phase keyframes.
- Audio — no ambient sound, no day/night soundscape, no transition cues.
- Touch / mobile / gamepad bindings or any input changes. Desktop
  keyboard + mouse only, exactly matching `sprint-and-jump`.
- Adding TypeScript, a bundler, npm tooling, or any new runtime
  dependency. Three.js stays at its current pinned version.
- Automated tests / Playwright / visual regression — verification stays
  manual per the existing project pattern.
- Replacing the cube, ground, or grid. Scene props are unchanged.

## Design Notes

- **Phase utility**: keep `t` derivation in one place near the start of
  the animation loop so all downstream calculations (sky color, sun
  position, light intensity) read the same value:
  ```js
  const elapsed = clock.getElapsedTime();
  const t = (elapsed % DAY_LENGTH) / DAY_LENGTH;
  const θ = t * Math.PI * 2;
  sunDir.set(Math.cos(θ), Math.sin(θ), 0);
  ```
- **Color interpolation helper**: a single `lerpColor(a, b, u)` that
  takes two `THREE.Color` instances and returns a fresh `THREE.Color`
  (or mutates a scratch one to avoid GC) is enough for both the sky
  gradient (criterion 7) and the directional-light tint (criterion 16).
  `THREE.Color` already has a `.lerpColors(a, b, u)` method — using it
  is fine.
- **Sky shader**: a minimal shader with one `varying vec3 vWorldDir` and
  uniforms `uTopColor`, `uHorizonColor` is sufficient. Example fragment:
  ```glsl
  void main() {
    float h = smoothstep(0.0, 0.5, normalize(vWorldDir).y);
    gl_FragColor = vec4(mix(uHorizonColor, uTopColor, h), 1.0);
  }
  ```
  In the vertex shader, `vWorldDir = normalize((modelMatrix * vec4(position, 1.0)).xyz - cameraPosition)` gives a stable direction even as the dome follows the camera. A simpler equivalent: since the dome is centered on the camera each frame, the local position direction works too.
- **Phase keyframe table**: store the four keyframe colors as an array
  of `{ t, top: Color, horizon: Color }` objects. To find the active
  segment, find the largest keyframe whose `t` is `≤` current `t`,
  taking the wrap-around `0.75 → 1.0 → 0.0` segment as one segment of
  length `0.25`. A 4-entry hardcoded `if` ladder is also fine — the
  table doesn't need to be extensible.
- **Sun/moon billboarding**: if you choose `CircleGeometry`, set
  `mesh.lookAt(camera.position)` each frame **after** updating the
  mesh's position. With `SphereGeometry` no orientation update is
  needed.
- **Order of operations in the animation loop** (run every frame, in
  this order, before `renderer.render`):
  1. Compute `t`, `θ`, `sunDir`.
  2. Update sky-dome `topColor`/`horizonColor` uniforms.
  3. Update sky-dome, sun, and moon positions to follow camera.
  4. Show/hide sun/moon based on `sunDir.y` sign.
  5. Update DirectionalLight position, intensity, and color.
  6. Update AmbientLight intensity.
  7. Run the existing walker physics block (input + gravity + clamp).
  Steps 1–6 happen regardless of `controls.isLocked`. Step 7 still
  honors the existing `controls.isLocked` gate from `sprint-and-jump`.
- **Why start at sunrise (`t=0` = sunrise)**: the visual transition from
  warm horizon → bright noon happens in the first 15 s of viewing, which
  is a strong opening for the demo. Starting at midnight would load
  into a near-black scene and look broken.
- **Why a sky dome instead of `scene.background = Color`**: a single
  background color cannot produce a vertical gradient, and updating two
  colors per frame is the whole point. Using a `Texture` for the
  background works but requires regenerating the texture each frame
  (or a CanvasTexture redraw), which is more code than a 6-line
  ShaderMaterial.
- **No need to touch** `PlaneGeometry`, `GridHelper`, the cube, the
  pointer-lock controls, the keys map, the jump/sprint constants, the
  HALF_EXTENT clamp, or the instructional overlay. All scene geometry
  and walker physics are preserved exactly.

## Agent Notes

- All edits in this worktree per `AGENTS.md` / `CLAUDE.md`. Do not touch
  the main checkout.
- The current implementation is single-file in `index.html` (inline
  `<script type="module">`). Continuing to keep it single-file is fine
  given the modest size; extracting to `./main.js` is also fine but not
  required. If extracting, keep the importmap in `index.html` and
  reference `./main.js` with a relative path.
- The sky dome and sun/moon meshes can be created once at startup; only
  their **uniforms / positions / visibility / intensity** need updating
  per frame. Do not recreate geometries or materials in the animation
  loop.
- Verify by running `python3 -m http.server 8000` from the worktree root
  and walking through criteria 25–33 in a current browser. To make
  manual verification of the full cycle bearable, you may *temporarily*
  shorten `DAY_LENGTH` while iterating, but **the committed value must
  be 60** per criterion 1.
- Watch the devtools console for shader-compilation warnings — they
  frequently indicate a mismatched `varying` between vertex and
  fragment, or an undeclared uniform.
- README updates are optional; running and deploying are unchanged.
