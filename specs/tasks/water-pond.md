---
id: water-pond
area: scene
priority: 50
depends_on: [random-terrain-elevation, distance-fog]
description: Add a seeded-random circular pond — a bowl-shaped depression in the terrain filled with a stylized horizon-tinted water plane the player can wade into (camera can dip below the surface at the deepest point)
---

# Water Pond

## Goal

The world is currently dry — every spot on the 50 × 50 terrain is walkable
ground or a prop. This spec adds a single circular pond, placed
deterministically per seed, that visibly breaks up the flat-ish terrain with
a bowl-shaped depression filled by a stylized animated water surface. The
water is a custom `THREE.ShaderMaterial` (no `Reflector` add-on, no extra
render pass) whose base blue is tinted toward `skyHorizonColor` via a
cheap view-angle Fresnel approximation, so the pond reflects the time of
day — orange at sunset, deep blue at night, light cyan at noon — without
any per-frame color copies. Gentle sine-wave vertex ripples animate from
`uTime`.

The pond is a terrain feature, not a separate physics body: `heightAt(x, z)`
is modified to subtract a smooth bowl whose floor lies at `POND_FLOOR_Y`
when the query point is within `POND_RADIUS` of the pond center. Because
`heightAt` already drives the rendered terrain geometry, prop ground
placement, and the player's support height, the bowl works automatically
for all three with no additional collision code. The player can walk down
the slope into the pond and, at the deepest point, the camera dips below
the water surface — viewed from beneath, the water plane shows through its
own back face (`side: DoubleSide`).

Each press of **R** re-seeds the terrain AND re-rolls the pond position
(rejection sampled to stay clear of spawn, the world edge, and itself).
Props are excluded from the bowl + a small buffer so nothing spawns on
the slope or floating in the water.

The fog, sky dome, sun/moon discs, stars, camera-mode raycast, prop
collision, and existing player physics are unchanged. The water mesh is
NOT a raycast target for the click info card.

## Acceptance Criteria

### Constants

1. Add module-scope constants near the other world constants (next to
   `FOG_*`, `TERRAIN_*`, etc.):
   - `POND_RADIUS = 5` — radius of the bowl carved into the terrain
   - `POND_FLOOR_Y = -2.5` — absolute Y of the bowl's deepest point
   - `POND_WATER_LEVEL = -0.4` — absolute Y of the water plane surface
   - `POND_WATER_RADIUS = 3.6` — radius of the visible water disc
     (smaller than the bowl so a wet beach is visible at the rim)
   - `POND_PROP_KEEPOUT = 6.5` — prop exclusion radius around the pond
     center
   - `POND_SPAWN_MIN_DIST = 13` — minimum distance from spawn `(SPAWN_X,
     SPAWN_Z)` to pond center
   - `POND_PLACEMENT_HALF = 18` — `|x|`, `|z|` ≤ this for the pond center
     (keeps the bowl rim inside the 50 × 50 world with margin)
   - `POND_WAVE_AMPLITUDE = 0.03` — vertex-displacement amplitude on the
     water surface
   - `POND_BASE_COLOR = new THREE.Color('#2A5F8F')` — deep blue water
     base color
   - `POND_OPACITY = 0.75` — water alpha

### Pond placement state and function

2. Add module-scope state alongside `seed` / `rng`:
   ```js
   let pondCenterX = 0;
   let pondCenterZ = 0;
   let pondMesh = null;
   ```
3. Add a `placePond(seedVal)` function that mutates `pondCenterX` /
   `pondCenterZ` using a dedicated RNG stream derived from `seedVal`:
   ```js
   function placePond(seedVal) {
     const pondRng = mulberry32(seedVal ^ 0xb0a7);
     for (let attempt = 0; attempt < 50; attempt++) {
       const x = -POND_PLACEMENT_HALF + pondRng() * 2 * POND_PLACEMENT_HALF;
       const z = -POND_PLACEMENT_HALF + pondRng() * 2 * POND_PLACEMENT_HALF;
       const dx = x - SPAWN_X;
       const dz = z - SPAWN_Z;
       if (dx * dx + dz * dz >= POND_SPAWN_MIN_DIST * POND_SPAWN_MIN_DIST) {
         pondCenterX = x;
         pondCenterZ = z;
         return;
       }
     }
     pondCenterX = -15;
     pondCenterZ = -10;
   }
   ```
   The hardcoded fallback is the safety net if 50 attempts all happen to
   land too close to spawn (extremely unlikely given the constraints).
