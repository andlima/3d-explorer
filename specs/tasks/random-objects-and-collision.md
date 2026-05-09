---
id: random-objects-and-collision
area: scene
priority: 50
depends_on: [day-night-cycle]
description: Replace the single blue cube with a seeded random set of 15–30 textured shapes (box/sphere/cylinder/cone) that the first-person walker collides with as solid AABBs (block horizontally, walk on top). Press R to regenerate.
---

# Random Objects and Collision

## Goal

Replace the single blue cube with a **seeded random scene** of **15–30 props**
spread across the existing 50×50 ground. Each prop is one of four primitive
shapes (box / sphere / cylinder / cone) at a random size, with a procedural
canvas-generated texture and a random color tint. The first-person walker
**collides** with these props treated as solid axis-aligned bounding boxes:
horizontal motion is blocked at the prop's XZ footprint, and the walker can
**jump on top** of a prop and stand or walk on it. Pressing **R** rerolls the
seed and regenerates the layout. Day/night cycle, sprint, jump, pointer-lock
controls, ground, grid, and lighting from prior tasks are unchanged.

## Acceptance Criteria

### Seeded random and regeneration

1. Add a tiny seeded PRNG so the same seed produces the same layout every
   time. Use **mulberry32** (or any equivalent 32-bit-state PRNG that fits in
   ~5 lines) — do not pull in an npm dependency. Reference impl:
   ```js
   function mulberry32(a) {
     return function () {
       a |= 0; a = (a + 0x6D2B79F5) | 0;
       let t = Math.imul(a ^ (a >>> 15), 1 | a);
       t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
       return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
     };
   }
   ```
   All randomness in scene generation (count, shape pick, sizes, positions,
   rotations, texture pick, color tint) must read from this seeded stream so
   the layout is fully deterministic per seed.
2. The **default initial seed is `1`** (a fixed integer, not `Date.now()` or
   `Math.random()`). Reloading the page without changing the seed must
   produce the **identical** scene each time.
3. Pressing **R** (key code `KeyR`) regenerates the scene with a new seed.
   The new seed is produced by a deterministic step from the current seed
   (e.g. `seed = (seed + 1) | 0` or `seed = mulberry32(seed)() * 2^32`) so
   the sequence of layouts the user steps through is itself deterministic
   per starting seed.
4. The R key works **whether or not pointer lock is engaged**. It does not
   trigger pointer lock and does not affect lock state. It must not
   re-trigger every frame while held; respond on the keydown edge only
   (use `e.repeat === false` or an edge-trigger flag, mirroring the
   Space-to-jump pattern from `sprint-and-jump`).
5. On regeneration: dispose of the previous props' geometries and materials
   (call `geometry.dispose()` and `material.dispose()` for each removed
   mesh) and remove them from the scene. Procedural textures cloned per
   object should also be disposed (`texture.dispose()`); the **base
   pattern textures** (criterion 12) are reused across regenerations and
   are *not* disposed.
6. On regeneration the **player is reset to spawn**: `camera.position` set
   to `(0, EYE_HEIGHT, 5)`, `velocityY = 0`, `isGrounded = true`, any
   queued jump cleared, and `airSpeed = WALK_SPEED`. (Rationale: avoids
   the player ending up clipped inside a freshly spawned prop, and avoids
   "frozen mid-jump" edge cases.) Camera **yaw and pitch are preserved**
   — do not reset look direction.

### Object set and counts

7. Per generation, pick a **random object count** in the inclusive range
   **[15, 30]** using the seeded PRNG.
8. The shape pool is exactly **four** primitives, each picked uniformly at
   random per object:
   - `BoxGeometry`
   - `SphereGeometry`
   - `CylinderGeometry`
   - `ConeGeometry`
9. Per-object **size ranges** (uniform random from the seeded PRNG):
   - **Box**: width ∈ [0.6, 2.5], height ∈ [0.6, 2.5], depth ∈ [0.6, 2.5]
     (each axis independent).
   - **Sphere**: radius ∈ [0.5, 1.5].
   - **Cylinder**: radius ∈ [0.4, 1.2], height ∈ [0.6, 2.5].
   - **Cone**: base radius ∈ [0.4, 1.2], height ∈ [0.8, 3.0].
   Geometry segment counts may stay at Three.js defaults (sphere
   widthSegments/heightSegments may be increased to 16/12 for smoother
   look — optional).
