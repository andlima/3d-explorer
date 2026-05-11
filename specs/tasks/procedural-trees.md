---
id: procedural-trees
area: scene
priority: 50
depends_on: [random-terrain-elevation, water-pond]
description: Scatter a seeded-random forest of low-poly conifers (cylinder trunk + cone canopy) across the terrain — sit on the heightmap, avoid spawn / pond / props / each other, and act as impassable horizontal obstacles the player cannot stand on
---

# Procedural Trees

## Goal

The world currently has randomized geometric props and a single pond, but it
still reads as empty geometry on dirt. This spec scatters a deterministic-per-
seed forest of low-poly conifer-style trees — a cylinder trunk topped with a
cone canopy — across the 50 × 50 terrain. Each tree's base follows
`heightAt(x, z)` so trees sit flush with hills and dips, and rejection-sampled
placement keeps the forest out of the spawn pocket, out of the pond bowl,
clear of props, and non-overlapping with itself.

Trees act as impassable horizontal obstacles via the existing `pushOutAxis`
collision system, but they are explicitly NOT walkable on top — even with
`feetY` above a short tree's apex (reachable only by sprint-jumping off a
tall box prop), the player is still pushed out of the canopy footprint
instead of landing on it. They are also NOT raycast targets in camera mode:
clicking a tree does nothing, and clicking through a tree onto a prop behind
it picks the prop correctly. The forest is landscape, not interactive
geometry.

The forest re-rolls with each **R** press using its own RNG salt
(`seed ^ 0x7ee5`), independent of the terrain (`^ 0xa11ce`), pond
(`^ 0xb0a7`), and prop (global `rng`) streams — so adding trees does not
shift the per-seed output of any other system. The terrain mesh, pond, sky,
sun/moon discs, stars, fog, props, day/night cycle, and existing player
physics are unchanged except for: (1) `pushOutAxis` gets a second loop over
`trees`, and (2) the bootstrap and regen branches gain tree
generate/dispose calls.

## Acceptance Criteria

### Constants

1. Add module-scope constants near the existing world constants (next to
   the `POND_*` block):
   - `TREE_COUNT_MIN = 18`
   - `TREE_COUNT_RANGE = 15` — so count = `MIN + floor(rng() * RANGE)` ⇒
     18..32 inclusive
   - `TREE_TRUNK_RADIUS_MIN = 0.12`
   - `TREE_TRUNK_RADIUS_RANGE = 0.12` — range 0.12..0.24
   - `TREE_TRUNK_HEIGHT_MIN = 0.6`
   - `TREE_TRUNK_HEIGHT_RANGE = 1.0` — range 0.6..1.6
   - `TREE_FOLIAGE_RADIUS_MIN = 0.9`
   - `TREE_FOLIAGE_RADIUS_RANGE = 0.7` — range 0.9..1.6
   - `TREE_FOLIAGE_HEIGHT_MIN = 2.0`
   - `TREE_FOLIAGE_HEIGHT_RANGE = 2.0` — range 2.0..4.0
   - `TREE_SPAWN_EXCLUSION = 4.0` — keep-out radius around
     `(SPAWN_X, SPAWN_Z)` (tree center)
   - `TREE_POND_KEEPOUT = 6.5` — keep-out radius around
     `(pondCenterX, pondCenterZ)` (tree center). Same numeric value as
     `POND_PROP_KEEPOUT`; keep it as its own constant so future tuning
     stays local.
   - `TREE_PROP_BUFFER = 0.4` — extra padding added to the foliage radius
     when checking foliage-vs-prop circle-AABB overlap
   - `TREE_TREE_BUFFER = 0.4` — extra padding added between two tree
     canopies when checking foliage-vs-foliage circle-circle overlap
   - `TREE_PLACEMENT_HALF = 22.0` — `|x|, |z|` ≤ this for the tree center
     (keeps the full canopy + player-radius inflation inside the
     player-walkable region at `±HALF_EXTENT = 24.5`)
   - `TREE_RADIAL_SEGMENTS = 8` — radial segments for both the trunk
     cylinder and the foliage cone
   - `TREE_TRUNK_COLOR = new THREE.Color('#5C3A1E')` — shared dark brown
     for every trunk
   - `TREE_FOLIAGE_BASE_COLOR = new THREE.Color('#2F6B3A')` — average
     foliage hue (per-tree HSL variance is applied on top)
   - `TREE_FOLIAGE_HUE_VARIANCE = 0.025` — symmetric ± hue offset per tree
   - `TREE_FOLIAGE_LIGHT_VARIANCE = 0.05` — symmetric ± lightness offset
     per tree
   - `TREE_PLACEMENT_ATTEMPTS = 30`