4. The pond RNG seed is `seedVal ^ 0xb0a7`. It is intentionally independent
   of the terrain RNG (`seedVal ^ 0xa11ce`) so adding the pond does not
   shift the terrain noise distribution for a given seed.

### Terrain modification — bowl in `heightAt`

5. Modify `heightAt(x, z)` to subtract a smooth bowl when the query point
   is within `POND_RADIUS` of `(pondCenterX, pondCenterZ)`. The existing
   function ends with:
   ```js
   return raw * TERRAIN_AMPLITUDE * mask;
   ```
   Capture that value, then blend toward `POND_FLOOR_Y` based on a smooth
   bowl factor:
   ```js
   const terrain = raw * TERRAIN_AMPLITUDE * mask;
   const pdx = x - pondCenterX;
   const pdz = z - pondCenterZ;
   const pondDist = Math.sqrt(pdx * pdx + pdz * pdz);
   if (pondDist >= POND_RADIUS) return terrain;
   const bowlT = 1 - THREE.MathUtils.smoothstep(pondDist, 0, POND_RADIUS);
   return THREE.MathUtils.lerp(terrain, POND_FLOOR_Y, bowlT);
   ```
   - At `pondDist = 0`: `bowlT = 1` → returns `POND_FLOOR_Y` exactly.
   - At `pondDist = POND_RADIUS`: `bowlT = 0` → returns surrounding
     terrain unchanged.
   - Between: smooth `smoothstep` blend, with no cliff at the rim.
6. `heightAt` keeps its existing spawn-flat mask — the pond carving is
   layered on TOP of the spawn-masked terrain. (Because pond center is
   guaranteed ≥ `POND_SPAWN_MIN_DIST = 13` from spawn, and
   `SPAWN_FALLOFF_RADIUS = 7`, the two regions cannot overlap.)
7. No other call sites of `heightAt` are modified — `buildTerrainGeometry`,
   `generate`, `computeSupportY`, `resetPlayerToSpawn` all consume the new
   value transparently.

### Terrain build integration

8. Modify `buildTerrainGeometry(seedVal)` to call `placePond(seedVal)`
   BEFORE filling `heightGrid` (call order does not strictly matter for
   correctness — pond placement is independent of the height grid — but
   placing the call at the top of the function makes the intent obvious).
   ```js
   function buildTerrainGeometry(seedVal) {
     placePond(seedVal);
     const terrainRng = mulberry32(seedVal ^ 0xa11ce);
     // ... rest unchanged
   }
   ```
9. Do NOT add a separate `placePond(seed)` call at the bootstrap or
   regen sites — `buildTerrainGeometry` is the single integration point.

### Water material