10. Each object is positioned so it **rests on the ground** (its lowest
    point touches `y = 0`):
    - Box: `position.y = height / 2`
    - Sphere: `position.y = radius`
    - Cylinder: `position.y = height / 2`
    - Cone: `position.y = height / 2`
    XZ position is uniform in **`[-22, 22]`** (this leaves a small margin
    inside the existing `HALF_EXTENT = 24.5` walker clamp so props near
    the world boundary aren't pushed against the wall). Optionally apply
    a random Y-axis rotation in `[0, 2π)` per object — purely visual.

### Placement constraints

11. **Player-spawn exclusion zone**: no object's expanded AABB (see
    criterion 17 for the expansion radius) may overlap a disc of radius
    **2.5** centered on the spawn XZ `(0, 5)`. Reject and resample any
    candidate that would overlap; give up after **30** attempts for that
    slot and just skip that object (so the final count may dip below the
    target by a handful — that's fine).
12. **No prop-prop overlap**: candidate AABBs must not intersect any
    already-placed prop's AABB (no expansion needed for prop-prop
    rejection). Same retry budget as criterion 11 (30 attempts per slot,
    then skip).
13. The final placed count is whatever survives criteria 11–12. The
    **target** count from criterion 7 is an upper bound; do not loop
    forever trying to hit it.

### Procedural canvas textures

14. At startup, generate **four** base pattern textures into offscreen
    `<canvas>` elements (256×256 px each), wrapped in
    `THREE.CanvasTexture`. The four patterns are:
    - **Checker**: 8×8 cells, alternating `#FFFFFF` and `#202020`.
    - **Stripes**: 8 vertical stripes, alternating `#FFFFFF` and
      `#404040`.
    - **Dots**: white background `#F2F2F2` with a 6×6 grid of
      `#1A1A1A` filled circles, each circle radius ≈ 12 px.
    - **Noise**: 256×256 grayscale white noise drawn pixel-by-pixel
      (each pixel `v = floor(rng()*256)`, RGB all equal). The noise
      generation may use the same seeded PRNG (with a fixed sub-seed)
      so the texture itself is deterministic across reloads, OR it may
      use `Math.random()` once at startup — both are acceptable since
      the texture is generated once and reused.
    These four textures are **created once at page load** and **reused
    across regenerations** (they are not regenerated when R is pressed).
15. Per object, **clone** the chosen base texture (`baseTexture.clone();
    cloned.needsUpdate = true;`) so per-object `wrapS/wrapT` and
    `repeat` settings don't bleed across objects:
    - `wrapS = wrapT = THREE.RepeatWrapping`
    - `repeat.set(s, s)` where `s = max(1, round(maxExtent))` and
      `maxExtent` is the largest world-space dimension of the object
      (e.g. for a box, the max of width/height/depth; for a sphere,
      `2 * radius`). This keeps texture density roughly constant
      across object sizes; a 2×2×2 box gets `repeat=2`, a 0.6×0.6×0.6
      box gets `repeat=1`.
16. Per object, the material is `MeshStandardMaterial` with:
    - `map = clonedTexture`
    - `color` = a random tint in HSL: hue ∈ [0, 1) uniform from the
      PRNG; saturation ∈ [0.4, 0.8]; lightness ∈ [0.45, 0.7]
      (avoids near-black and near-white tints that wash out the
      texture).
    - `roughness` ∈ [0.4, 1.0] (random per object).
    - `metalness` ∈ [0.0, 0.3] (random per object — keeps the scene
      mostly non-metal).
    No `emissive`, no transparency, no normal/AO/displacement maps. The
    base color tint multiplies with the texture map per Three.js
    standard behavior — this is the source of per-object color variety.

### Collision — solid AABB walls

17. Each prop has a precomputed **axis-aligned bounding box** in world
    space. Compute it once at placement using the prop's geometry
    extents around its position:
    - Box: trivial from `(width, height, depth)`.
    - Sphere: `(2r, 2r, 2r)`.
    - Cylinder: `(2r, h, 2r)`.
    - Cone: `(2r, h, 2r)` (base radius doubled).
    Store `{ minX, maxX, minZ, maxZ, topY }` per prop (we don't need
    `minY` since objects always sit on the ground and the player can
    never go below `y = 0`).