### State

2. Add module-scope state alongside `props`:
   ```js
   const trees = [];
   ```
3. Add one shared trunk material at module scope, near the other
   materials (after `waterMaterial` and before the bootstrap block):
   ```js
   const trunkMaterial = new THREE.MeshStandardMaterial({
     color: TREE_TRUNK_COLOR,
     roughness: 0.9,
     metalness: 0.0,
   });
   ```
   This single material is reused by every tree's trunk mesh across all
   regenerations. Do NOT clone it per-tree.
4. Foliage materials are PER-TREE (each tree gets a slightly varied
   color), constructed inline in `generateTrees()`. Do NOT declare a
   shared foliage material at module scope.

### Tree placement function

5. Implement `function generateTrees()` near the existing `generate()`
   helper:
   ```js
   function generateTrees() {
     disposeTrees();
     const treeRng = mulberry32(seed ^ 0x7ee5);
     const targetCount = TREE_COUNT_MIN + Math.floor(treeRng() * TREE_COUNT_RANGE);
     const baseHsl = { h: 0, s: 0, l: 0 };
     TREE_FOLIAGE_BASE_COLOR.getHSL(baseHsl);
     for (let i = 0; i < targetCount; i++) {
       for (let attempt = 0; attempt < TREE_PLACEMENT_ATTEMPTS; attempt++) {
         const trunkRadius = TREE_TRUNK_RADIUS_MIN + treeRng() * TREE_TRUNK_RADIUS_RANGE;
         const trunkHeight = TREE_TRUNK_HEIGHT_MIN + treeRng() * TREE_TRUNK_HEIGHT_RANGE;
         const foliageRadius = TREE_FOLIAGE_RADIUS_MIN + treeRng() * TREE_FOLIAGE_RADIUS_RANGE;
         const foliageHeight = TREE_FOLIAGE_HEIGHT_MIN + treeRng() * TREE_FOLIAGE_HEIGHT_RANGE;
         const posX = -TREE_PLACEMENT_HALF + treeRng() * 2 * TREE_PLACEMENT_HALF;
         const posZ = -TREE_PLACEMENT_HALF + treeRng() * 2 * TREE_PLACEMENT_HALF;

         // spawn keep-out (tree center vs spawn point)
         const sdx = posX - SPAWN_X;
         const sdz = posZ - SPAWN_Z;
         if (sdx * sdx + sdz * sdz < TREE_SPAWN_EXCLUSION * TREE_SPAWN_EXCLUSION) continue;

         // pond keep-out (tree center vs pond center)
         const pdx = posX - pondCenterX;
         const pdz = posZ - pondCenterZ;
         if (pdx * pdx + pdz * pdz < TREE_POND_KEEPOUT * TREE_POND_KEEPOUT) continue;

         // prop overlap (foliage circle vs prop AABB, both inflated by buffer)
         let overlapsProp = false;
         const propClearance = foliageRadius + TREE_PROP_BUFFER;
         for (const p of props) {
           const cx = Math.max(p.aabb.minX, Math.min(posX, p.aabb.maxX));
           const cz = Math.max(p.aabb.minZ, Math.min(posZ, p.aabb.maxZ));
           const ddx = posX - cx;
           const ddz = posZ - cz;
           if (ddx * ddx + ddz * ddz < propClearance * propClearance) {
             overlapsProp = true;
             break;
           }
         }
         if (overlapsProp) continue;

         // tree-tree overlap (foliage circle vs existing foliage circle)
         let overlapsTree = false;
         for (const t of trees) {
           const ddx = posX - t.centerX;
           const ddz = posZ - t.centerZ;
           const r = foliageRadius + t.foliageRadius + TREE_TREE_BUFFER;
           if (ddx * ddx + ddz * ddz < r * r) {
             overlapsTree = true;
             break;
           }
         }
         if (overlapsTree) continue;

         // accepted — build meshes
         const baseY = heightAt(posX, posZ);

         const trunkGeom = new THREE.CylinderGeometry(
           trunkRadius, trunkRadius, trunkHeight, TREE_RADIAL_SEGMENTS,
         );
         const trunkMesh = new THREE.Mesh(trunkGeom, trunkMaterial);
         trunkMesh.position.set(posX, baseY + trunkHeight / 2, posZ);

         const hueShift = (treeRng() - 0.5) * 2 * TREE_FOLIAGE_HUE_VARIANCE;
         const lightShift = (treeRng() - 0.5) * 2 * TREE_FOLIAGE_LIGHT_VARIANCE;
         const foliageColor = new THREE.Color().setHSL(
           (baseHsl.h + hueShift + 1) % 1,
           baseHsl.s,
           Math.max(0, Math.min(1, baseHsl.l + lightShift)),
         );
         const foliageMaterial = new THREE.MeshStandardMaterial({
           color: foliageColor,
           roughness: 0.85,
           metalness: 0.0,
         });
         const foliageGeom = new THREE.ConeGeometry(
           foliageRadius, foliageHeight, TREE_RADIAL_SEGMENTS,
         );
         const foliageMesh = new THREE.Mesh(foliageGeom, foliageMaterial);
         foliageMesh.position.set(
           posX,
           baseY + trunkHeight + foliageHeight / 2,
           posZ,
         );

         scene.add(trunkMesh);
         scene.add(foliageMesh);
         trees.push({
           trunkMesh,
           foliageMesh,
           foliageMaterial,
           centerX: posX,
           centerZ: posZ,
           foliageRadius,
           aabb: {
             minX: posX - foliageRadius,
             maxX: posX + foliageRadius,
             minZ: posZ - foliageRadius,
             maxZ: posZ + foliageRadius,
             topY: Infinity,
           },
         });
         break;
       }
     }
   }
   ```