10. Create one shared `waterMaterial` (`THREE.ShaderMaterial`) at module
    scope, near the other materials (`skyMaterial`, `starMaterial`):
    ```js
    const waterMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uHorizonColor: { value: skyHorizonColor },
        uBaseColor: { value: POND_BASE_COLOR },
        uOpacity: { value: POND_OPACITY },
        uWaveAmplitude: { value: POND_WAVE_AMPLITUDE },
      },
      vertexShader: /* glsl */ `
        uniform float uTime;
        uniform float uWaveAmplitude;
        varying vec3 vWorldPos;
        varying vec2 vUv;
        void main() {
          vec3 pos = position;
          pos.y += uWaveAmplitude * (
            sin(uTime * 1.5 + pos.x * 0.8)
            + cos(uTime * 1.2 + pos.z * 0.7)
          );
          vec4 worldPos = modelMatrix * vec4(pos, 1.0);
          vWorldPos = worldPos.xyz;
          vUv = uv;
          gl_Position = projectionMatrix * viewMatrix * worldPos;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uBaseColor;
        uniform vec3 uHorizonColor;
        uniform float uOpacity;
        uniform float uTime;
        varying vec3 vWorldPos;
        varying vec2 vUv;
        void main() {
          vec3 viewDir = normalize(cameraPosition - vWorldPos);
          float fresnel = pow(1.0 - max(viewDir.y, 0.0), 3.0);
          vec3 col = mix(uBaseColor, uHorizonColor, fresnel);
          float ripple = 0.5 + 0.5 * sin(uTime * 2.0 + vUv.x * 30.0)
                                    * cos(uTime * 1.5 + vUv.y * 30.0);
          col += 0.05 * ripple;
          gl_FragColor = vec4(col, uOpacity);
        }
      `,
      side: THREE.DoubleSide,
      transparent: true,
      depthWrite: false,
    });
    ```
11. The `uHorizonColor` uniform value MUST reference the same
    `skyHorizonColor` `THREE.Color` instance that the sky shader uses —
    not a copy. Because `updateSkyColors(t)` mutates this color in place
    each frame (via `.copy(...).lerp(...)`), the water material will read
    the live horizon color without any per-frame copy in `animate()`.
12. The water material does NOT declare a `fog` uniform or include any
    `<fog_*>` chunks, so `scene.fog` does NOT affect water shading — same
    pattern as `skyMaterial` and `starMaterial`. This is correct: the
    pond is small (≤ 50 m worst case), and fog tinting on the water would
    fight the sky-tracking Fresnel.

### Pond mesh

13. Add a `createPondMesh()` helper that returns a circle mesh positioned
    at the current `pondCenterX` / `pondCenterZ`:
    ```js
    function createPondMesh() {
      const geometry = new THREE.CircleGeometry(POND_WATER_RADIUS, 48);
      geometry.rotateX(-Math.PI / 2);
      const mesh = new THREE.Mesh(geometry, waterMaterial);
      mesh.position.set(pondCenterX, POND_WATER_LEVEL, pondCenterZ);
      mesh.renderOrder = 0;
      return mesh;
    }
    ```
14. Create the initial pond mesh once during bootstrap, AFTER the first
    `buildTerrainGeometry(seed)` (so `pondCenterX` / `pondCenterZ` are
    set) and BEFORE the first `generate(seed)` (so prop placement can use
    the pond center for exclusion):
    ```js
    terrainMesh.geometry.dispose();
    terrainMesh.geometry = buildTerrainGeometry(seed);
    pondMesh = createPondMesh();
    scene.add(pondMesh);
    generate(seed);
    ```
15. On regenerate (the `if (regenerateRequested)` block in `animate()`),
    dispose the old pond mesh's geometry and create a fresh one AFTER
    `buildTerrainGeometry(seed)` (which updates `pondCenterX` / Z) and
    BEFORE `generate(seed)`:
    ```js
    if (regenerateRequested) {
      seed = (seed + 1) | 0;
      terrainMesh.geometry.dispose();
      terrainMesh.geometry = buildTerrainGeometry(seed);
      scene.remove(pondMesh);
      pondMesh.geometry.dispose();
      pondMesh = createPondMesh();
      scene.add(pondMesh);
      generate(seed);
      resetPlayerToSpawn();
      regenerateRequested = false;
    }
    ```
    Do NOT dispose `waterMaterial` — it's shared across regenerations.

### Prop exclusion around the pond

16. In `generate()`, add a circular pond-exclusion check inside the
    placement-attempt loop, parallel to the existing spawn-exclusion
    block. After the spawn-exclusion `if` block (the one that compares
    against `SPAWN_EXCLUSION_RADIUS`), before the overlap-with-other-props
    loop, add:
    ```js
    const pdx2 = posX - pondCenterX;
    const pdz2 = posZ - pondCenterZ;
    if (pdx2 * pdx2 + pdz2 * pdz2 < POND_PROP_KEEPOUT * POND_PROP_KEEPOUT) {
      geometry.dispose();
      continue;
    }
    ```
    The check uses the prop's center point against `POND_PROP_KEEPOUT`,
    which is `POND_RADIUS + 1.5` — enough to keep the prop's AABB clear
    of the bowl rim for any prop dimension up to ~3 m.
17. The 30-attempt-per-prop budget in `generate()` is unchanged. A prop
    that exhausts its attempts is silently skipped (existing behavior),
    which is fine — the world simply has slightly fewer props when the
    pond happens to land in a dense placement region.

### Per-frame wave update

18. Inside `animate()`, AFTER the existing `updateSkyColors(t)` and fog
    update lines, add one line to advance the water wave time:
    ```js
    waterMaterial.uniforms.uTime.value = elapsed;
    ```
    Use `elapsed` (the value already pulled from `clock.getElapsedTime()`
    at the top of `animate()`), not `t` — waves should animate at real
    seconds, not at the day-cycle phase.
19. The water uniform update lives at top level of `animate()`, NOT
    inside the `if (regenerateRequested)` branch. It runs every frame.
20. No per-frame writes to `uHorizonColor` — its `value` references
    `skyHorizonColor`, which is already mutated in place by
    `updateSkyColors(t)`. The water shader sees the new color
    automatically on the next draw.

### Raycast / camera-mode

21. The existing camera-mode raycast uses
    `raycaster.intersectObjects(props.map((p) => p.mesh))` — props only.
    Do NOT add the pond mesh to this list. Clicking through the water
    onto a prop behind it still picks the prop correctly. Clicking the
    water surface itself does nothing (no info card).
22. The water mesh is added directly to `scene` and is NOT tracked in
    `props[]`. Therefore `disposeProps()`, `computeSupportY()`, and
    `pushOutAxis()` ignore it without modification.

### No other changes

23. The terrain mesh, terrain material, sky dome, sky shader, sun disc,
    moon disc, stars, ambient/directional lights, and fog are not
    modified. The water mesh's `renderOrder = 0` is the default — it
    renders after the sky dome (renderOrder −2) and sun/moon discs
    (renderOrder −1), correctly compositing over them.
24. `HALF_EXTENT`, `SPAWN_EXCLUSION_RADIUS`, `SPAWN_FLAT_RADIUS`,
    `SPAWN_FALLOFF_RADIUS`, `TERRAIN_AMPLITUDE`, and all camera/movement
    constants are unchanged.
25. The player's collision logic (`pushOutAxis`, world-bound clamp at
    `±HALF_EXTENT`) is unchanged. The player can walk past the pond's
    XZ position freely — only the terrain Y dips. The water mesh has no
    collider.
