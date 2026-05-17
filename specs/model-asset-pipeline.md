---
id: model-asset-pipeline
area: frontend
priority: 60
depends_on: []
description: Introduce a build-free glTF asset pipeline and replace the procedural random props with curated CC0 model assets
---

# Model Asset Pipeline (replace procedural props with 3D assets)

## Goal

Move the explorer away from procedurally-generated primitive props toward
curated, free 3D model assets without adding a build step. This spec delivers
the reusable loading/caching/normalization/fallback infrastructure and proves
it by replacing the random `props` objects (the Box/Sphere/Cylinder/Cone
shapes created in `generate()`) with low-poly GLB models. It is the foundation
the wildlife catalog spec builds on.

## Acceptance Criteria

1. **Committed assets.** A new `assets/models/` directory contains **at least 4
   distinct** low-poly `.glb` prop models (e.g. rock, log, mushroom, stump,
   boulder, crystal cluster). Files are committed to the repo (served
   same-origin by GitHub Pages — no runtime CDN, no CORS). Total added binary
   weight is kept reasonable (target < ~3 MB combined; prefer uncompressed
   low-poly GLB — **no DRACO/Meshopt** so no extra decoders are needed).
2. **Provenance.** `assets/CREDITS.md` lists, for every committed asset: file
   name, title, author, source URL, and license. Every asset is **CC0 /
   public domain**, or CC-BY *with* the required attribution recorded in that
   file. No asset with an unverified or non-free license is committed.
3. **Loader module.** A build-free model module (inline in `index.html`,
   consistent with the existing single-file style) uses `GLTFLoader` imported
   via the existing importmap (`three/addons/loaders/GLTFLoader.js`). All prop
   models are fetched **once at startup** and the parsed result is cached;
   subsequent uses clone from the cache rather than refetching.
4. **Gated start + fallback.** The existing "Click to play" lock overlay does
   not allow the session to start until asset preloading has resolved. The
   overlay shows simple loading status/progress text. If any model fails to
   load, a console warning is logged and that prop falls back to a procedural
   primitive so the scene remains fully playable offline / on asset failure.
5. **Props use models.** `generate(newSeed)` no longer creates
   Box/Sphere/Cylinder/Cone meshes for props; it places cloned instances of
   the loaded models instead. All existing placement constraints still hold:
   spawn-exclusion radius, pond keep-out, prop-vs-prop overlap rejection, and
   the tree/target clearance buffers that read `prop.aabb`.
6. **Normalization.** Each placed instance is scaled to a sensible target
   footprint via `THREE.Box3().setFromObject(...)`, grounded on the terrain
   using `heightAt(x, z)`, and given a random Y rotation. `prop.aabb` is
   recomputed from the normalized world bounds and keeps the existing
   `{ minX, maxX, minZ, maxZ, topY }` shape so `computeSupportY()` and
   `pushOutAxis()` keep working **unchanged**.
7. **Capture works.** Photo capture still identifies props. Raycasting is made
   recursive over model child meshes, and a hit child resolves back to its
   owning prop (via `userData` tagging on the instance root and/or a parent
   walk). Both capture call sites are updated: `performCapture()` and the
   in-`animate()` capture path. The info card shows the model's name plus a
   short flavor/category line (it no longer shows shape/dims/roughness/
   metalness/texture).
8. **Highlight works.** The capture highlight pulse is applied across **all**
   child mesh materials of the hit prop and decays over `HIGHLIGHT_DURATION`
   as before. Per-instance materials are cloned so one prop's highlight does
   not bleed into other instances of the same model.
9. **Clean lifecycle.** `disposeProps()` disposes per-instance clones (geometry
   + materials it owns) **without** disposing the shared cached source.
   Pressing **R** to regenerate works repeatedly with no memory growth, no
   refetching of assets, and no console errors. The site still runs by serving
   the repo root with a static server; desktop pointer-lock and the existing
   mobile touch flow both still work.

## Out of Scope

- Wildlife / animals — handled by `wildlife-catalog`.
- Replacing trees, terrain, the pond, or the 5 catalog target crystals (they
  remain procedural / unchanged).
- Animation clips / `AnimationMixer`, skeletal rigs, creature behavior.
- DRACO/Meshopt compression, external CDN model hosting, any build/bundling
  step or new npm runtime dependency.

## Design Notes

- **Single-file constraint still holds.** "Build-free" means no build step, not
  literally one file. Binary GLBs must be separate files; an `assets/`
  directory is fine and stays statically hostable on GitHub Pages.
- **Key code paths** (`index.html`):
  - Importmap: lines ~348–354 (`three`, `three/addons/`).
  - `props[]` array (~1167); `generate(newSeed)` (~1344) builds the
    procedural props; `disposeProps()` (~1238) tears them down assuming a
    single `THREE.Mesh` with `.geometry`/`.material.map`/`.material`.
  - Capture: `performCapture()` (~838) and the animate-loop capture branch
    (~1831) build `hittables` from `props.map(p => p.mesh)` and map back with
    `props.find(p => p.mesh === hitMesh)` — this exact-mesh equality breaks for
    glTF `Group`s, hence the recursive-raycast + `userData` mapping requirement.
  - Highlight decay loop (~1844) sets `prop.mesh.material.emissiveIntensity`.
  - Collision: `computeSupportY()` (~1692) and `pushOutAxis()` (~1707) read
    `prop.aabb`; `heightAt(x, z)` (~1270) gives ground height.
  - Info card: `showInfoCard(info)` (~706) currently formats shape/dims/etc.
  - Startup sequence: `generate(seed); generateTrees(); generateTargets();`
    (~1757) then `animate()` (~1952); the **R** regen path is inside
    `animate()` (~1805). Asset preloading must complete (or fall back) before
    the first `generate()` runs and before the overlay enables start.
- glTF assets load as a `THREE.Group`/scene graph. Cache the loaded
  `gltf.scene` per model; create instances with `.clone(true)` (static meshes
  — no skinning involved). Clone materials per instance so emissive highlight
  state is isolated. Tag the instance root, e.g. `root.userData.propRef`, and
  walk `object.parent` from a raycast hit to find it.
- Normalize scale by measuring `Box3` of a fresh clone and applying a uniform
  scale to reach a target max horizontal extent; recompute the world AABB
  after positioning/rotation for `prop.aabb`.

## Agent Notes

- **Sandbox network is restricted.** The implementing agent can reach
  `github.com` and the npm registries, but **not** arbitrary asset sites
  (poly.pizza, kenney.nl, quaternius.com directly). Source CC0/public-domain
  GLBs from GitHub-hosted repositories (e.g. `KhronosGroup/glTF-Sample-Assets`)
  or npm packages that redistribute CC0 low-poly nature assets. Always verify
  and record the license in `assets/CREDITS.md`; if a desired source is
  unreachable from the sandbox, pick another reachable CC0 source rather than
  guessing.
- Read `generate()`, `performCapture()`, the animate-loop capture branch,
  `disposeProps()`, and the collision helpers before editing.
- There are **no automated verify gates** configured (`.spec.toml` has none).
  Smoke-test manually: serve with `python3 -m http.server`, confirm the
  loading overlay gates start, props render as models, walking collides with
  them, photographing one shows its info card and highlight, **R** regenerates
  repeatedly, and the browser console stays clean. Verify the procedural
  fallback by temporarily pointing a model path at a missing file.
- Keep diffs additive and consistent with the existing inline-module code
  style; do not introduce a bundler or framework.