6. The tree RNG is `mulberry32(seed ^ 0x7ee5)`. The XOR constant is
   distinct from the terrain RNG (`^ 0xa11ce`), the pond RNG (`^ 0xb0a7`),
   and any consumer of the global `rng` (props), so tree placement does
   not perturb the determinism of the other systems for a given seed.

7. A tree that exhausts `TREE_PLACEMENT_ATTEMPTS` is silently skipped —
   the world simply has slightly fewer trees when placement is dense.
   This matches the prop behavior.

8. `tree.aabb.topY` is the JavaScript literal `Infinity` (not a magic
   number like `1e9`). The existing `pushOutAxis` check
   `feetY >= prop.aabb.topY - 0.01` evaluates correctly on `Infinity`:
   `Infinity - 0.01 === Infinity`, and `feetY >= Infinity` is always
   `false` for finite `feetY`, so the horizontal push-out always fires
   for trees regardless of player Y.

### Disposal function

9. Implement `function disposeTrees()` near `disposeProps()`:
   ```js
   function disposeTrees() {
     for (const tree of trees) {
       scene.remove(tree.trunkMesh);
       scene.remove(tree.foliageMesh);
       tree.trunkMesh.geometry.dispose();
       tree.foliageMesh.geometry.dispose();
       tree.foliageMaterial.dispose();
     }
     trees.length = 0;
   }
   ```
10. `disposeTrees` MUST NOT dispose `trunkMaterial` — it is shared across
    all trees and survives across regenerations. The per-tree
    `foliageMaterial` IS disposed.
11. `generateTrees()` calls `disposeTrees()` at its top (criterion 5), so
    callers do not need to dispose separately. This mirrors the existing
    pattern where `generate(seed)` calls `disposeProps()` internally.

### Bootstrap integration

12. At the existing bootstrap block, add a `generateTrees()` call AFTER
    the existing `generate(seed)` call (props must be placed first so
    tree-vs-prop overlap rejection can read `props[]`):
    ```js
    terrainMesh.geometry.dispose();
    terrainMesh.geometry = buildTerrainGeometry(seed);
    pondMesh = createPondMesh();
    scene.add(pondMesh);
    generate(seed);
    generateTrees();
    ```

### Regenerate integration