26. Camera `near = 0.1`, `far = 200`, and FOV zoom logic are unchanged.
    When the camera dips below `POND_WATER_LEVEL`, the camera near plane
    can intersect the water plane visually (which is fine: `DoubleSide`
    + `depthWrite: false` keeps it readable).
27. No new dependencies. Three.js stays at the pinned
    `https://unpkg.com/three@0.160.0/...` version. All edits live in
    `index.html`. No new files. No README / overlay copy changes.

### Manual verification

28. Load the page. Browser devtools console shows no errors and no
    warnings.
29. Look around from spawn. A circular pond is visible somewhere in the
    world, NOT overlapping spawn. The terrain visibly dips inward as a
    smooth bowl around the water surface; a thin "wet beach" of bare
    terrain is visible between the water disc edge and the surrounding
    flat-ish ground.
30. Walk toward the pond. The terrain slopes down smoothly under the
    player — the player remains grounded (no falling) and the camera Y
    lowers continuously. Sprinting in does not cause the player to
    skip / become airborne.
31. Walk to the pond center. The camera dips below the water surface
    (you should see the underside of the water plane above you, sky and
    sun/moon visible through it slightly tinted). Walking back up the
    slope brings the camera above water again.
32. Watch the water surface for ~10 seconds. Gentle sine ripples
    animate visibly across the plane; the surface is not flat-static.
33. Wait through a full day/night cycle (60 s). The water reads:
    - **Sunrise / sunset**: warm orange tint at grazing view angles
      (where the Fresnel pulls in the horizon color).
    - **Noon**: pale cyan tint at grazing angles, deeper blue when
      looking straight down.
    - **Night**: dark deep blue, with the horizon's `#0F1B40` showing
      through at grazing angles.
    The color transition is continuous, with no pops.
34. Press **R** several times. Each regeneration moves the pond to a
    new location (visibly different XZ). The pond is never on top of
    spawn (you can always look around at spawn and see the world). No
    prop is placed inside the bowl or floating on the water surface.
35. Press R until the pond happens to land near the world edge. The
    pond's bowl rim is still fully inside the walkable world (i.e., the
    player can walk around the entire pond without hitting the
    `HALF_EXTENT` clamp).
36. Toggle **C** (camera mode), aim at a prop visible BEHIND the pond
    (across the water from the player), zoom in (mouse wheel), and
    click. The info card displays for that prop — the raycast passes
    through the water surface without picking it.
