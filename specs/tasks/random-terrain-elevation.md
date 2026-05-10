---
id: random-terrain-elevation
area: scene
priority: 50
depends_on: [random-objects-and-collision]
description: Replace the flat ground plane with a gentle value-noise heightmap (±0.6m), flatten a small zone around spawn, lift props and player support to follow terrain, and remove the now-clipping flat GridHelper
---

# Random Terrain Elevation

## Goal

The world currently sits on a flat `PlaneGeometry(50, 50)` at `y=0` with a
`GridHelper` overlay. Every prop's bottom rests at `y=0`; the player's feet
stand on `supportY` which only rises when standing on a prop. This spec
replaces the flat plane with a gently rolling, procedurally-generated
heightmap (value noise; amplitude ±0.6m) that propagates naturally to prop
bases and player support. A small radial flatten mask around the spawn point
keeps spawn level. The flat `GridHelper` is removed because it would clip
into hills and float over dips.

The terrain regenerates with each **R** press, sharing the same world seed as
props, so each fresh world has a coherent hill layout and prop arrangement.

Other systems are untouched: pointer-lock controls, movement keys, sprint
and jump physics, day/night cycle, sky dome, stars, camera-mode raycast,
info card, and texture pipeline all remain as-is.

## Acceptance Criteria

### Heightmap

1. Add module-scope constants near the existing world constants:
   - `TERRAIN_AMPLITUDE = 0.6`
   - `TERRAIN_GRID = 16` (heightmap grid resolution)
   - `TERRAIN_SEGMENTS = 100` (mesh subdivision count per side)
   - `SPAWN_FLAT_RADIUS = 3.5`
   - `SPAWN_FALLOFF_RADIUS = 7.0`
2. Maintain a module-scope mutable `heightGrid` (a `Float32Array` of length
   `TERRAIN_GRID * TERRAIN_GRID`) holding the current random values in
   `[-1, 1]`.
3. Implement `function heightAt(x, z)` as a pure function with these
   properties:
   - Maps world coords `(x, z) ∈ [-25, 25]²` linearly to grid coords
     `[0, TERRAIN_GRID - 1]`.
   - Out-of-range inputs are clamped so the function is defined everywhere.
   - Bilinearly interpolates `heightGrid` at the floored corners, with
     smoothstep-eased fractional weights:
     `fxs = fx*fx*(3 - 2*fx)`, `fzs = fz*fz*(3 - 2*fz)`.
   - Multiplies the interpolated raw value by `TERRAIN_AMPLITUDE`.
   - Multiplies by the spawn-flatten mask
     `THREE.MathUtils.smoothstep(dist, SPAWN_FLAT_RADIUS, SPAWN_FALLOFF_RADIUS)`
     where `dist = Math.sqrt((x - SPAWN_X)² + (z - SPAWN_Z)²)`.
4. `heightAt` returns exactly `0` when `dist ≤ SPAWN_FLAT_RADIUS` (the mask
   evaluates to 0). The flat radius is fully flat regardless of grid contents.

### Terrain mesh

5. Remove the `GridHelper` lines (its construction and `scene.add(grid)`).
6. Replace the existing flat ground:
   ```js
   const ground = new THREE.Mesh(
     new THREE.PlaneGeometry(50, 50),
     new THREE.MeshStandardMaterial({ color: 0x202428, roughness: 0.9, metalness: 0.0 }),
   );
   ground.rotation.x = -Math.PI / 2;
   scene.add(ground);
   ```
   with a single `terrainMesh` that uses the same material parameters
   (`color: 0x202428`, `roughness: 0.9`, `metalness: 0.0`) and whose geometry
   is built from `PlaneGeometry(50, 50, TERRAIN_SEGMENTS, TERRAIN_SEGMENTS)`
   baked into the XZ plane via `geometry.rotateX(-Math.PI / 2)` (no per-mesh
   rotation). The mesh's name may be left default; `scene.add(terrainMesh)`
   replaces the `scene.add(ground)` call.
7. The `terrainMaterial` is created once and reused across regenerations.
   Only the geometry is rebuilt.