13. In the `if (regenerateRequested)` block in `animate()`, add a
    `generateTrees()` call AFTER `generate(seed)` (which auto-disposes
    props) and BEFORE `resetPlayerToSpawn()`:
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
      generateTrees();
      resetPlayerToSpawn();
      regenerateRequested = false;
    }
    ```
    Because `generateTrees()` auto-disposes via `disposeTrees()` at its
    top, no explicit dispose call is needed in the regen block.

### Collision integration

14. Modify `pushOutAxis(axis, dir)` to add a second `for` loop over
    `trees`, immediately AFTER the existing `for (const prop of props)`
    loop. Use the same body shape (inflated AABB rectangle test, axis-
    aligned push-out, same `PUSH_EPS`), but DROP the
    `feetY >= prop.aabb.topY - 0.01` short-circuit — for trees, that test
    is redundant (always `false` because `topY === Infinity`) and
    omitting it makes the tree-loop body slightly clearer:
    ```js
    for (const tree of trees) {
      const exMinX = tree.aabb.minX - PLAYER_RADIUS;
      const exMaxX = tree.aabb.maxX + PLAYER_RADIUS;
      const exMinZ = tree.aabb.minZ - PLAYER_RADIUS;
      const exMaxZ = tree.aabb.maxZ + PLAYER_RADIUS;
      const px = camera.position.x;
      const pz = camera.position.z;
      if (px <= exMinX || px >= exMaxX || pz <= exMinZ || pz >= exMaxZ) continue;
      if (axis === 'x') {
        if (dir > 0) camera.position.x = exMinX - PUSH_EPS;
        else camera.position.x = exMaxX + PUSH_EPS;
      } else {
        if (dir > 0) camera.position.z = exMinZ - PUSH_EPS;
        else camera.position.z = exMaxZ + PUSH_EPS;
      }
    }
    ```
15. `computeSupportY(x, z)` is NOT modified. Trees do NOT contribute to
    vertical support — the player cannot stand on a tree. Only the
    terrain heightmap and prop AABB tops are considered, exactly as
    today.
16. The world-bounds clamp (`Math.max(-HALF_EXTENT, ...)` /
    `Math.min(..., HALF_EXTENT)`) is unchanged. With
    `TREE_PLACEMENT_HALF = 22.0` and max foliage radius 1.6, the
    inflated tree AABB extends at most to `22.0 + 1.6 + PLAYER_RADIUS =
    23.9`, comfortably inside `HALF_EXTENT = 24.5`. The player can
    always navigate around any tree without getting pinched against the
    world wall.

### Raycast / camera mode

17. The existing camera-mode raycast uses
    `raycaster.intersectObjects(props.map((p) => p.mesh))` — props only.
    Do NOT add tree trunk or foliage meshes to this list. Clicking
    through a tree onto a prop behind it picks the prop correctly.
    Clicking a tree mesh itself does nothing (no info card, no console
    error).
18. Trees are added directly to `scene` (not tracked in `props[]`).
    Therefore `disposeProps()`, the per-frame highlight tick, and the
    `props.map((p) => p.mesh)` raycast list all ignore them without
    modification.

### No other changes

19. The terrain mesh / material, sky dome, sky shader, sun disc, moon
    disc, stars, ambient / directional lights, fog, water material,
    water mesh, prop placement / overlap / disposal, day/night logic,
    FOV / zoom / info-card logic, lock-overlay HTML, crosshair, camera
    indicator, and all keybind handlers are unchanged.
20. `HALF_EXTENT`, `SPAWN_X`, `SPAWN_Z`, `SPAWN_EXCLUSION_RADIUS`,
    terrain constants, fog constants, pond constants, and all
    camera/movement constants are unchanged.
21. The lock-overlay copy ("WASD / arrows to move…") is NOT updated to
    mention the forest. The forest is a passive landscape feature; no
    new keybind is added.
22. No new dependencies. Three.js stays at the pinned
    `https://unpkg.com/three@0.160.0/...` version. All edits live in
    `index.html`. No new files. No README changes.

### Manual verification

23. Load the page. Browser devtools console shows no errors and no
    warnings on first render or after pressing **R**.
24. Look around at spawn. Multiple low-poly conifer trees (cylinder
    trunk + cone canopy) are visible scattered across the terrain. None
    overlap the spawn pocket — the player can rotate 360° at spawn
    without a tree clipping into the camera near plane.
25. Walk straight into a tree (any direction). The player is bumped
    and stops at the canopy's outer edge — NOT at the trunk surface.
    The trunk is well inside the foliage radius and is visible past
    the player's collision footprint.