37. Toggle camera mode, aim directly at the water surface, and click.
    Nothing happens (no info card). No console errors.
38. Jump (Space) from the pond floor while standing in the deepest
    point. The player jumps upward, the camera passes through the water
    surface from below to above, and lands back on the bowl floor — no
    physics weirdness, no stuck-in-water state.
39. Stars at night are unaffected by the pond (still crisp). Sun disc
    at noon is unaffected (crisp, not desaturated). Fog still tints
    distant terrain correctly through a full day cycle.
40. Stand at spawn at noon. Distant props beyond the pond are still
    visible (fog is at its thinnest, far ≥ 150). The pond does NOT
    introduce any visible Z-fighting, depth-sort flicker, or seam at
    its rim.

## Out of Scope

- A real planar reflection via `three/addons/objects/Reflector.js`. The
  user explicitly picked the stylized shader option to avoid the extra
  render pass.
- Refraction / underwater distortion / chromatic aberration. Camera
  going below the surface is plain-tinted — no shader effect on the
  rest of the scene.
- An underwater fog / underwater post-processing pass. The fog from
  `distance-fog` continues to use `skyHorizonColor`; it does not pick
  up a "water blue" tint when the camera is below the surface.
- Multiple ponds. Exactly one pond per seed.
- Non-circular ponds (oval, irregular, branching). The bowl is a pure
  function of radial distance from a single center point.
- Caustics, light shafts under water, fish, foam at the shoreline,
  water trails when the player walks through.
- Animating the pond center within a session (drift, current).
  `pondCenterX` / `pondCenterZ` change only when the seed changes
  (i.e., on **R**).
- Swimming physics, buoyancy, slowed walking underwater, breath / drown
  timer, swim-up jump. The player wades through water as if it were
  air; only the terrain depression affects motion.
- Reflecting the sun disc / moon disc explicitly on the water (e.g., a
  bright specular highlight where the sun direction would mirror).
  The horizon-Fresnel mix already approximates the sun's contribution
  at golden hour (because the horizon color IS warm orange then).
- Sound effects (splash on entry, ambient water lap). Audio is out of
  scope for this spec.
- Adjusting the lock-overlay copy, README, or instructions UI to
  mention the pond.
- Updating any existing material's `fog` flag. The water shader's lack
  of fog support is by design.
- Automated tests / visual regression / Playwright. Verification stays
  manual per existing project pattern.
- Performance instrumentation. The added cost is ≤ 1 ShaderMaterial
  with a 48-segment circle (~50 triangles), one extra per-frame uniform
  write, and a constant-cost branch in `heightAt`. No measurement
  needed.

## Design Notes

- **Why one pond, not many**: the world is 50 × 50 with ~25 props. A
  single pond gives the player a memorable landmark and a clearly
  framed water-surface feature without scaling the scene's noise level.
- **Why `POND_RADIUS = 5` and `POND_FLOOR_Y = -2.5`**: the camera must
  be able to dip below the water surface at the deepest point. With
  `EYE_HEIGHT = 1.6` and water at `POND_WATER_LEVEL = -0.4`, the camera
  is below water iff feet `< POND_WATER_LEVEL - EYE_HEIGHT = -2.0`.
  A floor at `-2.5` gives 0.5 m of clear submersion at the center; the
  bowl's `smoothstep`-shaped slope reaches that floor only within ~1 m
  of the exact center, so the dip happens precisely when the player
  stands in the middle. The bowl gradient (2.5 m drop over 5 m radius
  ≈ 0.5 vertical/horizontal at the steepest mid-slope) gives per-frame
  vertical drops well under `STEP_DOWN_TOLERANCE = 0.2` even when
  sprinting, so the player stays grounded as they wade.
- **Why `POND_WATER_RADIUS = 3.6` (less than `POND_RADIUS = 5`)**: the
  water disc has zero thickness, so its edge must sit at or below the
  bowl wall at that radius to avoid clipping into dry terrain. With
  `POND_FLOOR_Y = -2.5` and `POND_WATER_LEVEL = -0.4`, the bowl reaches
  height `-0.4` at roughly `bowlT = 0.16` → `smoothstep⁻¹(0.84) ≈
  0.745` → `r ≈ 3.7 m`. Picking `3.6` gives a small safety margin
  (accounting for noise variation in surrounding terrain) and leaves a
  visible wet-beach ring between water and rim.