18. Define **player horizontal radius** `PLAYER_RADIUS = 0.3` (one new
    constant in the existing constant block).
19. Horizontal motion uses a **per-axis swept push-out** against each
    prop's XZ footprint expanded by `PLAYER_RADIUS`:
    - First apply X movement (`controls.moveForward` and
      `controls.moveRight` decompose into world-space XZ — capture the
      XZ delta they would produce *before* applying it; or apply
      movement and then push out per axis, whichever is simpler in the
      existing code structure).
    - For each prop, treat the XZ rect `[minX − PLAYER_RADIUS,
      maxX + PLAYER_RADIUS] × [minZ − PLAYER_RADIUS, maxZ +
      PLAYER_RADIUS]`. If the player's XZ point is inside the rect
      **AND** the player's feet (`camera.position.y − EYE_HEIGHT`) are
      strictly below `topY − 0.01` (i.e. the player is not standing on
      or above the prop), the prop is a wall on this axis.
    - Push the player back along the axis of motion to the nearest
      face: if moving in `+X`, snap `camera.position.x = minX −
      PLAYER_RADIUS − ε`; if `−X`, snap to `maxX + PLAYER_RADIUS + ε`,
      where `ε ≈ 1e-3`.
    - Repeat the same logic for Z.
    Per-axis-then-other gives the standard "slide along the wall"
    behavior — running diagonally into a wall slides along it.
20. The XZ blocking applies **whether the player is on the ground or
    airborne**. So the walker cannot jump *through* the side of a tall
    prop; they can only land on top by clearing it vertically.
21. The existing `HALF_EXTENT` clamp from `first-person-navigation` is
    applied **after** prop-collision push-out each frame. World-edge
    walls and prop walls behave the same: stop, slide.

### Collision — walk on top

22. Each frame, after horizontal movement and prop push-out, compute
    `supportY` at the player's current XZ:
    - `supportY = max(0, max over props whose expanded XZ rect contains
      the player point of `prop.topY`)`.
    - "Expanded XZ rect" uses the same `PLAYER_RADIUS` expansion as
      criterion 19 — so the player's footprint counts as on top of a
      prop when their point is within `PLAYER_RADIUS` of the prop's
      XZ footprint.
    - If multiple props' rects contain the player, the highest `topY`
      wins (i.e. you stand on the tallest one).
23. **Landing / standing**: after gravity is applied and `camera.position.y`
    is updated for the frame, if `camera.position.y − EYE_HEIGHT <=
    supportY`, snap `camera.position.y = supportY + EYE_HEIGHT`, set
    `velocityY = 0`, set `isGrounded = true`. This generalizes the old
    "snap to `EYE_HEIGHT`" behavior from `sprint-and-jump` (which is the
    `supportY = 0` case).