26. Slide along the side of a tree (move tangentially into the
    canopy). The player traces the inflated AABB edge cleanly with no
    jitter, sticking, or oscillation.
27. Try to walk diagonally through a small gap between two adjacent
    trees. If the gap is wider than `2 × PLAYER_RADIUS = 0.6 m`, the
    player passes through. If narrower, the player is stopped — never
    "squeezed" through.
28. Jump (Space) next to a tree on flat ground. The player reaches a
    peak ~1.1 m above their feet and lands on the surrounding terrain
    (NOT on the canopy). The horizontal push-out fires throughout the
    jump arc.
29. Climb on top of a tall box prop (jump onto a box ≥ 1.5 m tall),
    then sprint-jump from the box top toward an adjacent tree. Even
    though `feetY` mid-jump can exceed a short tree's apex, the player
    is still pushed horizontally out of the tree's AABB — they never
    land on the canopy. They fall to the terrain beside the tree.
30. Press **R** several times (≥ 5). Each regeneration scatters a new
    tree layout:
    - No tree appears inside the pond bowl or with its canopy hanging
      over the water disc.
    - No tree overlaps a prop's AABB (no canopy clipping into a box
      side or a cylinder).
    - No two trees have interpenetrating canopies (visible "double
      cone" through-clipping).
    - The spawn pocket stays clear in every regeneration.
31. Walk across hilly terrain past a line of trees. Each tree's trunk
    base sits flush with the terrain at its center — no obviously
    floating tree, no buried trunk visible only by its canopy. Trees
    on uphill / downhill slopes follow the heightmap.
32. Watch through one full day cycle (60 s) standing among trees.
    Foliage on the sun-facing side reads brighter than the shaded
    side. At dusk, sun-side foliage warms; at night, all trees darken
    to ambient. Trunks read distinctly dark brown against the
    foliage. Foliage color varies subtly tree-to-tree (no two
    adjacent canopies look identical).
33. Stand at spawn at noon. Distant trees near the world edge fade
    with fog the same way distant props do — no pop-in at the tree's
    bounding sphere, no fog seam at the canopy edge.
34. Toggle **C** (camera mode), aim at a prop visible BEHIND a tree
    (across the canopy from the player), zoom in (mouse wheel), and
    click. The info card displays for the prop — the raycast passes
    through both trunk and foliage without picking them.
35. Toggle camera mode and click directly on a tree trunk or foliage.
    Nothing happens — no info card, no console error.
36. Walk to the pond and look back across the water at the surrounding
    landscape. No tree's trunk or canopy intrudes into the visible
    water disc area.
37. Stand at the world edge (walk to `|x| = HALF_EXTENT` or
    `|z| = HALF_EXTENT`). No tree's canopy extends past the world
    wall, and the player is never pinched between a tree and the
    boundary clamp.
38. With the full forest visible (look from spawn across the world),
    framerate remains smooth (≥ 50 fps on a typical laptop). No
    shader-compile warnings appear in the console on the first
    regenerate after page load.

## Out of Scope

- Multiple tree species (deciduous broadleaf, palm, dead trunk, stump,
  bush). All trees are conifer-style: cylinder trunk + single cone
  canopy.
- Multi-cone "stacked Christmas-tree" canopies (2-3 concentric cones of
  decreasing radius). Single cone per tree.
- Trees casting shadows. The renderer has no shadow maps; this spec
  does not enable them.
- Wind sway / animated foliage / per-vertex displacement on canopies.
  Trees are static geometry.
- Falling leaves, particle effects, fireflies tied to trees.
- Footstep crunch / leaves rustle / forest ambience. No audio.
- Climbing trees. The player cannot land on or scale the canopy. No
  jump boost from tree tops.
- Trees as raycast targets. The camera-mode info card is unaffected —
  trees are not inspectable. No per-tree name / dimensions / species
  readout.
- Replacing existing props with trees, or making props inherit tree
  placement constraints. Trees and props coexist; both are placed
  every regen.
- Texture mapping on trunks or foliage (bark texture, leaf texture,
  needle texture). Plain `MeshStandardMaterial` colors only.
- Adjusting camera near / far, FOV, or fog tuning to accommodate the
  forest.
- LOD / instanced rendering / billboard impostors. ~25 trees × 2 small
  meshes is well within Three.js budget; no batching needed.
- Trees in the water (mangroves), trees on bare steep slopes, trees
  clustered into biomes / forest patches. Placement is uniform random
  with rejection.
- Tilting trees to local slope. Trees are upright, like props.
- Procedural pruning (cones missing branches, asymmetric canopies).
  Every cone is a clean `ConeGeometry`.
- Updating the lock-overlay copy, README, or any HUD text to mention
  the forest.
- Automated tests / Playwright / visual regression. Verification stays
  manual per the existing project pattern.
- Autumn / winter / dead palettes (orange, snow-tipped, leafless).
  Foliage color stays in a tight green band via the small HSL
  variance.
- Trees affecting the day/night lighting calculations (e.g., dappled
  shadows, ambient occlusion under canopy).
- Performance instrumentation. The added cost is ~25 × (8-segment
  cone + 8-segment cylinder) ≈ 1.5 k triangles, plus one extra
  `pushOutAxis` for-loop body of ~25 iterations. No measurement
  needed.

## Design Notes

- **Why conifer-only (cone-on-cylinder)**: a single primitive shape per
  part keeps the geometry trivial (~64 triangles per tree at 8 radial
  segments, ~1.5 k total for 25 trees) and avoids prescribing a
  per-species variation system. The conifer silhouette is unambiguous
  at any view distance — leaves no doubt the things are trees and not
  another procedural prop. Other species can be added in a follow-up.
- **Why foliage radius drives collision instead of trunk radius**: with
  a thin trunk (≤ 0.24 m radius) and a wide canopy (up to 1.6 m
  radius), trunk-only collision would let the player walk through up
  to ~1.4 m of solid-looking foliage at head height before bumping the
  trunk. That reads broken. Using the foliage circle as the collision
  footprint makes the player walk around the tree's visible silhouette
  — which is what the brain expects.
- **Why `aabb.topY = Infinity`**: the player's max reachable `feetY`
  from terrain is ~1.1 m (jump apex from ground). From the tallest
  box prop (~1.9 m), feet can briefly exceed 3 m. The shortest tree's
  apex is `0.6 + 2.0 = 2.6 m`. In that narrow window, a sprint-jump
  off a tall prop could carry feet above a short tree's top — and the
  existing `feetY >= aabb.topY - 0.01` check in `pushOutAxis` would
  skip horizontal push-out, letting the player fly through the
  canopy. Setting `topY = Infinity` removes that edge case entirely:
  trees are always solid horizontally, regardless of the player's Y.
  And because trees are NOT in `computeSupportY`, the `Infinity` value
  is never read as a support height — so the player can't land on top
  of a tree either.
- **Why a separate `trees[]` array (not merged into `props[]`)**:
  `props[]` drives four separate per-frame operations: the raycast
  list, `disposeProps`, the support contribution in `computeSupportY`,
  and the highlight tick. Trees should be excluded from all four. A
  separate array makes that exclusion explicit at every iteration site
  rather than requiring per-record flags or "is-this-a-tree" tests.
- **Why `trunkMaterial` is shared but each tree gets its own
  `foliageMaterial`**: in real-world tree variation, canopy color
  dominates over trunk color at typical viewing distance. Sharing the
  trunk material saves ~25 material allocations per regen with zero
  visual cost. Foliage gets a small per-tree HSL shift (±0.025 hue,
  ±0.05 lightness) so the forest doesn't read as obviously uniform.
- **Why `TREE_PLACEMENT_HALF = 22.0`**: tree center max `|x| / |z| =
  22.0`, plus max foliage radius 1.6, plus `PLAYER_RADIUS = 0.3` gives
  an inflated AABB edge at 23.9 — comfortably inside the player clamp
  at `HALF_EXTENT = 24.5`. The 0.6 m margin prevents the inflated AABB
  from ever butting against the world wall (which would cause the
  player to be pinched between the canopy and the boundary clamp).
- **Why `TREE_SPAWN_EXCLUSION = 4.0`**: spawn is at `(0, 5)` with eye
  height 1.6 m. With a 4 m keep-out (tree center to spawn point), the
  closest a canopy's outer edge can come is
  `4 − foliageRadius_max = 2.4 m` — clear of the spawn camera's near
  plane and visible field. Smaller values risk a tree clipping the
  camera on first frame.
- **Why `TREE_POND_KEEPOUT = 6.5` (the same number as
  `POND_PROP_KEEPOUT`)**: the bowl radius is 5 m; a 6.5 m keep-out
  clears the bowl plus a 1.5 m buffer that accommodates the foliage
  radius. Reusing the numeric value signals that trees and props share
  the same "don't intrude on the pond" intent. Kept as a distinct
  constant so tuning the pond's prop and tree exclusions
  independently stays trivial.
- **Why prop overlap is "circle vs inflated AABB"**: the tree's
  collision footprint is circular (foliage radius), while props are
  axis-aligned rectangles. Clamping the tree center to the prop AABB
  and comparing squared distance is the cheapest exact circle-vs-AABB
  test — matches how the spawn-vs-prop exclusion in `generate()`
  already works, so the codebase reads consistently.
- **Why tree-tree overlap is "circle vs circle"**: both footprints are
  circles. Circle-vs-circle is exact at this geometry and slightly
  more permissive than AABB-vs-AABB at the same nominal radius, so
  trees pack a touch tighter without visible canopy interpenetration.
- **Why a separate RNG salt `seed ^ 0x7ee5`**: keeps tree placement
  statistically independent of the terrain (`^ 0xa11ce`), pond
  (`^ 0xb0a7`), and prop (the global `rng`) streams. Adding the
  forest does not shift any other system's per-seed output, so prior
  manual verifications for terrain / pond / props remain reproducible
  for the same seed.
- **Why `TREE_RADIAL_SEGMENTS = 8`**: gives a faceted, "low-poly"
  silhouette that matches the scene's overall aesthetic (the existing
  props use 16-segment cylinders, but trees are background scenery
  and benefit from a noticeably coarser look). At 8 segments, cones
  still read as recognizable cones from any distance the fog allows.