- **Why pond seed `seedVal ^ 0xb0a7`**: a separate XOR constant from
  the terrain RNG (`^ 0xa11ce`) ensures pond placement and terrain
  noise are statistically independent — adding the pond doesn't shift
  the random terrain bumps for a given seed (so existing
  `random-terrain-elevation` verification still passes per-seed).
- **Why `POND_SPAWN_MIN_DIST = 13`**: spawn at `(0, 5)` with
  `SPAWN_FALLOFF_RADIUS = 7` (the spawn-flat zone in `heightAt`). With
  pond center ≥ 13 m from spawn and `POND_RADIUS = 5`, the closest the
  bowl rim can get to spawn is `13 − 5 = 8 m`, comfortably beyond the
  7 m spawn falloff. The two terrain modifications never compete.
- **Why `POND_PLACEMENT_HALF = 18`**: world half-extent is 25 (terrain
  span) but the player is clamped to ±24.5 (`HALF_EXTENT`). With pond
  center `|x|, |z| ≤ 18` and `POND_RADIUS = 5`, the bowl rim is at
  most at `±23`, well inside the player-walkable region. The player
  can circumnavigate any seeded pond.
- **Why `POND_PROP_KEEPOUT = 6.5`**: `POND_RADIUS + 1.5 m` clears the
  bowl plus a generous buffer. With prop max half-extent ≈ 1.5 m, a
  prop placed at `pondDist = POND_PROP_KEEPOUT` has its near AABB face
  at least 5 m from the pond center — outside the bowl. Using the
  prop's center (not its AABB) for the check is cheap and conservative
  enough at this scale.
- **Why a `ShaderMaterial`, not `MeshPhysicalMaterial.transmission`**:
  Three's physical material's transmission/refraction works but adds
  a render target and additional sampling cost, and tuning it to look
  stylized (rather than physical glass) is fiddly. A small custom
  shader gives full control over the Fresnel mix and ripple
  modulation in ~30 lines, no extra passes.
- **Why `pow(1.0 - max(viewDir.y, 0.0), 3.0)` for Fresnel**: this is
  the cheap Schlick-style approximation — when the view direction is
  parallel to the water surface (`viewDir.y → 0`, looking across the
  pond from a low angle), Fresnel → 1 and the surface reads almost
  pure `skyHorizonColor`. Looking straight down (`viewDir.y → 1`),
  Fresnel → 0 and the surface reads `uBaseColor`. The cubic exponent
  keeps the base color dominant for most of the player's gaze cone.
- **Why `side: DoubleSide` + `depthWrite: false`**: when the camera is
  under water, the back face of the plane must render so the player
  sees a surface above them. `depthWrite: false` avoids Z-fighting at
  the wet beach (where the disc edge sits very close to the bowl
  wall) and prevents the water from occluding props behind it in the
  transparent sort.
- **Why `uTime` from `elapsed`, not `t`**: `t = (elapsed % DAY_LENGTH)
  / DAY_LENGTH` cycles every 60 s — using it would reset the wave
  pattern every minute, producing a visible "tick." `elapsed`
  monotonically increases, giving continuous animation.
- **Why `uHorizonColor` references `skyHorizonColor` directly**:
  Three.js `ShaderMaterial` reads uniform `value` fields by reference
  on each draw. Mutating the underlying `THREE.Color` (which
  `updateSkyColors` does via `.copy(...).lerp(...)`) propagates
  automatically — no `material.uniforms.uHorizonColor.value.copy(...)`
  call in `animate()`. This is the same pattern `skyMaterial` already
  uses for `uHorizonColor` and `uTopColor`.
- **Why the wave amplitude is `0.03`**: large enough to read as motion
  from eye height (~1.6 m above water), small enough that the disc
  edge doesn't oscillate visibly past its baseline radius. Higher
  values cause the disc edge to "breathe" outside the wet-beach line.
- **Why `placePond` lives at the top of `buildTerrainGeometry` (not as
  a separate top-level call)**: the pond center must be known before
  any `heightAt(x, z)` call inside `buildTerrainGeometry`'s
  position-setting loop — otherwise the rendered terrain mesh would
  use the previous frame's pond location. Putting the call at the top
  of the function makes the ordering invariant local and obvious.

## Agent Notes