8. Implement `function buildTerrainGeometry(seedVal)` that:
   a. Creates a fresh rng `terrainRng = mulberry32(seedVal ^ 0xa11ce)` so the
      terrain shares the world seed but does not perturb the prop rng
      sequence.
   b. Fills `heightGrid` with `TERRAIN_GRID²` values via
      `terrainRng() * 2 - 1` (range `[-1, 1)`).
   c. Constructs `geometry = new THREE.PlaneGeometry(50, 50, TERRAIN_SEGMENTS, TERRAIN_SEGMENTS)`
      and applies `geometry.rotateX(-Math.PI / 2)`.
   d. Iterates the `position` attribute and sets each vertex's `y` to
      `heightAt(vx, vz)` (where `vx`, `vz` are the vertex's X and Z
      after the rotateX bake).
   e. Calls `geometry.computeVertexNormals()`.
   f. Returns the geometry.
9. On startup, fill `heightGrid` and build the terrain BEFORE the first
   `generate(seed)` call, so prop placement can sample heights.
10. On regeneration (the existing `regenerateRequested` branch in `animate()`),
    rebuild the terrain geometry with the new seed BEFORE calling
    `generate(seed)`. Dispose the old geometry first
    (`terrainMesh.geometry.dispose()`), then assign the new geometry.
11. The heightmap and terrain are deterministic: the same `seed` value always
    produces the same heightmap and the same prop layout.

### Prop integration

12. Inside `generate()`, after computing `posX` and `posZ` (and before
    constructing geometry / aabb), capture
    `const baseY = heightAt(posX, posZ);`.
13. Set `mesh.position.set(posX, baseY + posY, posZ)` so the prop's local
    `posY` (its half-height for boxes/cylinders/cones, or radius for spheres)
    is offset by the terrain height at the prop center.
14. The AABB stored on the prop carries the world-Y of the prop's top:
    `aabb.topY = baseY + topY`. Footprint values
    `minX / maxX / minZ / maxZ` are unchanged.
15. The spawn-exclusion test (`SPAWN_EXCLUSION_RADIUS`) and the prop-overlap
    test are unchanged — both already use only x/z.
16. Props are upright; they are **not** tilted to match the local slope.
    The prop's footprint may dip slightly into terrain on a slope; this is
    intentional given the gentle amplitude.

### Player support and movement

17. `computeSupportY(x, z)` returns
    `Math.max(heightAt(x, z), highestOverlappingPropTopY)` where
    `highestOverlappingPropTopY` is computed by the existing footprint-AABB
    test against `prop.aabb.topY`. A prop only contributes if the player's
    `(x, z)` is inside its inflated footprint, exactly as today.
18. Add a constant `STEP_DOWN_TOLERANCE = 0.2` near the other movement
    constants.
19. In the airborne check inside `animate()`, replace
    ```js
    if (isGrounded && supportY < feetY - 1e-4) {
      isGrounded = false;
      velocityY = 0;
    }
    ```
    with
    ```js
    if (isGrounded && supportY < feetY - STEP_DOWN_TOLERANCE) {
      isGrounded = false;
      velocityY = 0;
    }
    ```
    so gentle downhill walking does not flicker the player into airborne
    state. The unconditional snap
    `if (camera.position.y - EYE_HEIGHT <= supportY) { … }` is unchanged and
    keeps the player glued to the surface.
20. `pushOutAxis` is unchanged. It already compares `feetY` to
    `prop.aabb.topY` in world space; with `topY` now in world space too,
    the existing comparison is still correct.
21. `resetPlayerToSpawn()` sets
    `camera.position.set(SPAWN_X, heightAt(SPAWN_X, SPAWN_Z) + EYE_HEIGHT, SPAWN_Z)`.
    With the flatten mask, `heightAt(SPAWN_X, SPAWN_Z)` is exactly `0`, but
    using the function makes the spawn robust to future radius tweaks.

### Cleanup and lifecycle

22. The terrain material is created once and reused. Disposing the geometry
    on regenerate is mandatory; disposing the material is not.
23. No new dependencies. Three.js stays at the pinned
    `https://unpkg.com/three@0.160.0/...` version. Page remains a build-free
    static site; all edits live in `index.html`. No new files.

### Manual verification

24. Load the page. Browser devtools console shows no errors and no warnings.
25. Stand at spawn and look down. The ground directly under the player is
    visibly flat. Walk a few meters in any direction; the ground starts to
    rise or fall gently.
