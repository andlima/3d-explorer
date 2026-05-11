---
id: catalog-targets
area: frontend
priority: 50
depends_on: [camera-mode-aim-shoot, random-terrain-elevation, water-pond, procedural-trees]
description: Add a small set of glowing target artifacts the player photographs in camera mode to fill a catalog counter
---

# Catalog Targets

## Goal

Place a small fixed number of distinctive glowing artifacts in the scene that the
player discovers and "captures" by photographing them in camera mode. This gives
the world a light exploration objective on top of the existing wander loop, while
reusing the camera-mode aim/shoot mechanic already in place.

## Acceptance Criteria

1. On world generation (initial load and after R), exactly `TARGET_COUNT = 5`
   target artifacts are placed at seeded random positions on the terrain.
2. Targets are visually distinct from regular props: they self-illuminate (do
   not rely on the sun) so they read as glowing day or night, and use a shape
   and palette that doesn't collide with regular props (e.g. a small octahedron
   or floating icosahedron with a saturated hue and emissive material).
3. Targets gently animate (e.g. slow bob and/or rotation) so they catch the eye
   from a distance. Animation amplitude must be small enough that the targets
   stay clearly inside their hover zone — they do not visibly intersect the
   terrain or props.
4. Targets are placed using the same seeded RNG used for terrain/props/trees,
   so a given seed produces the same target layout every time.
5. Target placement respects existing keep-out rules: outside the spawn
   exclusion radius, outside the pond keep-out, and not overlapping props or
   trees. If a slot can't be found within a bounded number of attempts, fewer
   targets may be placed — but the catalog counter denominator must still
   reflect the number actually placed (the displayed denominator equals the
   number successfully placed for that seed).
6. In camera mode (C), aiming the crosshair at a target and left-clicking
   "captures" it. The existing prop-info card flow continues to work for
   regular props; targets take precedence when both are under the crosshair
   (closest hit wins, which the raycaster already handles when targets are
   included in the intersect list).
7. On capture, the target visibly changes state: its emissive glow turns off
   (or drops to a low residual) and its bob/rotation stops, so captured
   targets are still visible in the world but clearly "done." Re-clicking a
   captured target does nothing (no double-count, no toast).
8. A persistent HUD counter shows `Captured N / TOTAL` in a corner that does
   not collide with the existing `#cam-indicator` (top-left) or `#info-card`
   (bottom-center). Suggested location: top-right. The counter is visible
   whenever the world is loaded (not only in camera mode).
9. On each successful capture, a brief toast appears (~2.5s, matching the
   existing info-card duration) showing the target's catalog entry (e.g. name
   and a short flavor line — pulled from a fixed in-file list keyed by index).
   The toast may reuse the existing `#info-card` element or a sibling element;
   either is acceptable as long as it does not permanently break the
   regular-prop info card.
10. Pressing R regenerates the world including targets and resets the counter
    to `0 / TOTAL_FOR_NEW_SEED`. No state persists across regenerations.

## Out of Scope

- Persisting catalog progress across page reloads or R presses.
- A full catalog panel listing all entries with silhouettes for un-captured
  targets. Counter + per-capture toast only.
- Sound effects on capture.
- Moving / wandering targets. Targets are stationary apart from the small
  bob/rotation animation.
- Hidden targets that require hunting in nooks. Targets are visible at a
  distance by design (the glow ensures this).
- Difficulty modes, time limits, or scoring.
- Hint UI ("3 targets remain to the north"). Discovery is by exploration.

## Design Notes

- Single-file project: all changes go in `index.html` alongside the existing
  scene/props/trees/water code.
- Keep the new constants together at the top of the script (matching the
  pattern of `TREE_*`, `POND_*`, etc.): e.g. `TARGET_COUNT`, `TARGET_HOVER_Y`,
  `TARGET_RADIUS`, `TARGET_BOB_AMPLITUDE`, `TARGET_BOB_FREQUENCY`,
  `TARGET_SPAWN_EXCLUSION`, `TARGET_POND_KEEPOUT`, `TARGET_PROP_BUFFER`,
  `TARGET_TREE_BUFFER`, `TARGET_PLACEMENT_HALF`, `TARGET_PLACEMENT_ATTEMPTS`.
- Use a self-illuminated material so glow is independent of sun direction.
  Either `MeshBasicMaterial` (cheapest, ignores lighting) or
  `MeshStandardMaterial` with high `emissive` + `emissiveIntensity`. Either
  is fine; pick one and be consistent.
- Hover them slightly above the terrain (e.g. `heightAt(x, z) + TARGET_HOVER_Y`)
  so they read as "special" and don't get visually buried by terrain noise.
- Reuse `mulberry32` with a derived seed (e.g. `seed ^ 0x7a76`) — matches the
  per-feature seed-mixing pattern used by `placePond`, `buildTerrainGeometry`,
  and `generateTrees`.
- Placement loop should follow the same shape as `generateTrees`: attempt
  loop, reject on spawn exclusion / pond keep-out / prop overlap / tree
  overlap / other-target overlap, give up after N attempts per slot.
- Capture detection plugs into the existing `mousedown` handler in camera
  mode. Add targets to the raycaster's intersect list (or run a second
  raycast against them) and resolve closest-hit before deciding whether it's
  a target capture or a regular prop info-card show.
- Provide a small fixed catalog of entries (name + one-line flavor text) of
  length `TARGET_COUNT`, indexed by the order targets were placed. This keeps
  per-target identity stable for a given seed without needing per-target
  random naming.
- For cleanup on regenerate, follow the `disposeProps` / `disposeTrees`
  pattern: a `disposeTargets()` that removes meshes from the scene and
  disposes geometries/materials, then a `generateTargets()` after the
  terrain/pond/props/trees are rebuilt.
- The HUD counter should be a new DOM element styled like `#cam-indicator`
  but positioned top-right. Update its text whenever capture state changes
  (and once at world-generation time).

## Agent Notes

- Read `AGENTS.md` and `CLAUDE.md` first. All edits must happen in this
  worktree.
- Read the existing `mousedown` handler, `generate`, `generateTrees`,
  `placePond`, and the HUD elements (`#cam-indicator`, `#info-card`) in
  `index.html` before adding the target system — the new code should follow
  the same conventions.
- Order of operations inside the regenerate path matters: terrain → pond →
  props → trees → targets. Targets need the final `heightAt` so they hover
  consistently, and need props/trees populated so overlap checks work.
- Test plan: load the page, confirm the counter shows `0 / 5` (or whatever
  the actual placed count is), confirm targets glow day and night (let the
  day/night cycle run or briefly speed it up to verify), enter camera mode,
  capture one target, confirm the counter increments and the toast appears,
  confirm the captured target loses its glow and stops animating, press R
  and confirm the counter resets and a new layout appears.
- Keep the change additive: do not regress the existing prop info-card path,
  the day/night cycle, fog, water animation, or movement/collision.
