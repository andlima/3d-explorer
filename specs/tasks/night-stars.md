---
id: night-stars
area: scene
priority: 50
depends_on: [day-night-cycle, random-objects-and-collision]
description: Add ~500 twinkling stars that rotate with the sky and fade in/out smoothly across twilight, complementing the existing moon during the night half of the day/night cycle
---

# Twinkling Stars at Night

## Goal

Make night feel alive by populating the sky dome with **~500 stars** that
appear during the night half of the existing 60-second day/night cycle.
Stars **rotate with the sky** (same axis as the sun arc), **fade in and
out smoothly across twilight** (rather than hard-cutoff like the moon),
and **twinkle subtly** with a per-star phase. They follow the camera
like the sky dome, so the night sky stays "infinite". Walker physics,
pointer-lock controls, props, and the existing sun/moon/sky behavior
from `day-night-cycle` and `random-objects-and-collision` are unchanged.

## Acceptance Criteria

### Star field setup

1. Create a single `THREE.Points` object named `stars` and add it to the
   scene **once at startup** (not in the animation loop). Use one
   `BufferGeometry` and one `ShaderMaterial` (or `PointsMaterial` if it
   meets twinkling and fade requirements; in practice a `ShaderMaterial`
   is required to satisfy criteria 7–9).
2. The star field contains exactly **500** points. Generate point
   positions with a deterministic PRNG seeded at startup so the layout
   is the same across reloads. Reuse the existing `mulberry32` helper
   from `index.html` with a fixed seed (e.g. `mulberry32(0xC0FFEE)`)
   distinct from the prop-placement seed so stars do not change when
   the user presses **R** to regenerate props.
3. Stars are distributed **uniformly on a sphere** of radius `STAR_RADIUS = 76`
   (chosen so stars sit just inside the `SKY_RADIUS = 80` dome and just
   outside the sun/moon at `SUN_DISTANCE = 75`). Use uniform-on-sphere
   sampling, e.g.:
   ```js
   const u = rng();
   const v = rng();
   const phi = 2 * Math.PI * u;        // azimuth
   const cosTheta = 2 * v - 1;          // [-1, 1], uniform on sphere
   const sinTheta = Math.sqrt(1 - cosTheta * cosTheta);
   const x = STAR_RADIUS * sinTheta * Math.cos(phi);
   const y = STAR_RADIUS * cosTheta;
   const z = STAR_RADIUS * sinTheta * Math.sin(phi);
   ```
   Do **not** use simple `(rng()-0.5)` per-axis sampling — it clusters
   stars at the cube corners.
4. Per-vertex attributes baked at startup:
   - `aPhase` (float, `[0, 2π)`): per-star twinkle phase offset.
   - `aFrequency` (float, `[0.5, 2.0]` Hz): per-star twinkle frequency.
   - `aSize` (float, `[1.0, 3.0]` in pixels at devicePixelRatio 1):
     per-star base size. (See criterion 10 for size semantics.)
   These attributes are written once and never updated per frame.
5. Star colors are **white** (`vec3(1.0)`). No per-vertex color
   attribute is required. (Stars look white-blue against the
   near-black night sky; adding color variation is out of scope.)

### Following camera and rotating with sky

6. Each frame, set `stars.position.copy(camera.position)` so the star
   sphere stays centered on the player. This applies regardless of
   pointer-lock state, identical to the sky dome treatment from
   `day-night-cycle`.