26. Walk around the world (WASD). Hills and dips read with smooth shading
    (no faceted triangles). The player's feet stay on the surface — no
    popping, no jitter walking up or down hills.
27. Press **Space** on a hill. Player jumps and lands cleanly on terrain.
28. Press **R** several times. Each press changes both the prop layout and
    the hill layout. The spawn area remains flat each time. The player
    re-spawns standing on flat ground.
29. Stand on top of a tall prop on a sloped section of terrain. Walk off the
    prop edge. Player falls cleanly to terrain support level (no clipping
    into ground).
30. Toggle **C** (camera mode) and click on a prop sitting on a slope. The
    info card displays correctly; the prop highlights as before.
31. Day → night cycle: terrain shading varies smoothly with sun angle. At
    dusk, hills facing the sun are warm; hills facing away are cool. At
    night, the surface remains visible at low ambient.

## Out of Scope

- Multi-octave / fractal noise. One octave (16×16 value noise) is enough
  for this amplitude.
- Texture-mapping the terrain (grass / rock / sand blends, slope-based
  splatmaps, etc.). Color stays uniform at `0x202428`.
- Increasing the world size. `HALF_EXTENT` and the plane extent stay at
  50 × 50.
- Tilting props to match local slope. Props remain upright on their
  footprint centers.
- Sliding physics on slopes. Player movement is XZ-planar; terrain only
  changes Y via support snapping.
- Slope-based walking penalties (e.g., slower uphill, sprint disable).
- Footstep sounds, particle puffs, terrain decals.
- Casting / receiving shadows on terrain. The renderer currently has no
  shadow maps; this spec does not add them.
- Water bodies, rivers, valleys carved by hydraulics, biome zones.
- Vegetation, trees, rocks scattered on terrain.
- LOD / dynamic terrain detail / streaming chunks.
- Reworking the GridHelper to drape on terrain. It is removed outright.
- Replacing `mulberry32` with a different rng or seeding scheme.
- Updating the camera-mode raycast to include terrain. It still hits props
  only.
- Changes to lock-overlay copy / README / instructions UI.
- Automated tests / Playwright / visual regression. Verification stays
  manual per the existing project pattern.

## Design Notes

- **Why value noise + smoothstep**: same logic as the noise texture polish.
  Per-pixel uniform random has too much high-frequency energy; bilinear
  interpolation with smoothstep-eased weights gives a soft, low-frequency
  landscape that shades cleanly. With `TERRAIN_GRID = 16` covering 50 m,
  the dominant feature wavelength is roughly 6 m — comfortably larger than
  the player's stride, so the world feels rolling rather than crinkly.
- **Why amplitude ±0.6 m**: the tallest prop is ≈ 3 m. Hills well below
  prop height keep prop silhouettes legible. Slopes peak around
  `0.6 / 3 ≈ 20%`, which the player can stride up without feeling stuck.
- **Why a flatten zone at spawn**: every R press teleports the player to
  `(0, 1.6, 5)`. Without flattening, the player can spawn on a steep slope
  and immediately slide / pop. A 3.5 m flat radius with a 3.5 m smooth
  falloff (3.5 → 7.0) hides the seam where the flatten transitions back
  into rolling terrain.
- **Why reuse the terrain material**: regenerating only the geometry on
  **R** avoids reuploading shader programs and material uniforms. The
  geometry (~10 k vertices) is small enough that rebuilding it from
  scratch each press is trivial.
- **Why a separate `terrainRng`**: the prop generator (`generate()`)
  consumes random numbers in a specific sequence. Salting the terrain rng
  with `seed ^ 0xa11ce` keeps both streams reproducible while not
  perturbing prop placement relative to a hypothetical "no terrain"
  baseline. Determinism per seed is preserved.
- **Why `STEP_DOWN_TOLERANCE = 0.2`**: at walking speed (5 m/s), one
  60 Hz frame advances the player ~0.083 m. On a 20 % downslope the
  terrain drops ~0.017 m — well below 0.2 m. The tolerance covers sprint
  speed (10 m/s ⇒ 0.033 m drop / frame) too. Larger drops (jumping off a
  prop, off a peak) exceed 0.2 m and correctly transition to airborne.