- **Why no per-tree raycast / info card**: the info card affords
  "what is this random procedural shape?" inspection — but trees are
  a known, named, uniform category. Adding them to the raycast
  would also block prop clicks behind them, breaking the read of
  criterion 34.
- **Why `generateTrees()` runs AFTER `generate(seed)` at both
  bootstrap and regen**: tree placement reads `props[]` to reject
  canopy-vs-prop overlap. Placing trees first would mean props could
  later land on top of trees, which is the wrong precedence — props
  are the primary feature; trees fill the rest of the scene.
- **Why foliage uses `MeshStandardMaterial` (not `MeshBasicMaterial`
  or unlit)**: foliage looks flat and cardboardy under the day/night
  sun without normal-aware shading. Standard material gives proper
  diffuse falloff on the sun-facing vs shaded side of the cone, which
  is what makes the forest read as 3D rather than as a cluster of
  painted flat shapes.
- **Why `generateTrees()` self-disposes (calls `disposeTrees` at top)
  rather than the caller disposing first**: mirrors the `generate(seed)`
  pattern (which calls `disposeProps()` internally), so the bootstrap
  and regen blocks read symmetrically. The trade-off is that bootstrap
  pays a no-op `disposeTrees()` call on an empty array — negligible
  cost, and the symmetry is worth more than the saved iteration.