- All edits in this worktree per `AGENTS.md` / `CLAUDE.md`. Single-file
  change to `index.html`.
- Implementation order suggestion:
  1. Add the new constants block near the existing `FOG_*` constants
     (around line ~537).
  2. Add module-scope state `pondCenterX`, `pondCenterZ`, `pondMesh`
     alongside `seed`, `rng`, `props` (around line ~545).
  3. Add the `placePond(seedVal)` function near the other top-level
     helpers (after `mulberry32`, or near `heightAt`).
  4. Modify `heightAt(x, z)` to add the bowl term — capture the
     existing return value as `terrain`, then apply the bowl
     `smoothstep`/`lerp`.
  5. Modify `buildTerrainGeometry(seedVal)` to call `placePond(seedVal)`
     at the top.
  6. Add `waterMaterial` and `createPondMesh()` near the other
     material declarations (after `starMaterial`, before
     `terrainMaterial`).
  7. After the bootstrap `terrainMesh.geometry = buildTerrainGeometry(seed)`
     line, add `pondMesh = createPondMesh(); scene.add(pondMesh);` before
     the bootstrap `generate(seed);` call.
  8. Inside `animate()`, add the regen branch dispose/recreate for
     `pondMesh` and the per-frame `waterMaterial.uniforms.uTime.value
     = elapsed;` line (after `updateSkyColors(t)` and the fog updates).
  9. In `generate()` inside the placement-attempt loop, add the
     pond-keepout circular check right after the spawn-exclusion
     block.
- Watch for these pitfalls:
  - `uHorizonColor` MUST be `{ value: skyHorizonColor }`, NOT
    `{ value: skyHorizonColor.clone() }`. The whole sky-tracking trick
    relies on shared mutation. (Same pattern as the existing
    `skyMaterial` uniforms — they use the same `skyHorizonColor`
    instance.)
  - Use `THREE.MathUtils.smoothstep` and `THREE.MathUtils.lerp` in
    `heightAt` for consistency with the existing spawn-mask code and
    the fog code — not handwritten polynomial smoothsteps.
  - Do NOT add the pond mesh to `props[]`. It must not appear in the
    raycast list, `disposeProps()`, or `computeSupportY()`.
  - When recreating the pond mesh on regen, dispose ONLY the geometry
    (`pondMesh.geometry.dispose()`) — NOT the material. The material
    is reused across regens. (`waterMaterial` is shared.)
  - The pond mesh must be created AFTER `buildTerrainGeometry(seed)`
    (which sets `pondCenterX` / `pondCenterZ`) and BEFORE
    `generate(seed)` (which reads them for the prop-keepout check).
    Both at bootstrap and in the regen branch.
  - `placePond` uses `mulberry32(seedVal ^ 0xb0a7)` — a fresh RNG per
    call. Do NOT consume from the global `rng` (which `generate()` uses
    for prop placement), or you'll shift the per-seed prop layout.
  - The water disc's `CircleGeometry` is built in the XY plane by
    default; rotating with `geometry.rotateX(-Math.PI / 2)` lays it
    flat with normal pointing +Y. Without this, the disc faces the
    wrong way and the Fresnel `viewDir.y` term is wrong.
  - The water material is `transparent: true`, `depthWrite: false`.
    `renderOrder = 0` (the default) is correct — it renders after the
    sky dome (−2) and discs (−1). Do NOT set a higher render order; it
    needs to draw after opaque terrain in the same transparent pass
    Three.js auto-sorts.
  - When the player is in the bowl, `computeSupportY(x, z)` returns
    the dipped terrain Y (via the modified `heightAt`). No additional
    physics changes are needed for wading.
  - `POND_SPAWN_MIN_DIST = 13` is the minimum CENTER-TO-CENTER
    distance — the rejection check compares squared distances against
    the squared threshold. Don't use the `Math.hypot` form (the
    existing code consistently uses squared comparisons for circle
    tests).
- Test locally with `python3 -m http.server 8000` from the worktree
  root. Walk through criteria 28–40. Press R at least 5 times to
  confirm pond placement is well-distributed and never overlaps spawn
  or props. Wait one full day cycle (60 s) at the pond's edge to see
  the horizon-color tint cycle through orange → cyan → blue. Open
  devtools and confirm no shader-compile warnings (criterion 28).