- **Why props are not tilted on slopes**: the gentle amplitude makes the
  visual offense minimal. Tilting would require sampling height at multiple
  points around the footprint and computing a normal, plus rotating the
  mesh accordingly, which fights the existing yaw-only rotation. Out of
  scope for this size of change.
- **Why `computeVertexNormals` instead of analytic normals**: the heightmap
  is small enough that recomputing normals on each rebuild is microsecond-
  scale. Analytic normals would only matter at much higher resolutions.
- **Why `TERRAIN_SEGMENTS = 100`**: gives 0.5 m per quad over 50 m, finer
  than the 6 m feature wavelength so the rendered surface is visibly
  smooth. Larger values add cost without visual benefit at this amplitude.

## Agent Notes

- All edits in this worktree per `AGENTS.md` / `CLAUDE.md`. Do not touch
  the main checkout. Single-file change to `index.html`.
- Implementation order suggestion:
  1. Add the new constants (`TERRAIN_AMPLITUDE`, `TERRAIN_GRID`,
     `TERRAIN_SEGMENTS`, `SPAWN_FLAT_RADIUS`, `SPAWN_FALLOFF_RADIUS`,
     `STEP_DOWN_TOLERANCE`) near the other world / movement constants.
  2. Declare `let heightGrid = new Float32Array(TERRAIN_GRID * TERRAIN_GRID);`
     and define `heightAt(x, z)` near the top of the script (above where
     `generate()` and `computeSupportY()` reference it).
  3. Define `buildTerrainGeometry(seedVal)`.
  4. Replace the existing flat `ground` mesh + `GridHelper` block with the
     `terrainMaterial` + `terrainMesh` block. Either pre-build the geometry
     and pass it to the constructor, or construct with a placeholder and
     assign `terrainMesh.geometry = buildTerrainGeometry(seed);` before the
     first `generate(seed)` call.
  5. Update `generate()` to capture `baseY` and apply it to `mesh.position.y`
     and `aabb.topY`.
  6. Update `computeSupportY` to fold in `heightAt(x, z)` as the floor.
  7. Update `resetPlayerToSpawn()` to use
     `heightAt(SPAWN_X, SPAWN_Z) + EYE_HEIGHT`.
  8. Update the airborne check to use `STEP_DOWN_TOLERANCE`.
  9. In the `regenerateRequested` branch, rebuild terrain geometry before
     calling `generate(seed)`. Dispose the previous geometry first.
- Watch for these pitfalls:
  - `geometry.rotateX(-Math.PI / 2)` must be called BEFORE iterating the
    position attribute. After this rotation, vertex Y values are 0 and the
    X / Z values are world-space — the form `heightAt` expects.
  - Don't forget `geometry.computeVertexNormals()` after displacing
    vertices, or the lighting will be wrong (flat shading, sharp facets).
  - The existing `generate(seed)` is called once at startup; the terrain
    must be built before that call so `heightAt` returns valid values when
    props sample it.
  - When writing to the position attribute, write into the typed array
    directly (or use `attr.setY(i, value)`) and set `attr.needsUpdate = true`
    if the geometry has already been uploaded. For a freshly-constructed
    geometry assigned to a mesh for the first time, the upload happens on
    next render and `needsUpdate` is implicit; for later rebuilds, prefer
    creating a fresh `PlaneGeometry` rather than mutating the same one.
  - `prop.aabb.topY` is read by both `computeSupportY` and `pushOutAxis`.
    Both expect the world-space top, which is what criterion 14 stores.
    The existing collision math is otherwise unchanged.
  - The renderer was constructed with
    `MAX_ANISO = renderer.capabilities.getMaxAnisotropy();` after
    `renderer.setSize(...)` — that ordering is unchanged. The terrain has
    no texture map, so anisotropy does not apply to it.
  - `THREE.MathUtils.smoothstep(x, edge0, edge1)` returns 0 when
    `x ≤ edge0` and 1 when `x ≥ edge1` — verify the argument order matches
    the existing usage on line ~774
    (`1 - THREE.MathUtils.smoothstep(sunDir.y, -0.25, -0.05)`).
- Test locally with `python3 -m http.server 8000` from the worktree root.
  Walk through criteria 24–31. Open devtools and confirm no warnings
  (criterion 24).