## Agent Notes

- All edits in this worktree per `AGENTS.md` / `CLAUDE.md`. Single-file
  change to `index.html`.
- Implementation order suggestion:
  1. Add the new `TREE_*` constants block near the existing `POND_*`
     constants.
  2. Add `const trees = [];` alongside `const props = [];`.
  3. Add `trunkMaterial` near `waterMaterial`.
  4. Implement `disposeTrees()` near `disposeProps()`.
  5. Implement `generateTrees()` near `generate()`.
  6. In the bootstrap initialization block, add `generateTrees();`
     after the existing `generate(seed);` call.
  7. In the `if (regenerateRequested)` block inside `animate()`, add
     `generateTrees();` after the `generate(seed);` call and before
     `resetPlayerToSpawn();`.
  8. In `pushOutAxis(axis, dir)`, add the second `for` loop over
     `trees` immediately after the existing `for (const prop of props)`
     loop. Drop the `feetY >= aabb.topY - 0.01` short-circuit in the
     tree loop (it would always be `false` and obscures intent).
- Watch for these pitfalls:
  - `trunkMaterial` is SHARED across all trees. Do NOT clone it
    per-tree. Do NOT dispose it in `disposeTrees()` — it survives
    across regenerations, same pattern as `waterMaterial`.
  - Each tree's `foliageMaterial` IS per-tree (so the HSL shift is
    unique). Disposal MUST dispose it — store the reference on the
    tree record explicitly (`tree.foliageMaterial`).
  - The trunk and foliage are TWO separate meshes added to the scene,
    NOT wrapped in a `THREE.Group`. A group would also work but adds
    an extra `Object3D` per tree for no benefit — there is no shared
    rotation/scale, and the positions are already absolute.
  - `tree.aabb.topY` must be the JavaScript literal `Infinity`, not a
    placeholder like `1e9`. The existing `pushOutAxis` check
    `feetY >= prop.aabb.topY - 0.01` evaluates correctly on `Infinity`
    (subtraction with a finite operand yields `Infinity`, and
    `finite >= Infinity` is `false`), so the horizontal push-out
    always fires for trees. A finite sentinel like `1e9` would also
    work but is less self-documenting.
  - The tree `aabb` field shape MUST match props' (`minX`, `maxX`,
    `minZ`, `maxZ`, `topY`). The new for-loop in `pushOutAxis` reuses
    the same field names; a mismatch would silently break collision.
  - Do NOT add trees to `props[]`. The raycast list, `computeSupportY`,
    `disposeProps`, and the per-frame highlight tick all iterate
    `props` — trees must NOT appear there. The whole reason for the
    separate `trees[]` array is to keep those four sites unchanged.
  - `generateTrees()` uses a dedicated `treeRng = mulberry32(seed ^
    0x7ee5)`. Do NOT consume from the global `rng` (which `generate()`
    uses for props); doing so would shift the prop layout for a
    given seed and break the determinism contract.
  - Call `generateTrees()` AFTER `generate(seed)` at both bootstrap
    and regen, so `props[]` is populated when tree-vs-prop overlap is
    checked.
  - `THREE.ConeGeometry(radius, height, radialSegments)` builds a
    cone with its apex at `+y/2` (in local space) and its base at
    `−y/2`. The geometry is already vertical — no rotation needed.
    Position the cone's CENTER at
    `baseY + trunkHeight + foliageHeight / 2`, so the base of the
    cone sits exactly at the trunk top.
  - `THREE.CylinderGeometry(radiusTop, radiusBottom, height,
    radialSegments)` — pass `trunkRadius` for both top and bottom for
    a cylinder (not a frustum). Position the cylinder's CENTER at
    `baseY + trunkHeight / 2`.
  - HSL shift code: `THREE.Color#getHSL(target)` writes into the
    target's `{h, s, l}` and returns it. To avoid mutating the shared
    `TREE_FOLIAGE_BASE_COLOR`, call `getHSL` ONCE outside the
    placement loop and read the cached `baseHsl` per tree (the
    `generateTrees()` snippet in criterion 5 does this — keep that
    structure).
  - Hue wrap: `(baseHsl.h + hueShift + 1) % 1` ensures the hue stays
    in `[0, 1)` even when `hueShift` is negative.
  - Lightness clamp: `Math.max(0, Math.min(1, baseHsl.l + lightShift))`
    keeps the per-tree lightness in `[0, 1]` to avoid `setHSL`
    boundary-clamping surprises.
  - Do NOT set `material.fog = false` on either trunk or foliage.
    Both use plain `MeshStandardMaterial`, which respects `scene.fog`
    by default — distant trees fade with the rest of the scene
    (criterion 33).
  - Tree placement reads `pondCenterX` / `pondCenterZ`. These are
    set by `placePond()` inside `buildTerrainGeometry()`, which runs
    BEFORE `generate(seed)` at both bootstrap and regen — so by the
    time `generateTrees()` runs, the pond center is correct.
- Test locally with `python3 -m http.server 8000` from the worktree
  root. Walk through criteria 23–38. Press R at least 5 times to
  confirm tree distribution varies and that none of the overlap
  rules are violated. Pay particular attention to:
  - Criteria 25 / 26 / 27 (horizontal collision behaves correctly).
  - Criterion 29 (the `topY = Infinity` edge case — sprint-jump off
    a tall box toward a short tree).
  - Criterion 30 (full overlap matrix: pond / prop / tree-tree /
    spawn).
  - Criterion 34 (raycast passes through trees onto props behind).
  - Open devtools and confirm no shader-compile warnings on the
    first regenerate (criterion 38).