7. Each frame, rotate the entire star field around the Z axis by the
   current cycle angle so stars move in lockstep with the sun/moon
   arc. Concretely:
   ```js
   stars.rotation.z = theta;   // theta = t * 2π, already computed
   ```
   This is the same `theta` the sun direction uses; reuse it directly
   rather than recomputing. The rotation axis must be Z (matching the
   sun arc's plane), not Y or X.

### Smooth twilight fade

8. Stars fade based on **sun elevation** (`sunDir.y`), using a smooth
   transition across the twilight band:
   ```js
   // 0 = fully invisible (daylight), 1 = fully visible (deep night)
   const starOpacity = 1 - THREE.MathUtils.smoothstep(sunDir.y, -0.25, -0.05);
   ```
   Note `THREE.MathUtils.smoothstep(x, min, max)` returns 0 for
   `x ≤ min` and 1 for `x ≥ max`. So at `sunDir.y = -0.25` (well below
   horizon, deep night) the result is 0 and the `1 - …` gives full
   visibility; at `sunDir.y = -0.05` (just past sunset / just before
   sunrise) the result is 1 and stars are invisible. Above the
   horizon (`sunDir.y > 0`) they remain invisible. The two edge
   constants `-0.25` and `-0.05` are the requirement; do not retune.
9. The fade is applied as a uniform **`uOpacity`** on the star
   material, multiplied into the fragment alpha. The material must use
   `transparent: true`, `depthWrite: false`, and `blending: THREE.AdditiveBlending`
   so stars composite cleanly over the dark sky without writing to
   the depth buffer.

### Twinkling

10. Each star's **alpha** (not its size) is modulated per-frame by a
    sine wave using its baked `aPhase` / `aFrequency`:
    ```glsl
    float twinkle = 0.65 + 0.35 * sin(uTime * aFrequency + aPhase);
    ```
    so per-star alpha ranges in `[0.3, 1.0]`. Multiply this into the
    final fragment alpha after the global `uOpacity`. The combined
    effect: in deep night each star independently brightens/dims with
    a different rhythm; during twilight all stars dim together via
    `uOpacity` regardless of their twinkle phase.
11. The star **point size** is fixed per-star (from `aSize`), scaled
    by `devicePixelRatio` so HiDPI displays render at intended pixel
    sizes. In the vertex shader:
    ```glsl
    gl_PointSize = aSize * uPixelRatio;
    ```
    where `uPixelRatio` is a uniform set once at startup to
    `renderer.getPixelRatio()`. Do not animate `gl_PointSize`.
12. Stars render as **round dots**, not square. In the fragment
    shader, discard fragments outside a unit circle in `gl_PointCoord`
    space:
    ```glsl
    vec2 c = gl_PointCoord - vec2(0.5);
    if (dot(c, c) > 0.25) discard;   // 0.25 = (0.5)^2
    ```
    A soft falloff (radial alpha gradient) is acceptable but not
    required; a hard circle is fine. Square stars are not acceptable.

### Render ordering and integration with existing sky

13. The star Points object uses `renderOrder = -1` (same tier as the
    existing sun/moon discs) and `depthWrite: false`, so the cube,
    ground, grid, and props always draw in front of stars. Stars
    must never appear "in front of" props when the camera looks at
    them.
14. Stars must render **after** the sky dome (which uses
    `renderOrder = -2`) and **with** the sun/moon (also
    `renderOrder = -1`) so they composite over the gradient sky.
    This ordering is satisfied automatically by setting
    `renderOrder = -1` on stars per criterion 13; do not change the
    sky dome's `-2` or the sun/moon's `-1`.
15. The `uTime` uniform is updated every frame to
    `clock.getElapsedTime()` (not `delta`), so twinkling is
    frame-rate independent and deterministic across reloads. Use the
    existing `clock` instance — do not create a second `THREE.Clock`.

### Cycle, walker, and project integration

16. The animation loop's existing order from `day-night-cycle`
    (compute `t`/`theta`/`sunDir` → update sky → update sun/moon →
    update lights → walker physics → render) is preserved. Star
    updates (rotation, position, `uTime`, `uOpacity`) slot in
    **after the sun/moon position update** and **before the walker
    physics block**. Star updates run **regardless of
    pointer-lock state** (same as sun/moon).
17. The day/night cycle, sky-dome gradient keyframes, sun/moon
    behavior, `DirectionalLight` / `AmbientLight` intensities, walker
    physics, prop generation (`R` to regenerate), AABB collision,
    spawn-exclusion, and HALF_EXTENT clamp are **unchanged**. No
    constants from `day-night-cycle` (`DAY_LENGTH`, `SKY_RADIUS`,
    `SUN_DISTANCE`, sky keyframes, warm/white light colors) or
    `random-objects-and-collision` (`PLAYER_RADIUS`,
    `SPAWN_EXCLUSION_RADIUS`, etc.) are modified.
18. Pressing **R** regenerates props but **does not** regenerate the
    star field. The star layout is fixed for the lifetime of the
    page. (Reseeding stars on R would be a misfeature — stars are
    not "props".)
19. The instructional overlay text from `random-objects-and-collision`
    is **not** required to change. No new key bindings, HUD, or UI
    elements are added.
20. Camera `near`/`far`/`fov` are unchanged. (`far` is already 200
    from `day-night-cycle`, which comfortably contains
    `STAR_RADIUS = 76`.)

### Project constraints

21. The page remains a build-free static site — no `package.json`, no
    bundler, no new runtime dependencies beyond Three.js itself
    (`three` and `three/addons` already in the importmap). All
    resource references stay relative so the page still works under
    the GitHub Pages project subpath.
22. Do not bump the pinned Three.js version. Do not add
    `package.json`, `vite.config.*`, or any GitHub Actions workflow.
23. No new runtime allocations in the hot path. The Points geometry,
    material, and uniforms are created once. Per-frame work is
    limited to writing existing uniforms and assigning
    `stars.position` / `stars.rotation.z`.

### Manual verification

24. Load the page and let it run for one full 60 s cycle. During the
    daylight half (`t ∈ [0, 0.5)` roughly) no stars are visible. As
    the sky transitions through sunset (`t ≈ 0.5`), stars **fade in
    smoothly** over a few seconds — they do not pop in.
25. At midnight (`t ≈ 0.75`): the sky is near-black at the zenith,
    the moon is overhead, and **~500 white stars** are visible
    distributed across the dome. Each star twinkles independently;
    no two stars twinkle in obvious lockstep.
26. As the cycle approaches sunrise (`t ≈ 1.0` / `t ≈ 0`), stars
    **fade out smoothly** before the warm sunrise horizon appears.
    There is no visible jump from "starry" to "starless".
27. Stand still at midnight and watch the sky for ~10 s without
    walking: the entire star field rotates slowly around the Z axis
    in lockstep with the moon. Stars on one horizon rise while
    stars on the opposite horizon set.
28. Walk around with WASD at midnight: the star field follows the
    camera (no parallax popping at the 50×50 ground edges, identical
    to the sky dome). Sprinting and jumping behave identically to
    `sprint-and-jump`.
29. Look at a prop or the cube against the night sky: the prop
    occludes stars correctly. Stars never appear "in front of" props
    or the ground.
30. Press **R** to regenerate props at night: props change, but the
    star layout is unchanged (same stars in the same positions).
31. Stars render as **round dots**, not squares. Inspect a few
    bright stars near the camera's view to confirm.
32. Browser devtools console shows no errors or warnings. No shader
    compile warnings from the star material. No
    `BufferGeometry`-related warnings about attribute size mismatch.
33. Performance: with 500 stars added, frame rate on a typical laptop
    remains visually smooth (no perceptible stutter introduced by
    this spec). No formal benchmark required; the goal is "you
    cannot tell a difference vs. before".

## Out of Scope

- Constellations, named stars, planets, the Milky Way band, comets,
  shooting stars, meteors, satellites, aurora, or any non-uniform
  star pattern. Stars are uniform-on-sphere only.
- Per-star color variation (blue giants, red dwarfs). All stars are
  white.
- Star clustering, density variation across the sky, or
  galactic-plane simulation.
- Lighting from stars. Stars are purely visual — they do not emit
  `Light` and do not affect any material's shading.
- Changing the moon (size, texture, phases, glow halo, eclipse
  behavior). The moon stays exactly as-implemented in
  `day-night-cycle`.
- Scrub controls, pause, jump-to-night hotkey, or any time-of-day
  HUD. Cycle remains fully automatic at 60 s.
- Replacing or augmenting the existing sky-dome shader (gradient
  keyframes, horizon tint). The dome and its keyframes are unchanged.
- Configurable star count, twinkle intensity, or fade band via UI or
  query string. Constants are hardcoded per this spec.
- Day-time stars (visible during eclipses, etc.). Stars only render
  during the night half of the cycle.
- Audio cues (no "night ambience" sound).
- Touch/mobile/gamepad bindings or any input changes.
- Adding TypeScript, a bundler, npm tooling, or any new runtime
  dependency. Three.js stays at its current pinned version.
- Automated tests / Playwright / visual regression — verification
  stays manual per the existing project pattern.
- README updates. Running and deploying the page are unchanged.

## Design Notes

- **Why `THREE.Points` over individual meshes**: 500 individual
  meshes would mean 500 draw calls. `THREE.Points` renders all stars
  in a single draw call with one geometry buffer.
- **Why `ShaderMaterial` over `PointsMaterial`**: `PointsMaterial`
  cannot do per-vertex twinkling driven by a `uTime` uniform with
  per-vertex `aPhase` / `aFrequency` attributes. The custom shader is
  short (~15 lines vert + ~10 lines frag) and stays inline in
  `index.html` next to the existing sky shader.
- **Suggested vertex shader**:
  ```glsl
  attribute float aPhase;
  attribute float aFrequency;
  attribute float aSize;
  uniform float uTime;
  uniform float uPixelRatio;
  varying float vTwinkle;
  void main() {
    vTwinkle = 0.65 + 0.35 * sin(uTime * aFrequency + aPhase);
    vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * uPixelRatio;
    gl_Position = projectionMatrix * mvPos;
  }
  ```
- **Suggested fragment shader**:
  ```glsl
  uniform float uOpacity;
  varying float vTwinkle;
  void main() {
    vec2 c = gl_PointCoord - vec2(0.5);
    if (dot(c, c) > 0.25) discard;
    gl_FragColor = vec4(1.0, 1.0, 1.0, uOpacity * vTwinkle);
  }
  ```
- **Why Z-axis rotation specifically**: in `day-night-cycle`,
  `sunDir = (cos θ, sin θ, 0)` — i.e., the sun arcs in the X–Y plane,
  rotating around the Z axis. To make stars co-rotate with the
  moon/sun, rotate them around the **same** axis. Rotating around Y
  would give a horizontal sweep that does not match the moon's path.
- **Why twilight fade band `[-0.25, -0.05]`**: at `sunDir.y = -0.05`
  the sun has just dipped below the horizon and the sky's `horizon`
  color (still warm-orange near `t=0.5`) is bright enough to wash
  stars out. By `sunDir.y = -0.25` (~14° below horizon) the sky is
  dark enough that stars fully assert. This is roughly nautical
  twilight, which feels natural visually.
- **Why additive blending**: stars are bright spots over a dark
  background. Additive composites correctly without a sorted alpha
  pass and looks better when a few stars overlap (e.g., at small
  sizes near a bright moon).
- **Why `clock.getElapsedTime()` for `uTime`**: matches the rest of
  the cycle's frame-rate-independent posture from `day-night-cycle`
  criterion 3. Tab-switching and returning produces correct twinkle
  state for the new wall-clock time.
- **Order of operations in the animate loop** (run every frame, in
  this order, before `renderer.render`, extending the existing
  `day-night-cycle` order):
  1. Compute `t`, `theta`, `sunDir`, `elapsed`.
  2. Update sky-dome `topColor`/`horizonColor` uniforms.
  3. Update sky-dome, sun, and moon positions to follow camera.
  4. Show/hide sun/moon based on `sunDir.y` sign.
  5. Update DirectionalLight position/intensity/color.
  6. Update AmbientLight intensity.
  7. **NEW**: `stars.position.copy(camera.position)`,
     `stars.rotation.z = theta`,
     `material.uniforms.uTime.value = elapsed`,
     `material.uniforms.uOpacity.value = computedFade`.
  8. Run the existing walker physics block (input + gravity + clamp
     + collision).
  Steps 1–7 happen regardless of `controls.isLocked`. Step 8 still
  honors the existing `controls.isLocked` gate.
- **Sphere sampling correctness check**: with the recommended
  `cosTheta = 2v - 1` formulation, integrate over `v ∈ [0, 1]`
  uniformly and `phi ∈ [0, 2π)` uniformly to get a uniform
  distribution on the sphere surface. Avoid the bug of sampling
  `theta = π * v` directly (which over-samples poles).

## Agent Notes

- All edits in this worktree per `AGENTS.md` / `CLAUDE.md`. Do not
  touch the main checkout.
- The current implementation is single-file in `index.html` (inline
  `<script type="module">`). Continuing single-file is fine; the
  star addition is roughly +60 lines (geometry build + shader +
  per-frame updates).
- Reuse existing helpers: `mulberry32` for seeded sampling,
  `clock.getElapsedTime()` for `uTime`, the `theta` variable already
  computed near the top of the animation loop, and the `sunDir`
  vector for the fade calculation.
- Build the star geometry **once** in a `createStars()` function
  called at startup near the existing sky-dome construction. Store
  the `stars` Points object and its material in module scope so the
  animate loop can reach them.
- Sanity-check the shader by temporarily forcing
  `gl_FragColor = vec4(1.0)` and `uOpacity = 1.0` to confirm the
  point cloud is visible during the day; then restore and verify the
  twilight fade.
- Verify by running `python3 -m http.server 8000` from the worktree
  root and walking through criteria 24–33 in a current browser. To
  make manual verification of the night phase bearable, you may
  *temporarily* shorten `DAY_LENGTH` while iterating, but the
  committed value must remain `60` per `day-night-cycle`
  criterion 1.
- Watch the devtools console for shader-compilation warnings —
  mismatched `varying`s between vertex and fragment, wrong attribute
  type (e.g., declaring `attribute vec3 aPhase` when the buffer is
  `Float32Array` of length N), or undeclared uniforms are the
  common pitfalls.
- README updates are optional; running and deploying are unchanged.