24. **Walking off a ledge**: if `isGrounded === true` at the start of a
    frame but after horizontal movement the new `supportY` is strictly
    less than `(camera.position.y − EYE_HEIGHT)`, the player has stepped
    off — set `isGrounded = false` and `velocityY = 0` so gravity takes
    over next frame. Air control follows the existing rule from
    `sprint-and-jump`: `airSpeed` keeps whatever value it had (typically
    `WALK_SPEED` since you weren't jumping). The walker then falls
    naturally under gravity onto whatever lower surface (or the ground)
    is beneath them.
25. **Jumping from on top of a prop** uses the same physics as jumping
    from the ground: `velocityY = JUMP_VELOCITY`, `airSpeed` captured
    from the current ground speed, `isGrounded = false`. There is no
    special "small bonus when jumping off a tall prop" behavior.
26. **No step-up auto-climb**: if the player walks into a prop whose
    `topY` is, say, `0.4` (a small step), they are blocked horizontally
    just like a tall wall. To get on top of any prop, they must jump.
    This is intentional simplicity — the only tier of vertical traversal
    is `Space`.

### Walker integration (preserved behavior)

27. Walker physics constants from `sprint-and-jump` are unchanged:
    `WALK_SPEED = 5`, `SPRINT_MULTIPLIER = 2`, `JUMP_VELOCITY = 7.5`,
    `GRAVITY = 25`, `AIR_CONTROL = 0.5`, `EYE_HEIGHT = 1.6`,
    `HALF_EXTENT = 24.5`. The new constants `PLAYER_RADIUS = 0.3` and
    the seeded-RNG state are added alongside them.
28. Sprint, jump-edge-detection, gravity integration, frame-rate
    independence, and the unlocked-airborne behavior (gravity continues
    to apply when pointer lock is released mid-jump) all behave
    identically to `sprint-and-jump`.
29. Day/night cycle from `day-night-cycle` is unchanged. Sky dome,
    sun/moon discs, DirectionalLight position/intensity/color, and
    AmbientLight intensity all continue to update each frame regardless
    of pointer-lock state and regardless of the new prop/collision
    logic.
30. Ground plane (`PlaneGeometry(50, 50)`), `GridHelper`, and the two
    light sources are unchanged. **The single blue cube is removed** —
    it is fully replaced by the random props.
31. The instructional overlay text **must be updated** to mention the
    new R binding, e.g.:
    > "WASD / arrows to move · Shift to sprint · Space to jump · R to
    > randomize · mouse to look · ESC to release"
    Layout / CSS changes beyond the text are not required.

### Project constraints

32. The page remains a **build-free static site** — no `package.json`,
    no bundler, no new runtime dependencies beyond Three.js itself
    (`three` and `three/addons` already in the importmap). All resource
    references stay relative so the page still works under the GitHub
    Pages project subpath.
33. Do not bump the pinned Three.js version. Do not add `package.json`,
    `vite.config.*`, or any GitHub Actions workflow. No physics engine
    (no cannon, no rapier, no ammo) — collision is the small AABB code
    described above.

### Manual verification

34. Loading the page (default seed `1`): a varied scene of 15–30 props
    is visible — a mix of boxes, spheres, cylinders, cones — with
    visibly different sizes, textures (checker / stripes / dots /
    noise), and color tints. The blue cube from the previous task is
    gone. Reloading the page produces the **identical** layout.
35. Without clicking (no pointer lock yet): the day/night cycle still
    runs as in `day-night-cycle` — sky gradients, sun/moon arcs, light
    intensity all change. Props are lit by the directional sun (their
    shaded sides face away from the sun position).
36. Click to lock and walk into the side of a box-shaped prop: the
    walker stops at the prop's edge instead of passing through. Walk
    along the wall diagonally — the walker slides along the prop's
    face, doesn't get stuck.
37. Walk into a cylinder or cone: the walker is blocked at the
    rectangular bounding-box footprint of the shape (slightly wider
    than the visible base — this is expected per design).
38. Jump (`Space`) onto a prop tall enough that the apex (≈ 1.1 above
    eye height, so ≈ 1.1 above ground floor — meaning a prop with
    `topY ≤ ~1.1` from a standing jump) clears its top: the walker
    lands on top and stands there. Looking down shows the walker is
    standing on the prop's surface.
39. While standing on a prop, walk to the edge: the walker drops off
    when their XZ-with-radius footprint leaves the prop, falling under
    gravity to the ground (or onto a lower prop) rather than freezing
    or jumping.
40. Sprint-jump onto a prop: the increased horizontal `airSpeed` from
    sprint takeoff (criterion 10 in `sprint-and-jump`) lets the walker
    cover more ground per jump and reach more distant props.
41. Press **R** with pointer lock engaged: the scene regenerates
    instantly with a new layout, the player teleports back to spawn
    `(0, 1.6, 5)`, look direction is preserved, and pointer lock stays
    engaged. The day/night cycle is uninterrupted.
42. Press **R** with pointer lock released (overlay showing): same
    regeneration behavior; overlay stays visible; pressing R again
    rerolls again. R works repeatedly — pressing it 5 times produces
    5 distinct layouts.
43. Press R while airborne mid-jump: scene regenerates, player is reset
    to spawn standing on the ground with `velocityY = 0` (no
    half-finished jump arc continues).
44. Walk to the world boundary (`HALF_EXTENT = 24.5`): existing world
    clamp still works — the walker stops at the edge of the 50×50
    ground.
45. Browser devtools console shows no errors or warnings. In particular:
    no `MeshStandardMaterial` shader-compile warnings, no
    `disposed before render` warnings after pressing R, no
    `WebGL: GL_INVALID_OPERATION` from texture wrapping/repeat
    settings.
46. After pressing R several dozen times, browser performance and
    memory stay stable — no observable leak from undisposed props
    (criterion 5).

## Out of Scope

- A real physics engine (cannon-es, rapier, ammo.js) or any
  rigid-body simulation. Props are static; collision is hand-rolled
  AABB.
- Per-shape exact-collision (cylinder cap, sphere bulge, cone slant).
  Every shape collides as its axis-aligned bounding box; the radial
  footprint of a small cylinder will feel slightly square. This is a
  conscious simplicity / performance trade-off.
- Stacking props vertically at random. Every prop sits on the ground
  (`y = 0`). The player can stand on top of one prop, but two props
  do not stack on each other in the random layout.
- Step-up auto-climb (walking onto a small ledge without jumping).
  All vertical traversal goes through `Space`.
- Pushing or moving props at runtime (kicking, dragging, picking up,
  inventory). Props are static obstacles.
- Loading external image textures, GLTF / OBJ models, normal maps,
  AO maps, displacement maps, environment maps, IBL, shadow maps,
  or any post-processing pass.
- Persisting the seed or layout across reloads (no localStorage, no
  URL parameter). Default seed is hardcoded to `1`. (This is a
  deliberate simplicity — adding a `?seed=N` URL parameter is a
  reasonable future extension but is not part of this task.)
- HUD elements showing seed number, prop count, FPS, or position.
- Audio for collisions, footsteps, or jumps.
- Touch / mobile / gamepad bindings or any input changes beyond
  adding the new R keybinding.
- Replacing or restyling the ground plane, grid helper, sky dome,
  sun, moon, or any lighting. Ambient and directional lights stay
  exactly as `day-night-cycle` left them.
- Adding TypeScript, a bundler, npm tooling, or any new runtime
  dependency. Three.js stays at its current pinned version.
- Automated tests / Playwright / visual regression — verification
  stays manual per the existing project pattern.

## Design Notes

- **State to track**: `let seed = 1;` (current seed), `let rng =
  mulberry32(seed);` (the active PRNG instance), and a `let props =
  []` array holding `{ mesh, aabb }` per prop. On regeneration:
  dispose all `props[i].mesh.geometry` / `material` / `material.map`,
  remove from scene, clear the array, advance `seed`, rebuild `rng`,
  repopulate.
- **Order of operations in the animation loop** (per frame):
  1. Read elapsed time, compute `t`, update sky / sun / moon / lights
     (unchanged from `day-night-cycle`).
  2. If locked, read horizontal input vector and compute the desired
     horizontal speed (ground or air per existing rules).
  3. Apply X movement → run X-axis prop push-out (criterion 19) → apply
     world `HALF_EXTENT` clamp on X.
  4. Apply Z movement → run Z-axis prop push-out → apply `HALF_EXTENT`
     clamp on Z.
  5. Apply gravity to `velocityY` and `camera.position.y` (only if
     `!isGrounded`; or always — both work as long as the snap below
     fires correctly).
  6. Compute `supportY` at current XZ; snap / set grounded per criteria
     22–24.
  7. Render.
- **How to integrate XZ push-out with `PointerLockControls`**:
  `controls.moveForward(d)` and `controls.moveRight(d)` mutate
  `camera.position` directly. The simplest implementation is:
  apply `moveForward(forward * speed * delta)` then run
  Z-axis push-out (because forward is along world Z given default
  yaw); apply `moveRight(right * speed * delta)` then run X-axis
  push-out. **However** that's wrong when the camera is yawed — the
  "X" of `moveRight` may end up pointing along world Z, etc. The safer
  approach: snapshot `camera.position.x` before the call, do the move,
  then check the **delta** in world X/Z, treat it as the per-axis
  movement for push-out. Even simpler: do the full XZ move, then run
  push-out for X and Z independently using the sign of the world-space
  delta as the "direction of motion" for that axis. The single-axis
  push-out described in criterion 19 still works because it pushes the
  player to the nearest face along the axis of motion.
  (If this gets fiddly, an acceptable alternative is: derive the
  desired XZ delta vector manually from the camera's yaw and the
  input vector — `PointerLockControls` source is short and the math
  is the standard `forward = -sin(yaw), cos(yaw)` etc. — apply X first
  with push-out, then Z with push-out. Either approach satisfies the
  criteria.)
- **Bounding-box helper**: build a `BoundingBoxXZ` per prop with the
  five fields `{ minX, maxX, minZ, maxZ, topY }`. Don't rely on
  `geometry.boundingBox` from Three.js for cylinders/cones — it gives
  you the local-space AABB, which you'd then have to transform; doing
  the math directly from the size/position you generated is shorter
  and clearer.
- **Texture cloning**: `THREE.CanvasTexture` instances support
  `.clone()`, which shares the underlying `image` (the canvas) but
  gives independent `wrapS/T`, `repeat`, `offset`, and `needsUpdate`
  fields. After cloning set `cloned.needsUpdate = true` once so the
  GPU upload happens. Disposing a cloned texture does not invalidate
  the base canvas; the base textures' `.dispose()` is never called
  during normal operation.
- **Where to put scene generation**: a single `function generate(seed)`
  that disposes existing props, sets `rng = mulberry32(seed)`,
  generates the new prop list, and pushes them to the scene. Called
  once at startup and once per R press. This keeps the regeneration
  path identical to the initial generation path.
- **Why dispose**: pressing R many times without disposing leaks
  geometries / materials / textures into the GPU. Three.js does not
  garbage-collect GPU resources. The dispose calls are required by
  criterion 5 and verified by criterion 46.
- **Why the spawn exclusion zone (criterion 11)**: without it, the
  default seed could spawn a prop directly under the camera's feet,
  immediately blocking all motion. A 2.5-unit disc around `(0, 5)`
  guarantees a small comfortable arena around spawn even on adversarial
  seeds.
- **PRNG sub-streams (optional)**: for clarity you may build separate
  PRNG instances for "scene generation" and "noise texture" with
  different seeds (e.g. `rng = mulberry32(seed)`,
  `noiseRng = mulberry32(0xC0FFEE)`). Not required, but it keeps
  the generated noise texture stable when the user rerolls only the
  scene seed. (Per criterion 14, the noise texture is generated once
  and reused, so `noiseRng` runs exactly once anyway.)
- **AABB epsilon (`ε ≈ 1e-3`)**: a small positive margin pushes the
  player just outside the wall to avoid floating-point re-trigger
  jitter. Without it the walker can oscillate one frame in / one
  frame out at the contact point.
- **No need to touch** the ground `PlaneGeometry`, `GridHelper`, the
  sky dome, sun/moon discs, the importmap, the directional or ambient
  lights, or the pointer-lock overlay click handler. The only overlay
  change is the textual hint listing keybindings.

## Agent Notes

- All edits in this worktree per `AGENTS.md` / `CLAUDE.md`. Do not
  touch the main checkout.
- The current implementation is single-file in `index.html` (inline
  `<script type="module">`). It has grown to ~300 lines after the
  previous tasks. **Continuing to keep it single-file is fine** if
  you want to stay consistent; **extracting to `./main.js` is also
  fine** if you'd prefer cleaner separation. If extracting, keep the
  importmap in `index.html` and reference `./main.js` with a relative
  path (matching the convention noted in earlier tasks). Either choice
  satisfies the spec.
- Implement and verify in this order to keep the surface manageable:
  1. Generate the four base canvas textures and confirm one prop
     renders with each pattern (sanity check before random pick).
  2. Add seeded RNG and the `generate(seed)` flow with no collision
     yet — confirm the layout looks varied and is identical across
     reloads.
  3. Add the AABB walls (criteria 17–21) — confirm horizontal
     blocking and slide work against a few props.
  4. Add walk-on-top (criteria 22–26) — confirm jumping onto a low
     box works and walking off the edge falls correctly.
  5. Add the R rebind and dispose path (criteria 3–5) — confirm no
     console warnings, layout changes per press, and stable memory
     after many presses.
- Do not bump the pinned `three` version. Do not add `package.json`,
  `vite.config.*`, or any GitHub Actions workflow.
- Do not introduce any library beyond Three.js itself. No physics
  engine, no PRNG library, no canvas helper — everything in this
  spec is a few dozen lines of math and DOM.
- Verify by running `python3 -m http.server 8000` from the worktree
  root and walking through criteria 34–46 in a current browser.
  Watch the devtools console throughout.
- The "block + walk on top" model has a known visual mismatch with
  cylinders/cones (square footprint vs. round visual). This is
  acknowledged in criterion 37 and Out of Scope; do not invent
  per-shape collision to "fix" it.
- README updates are optional; running and deploying are unchanged.
