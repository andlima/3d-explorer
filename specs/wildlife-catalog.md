---
id: wildlife-catalog
area: frontend
priority: 50
depends_on: [model-asset-pipeline]
description: Add static CC0 wildlife model creatures as new photo-catalog capture targets
---

# Wildlife Catalog (static creature capture targets)

## Goal

Populate the world with recognizable wildlife — placed, static low-poly CC0
animal models — and make them photographable catalog entries alongside the
existing crystal targets. This builds directly on the asset pipeline from
`model-asset-pipeline`; it reuses that loader/cache/fallback infrastructure
and adds creatures as a new, parallel category of capture target.

## Acceptance Criteria

1. **Committed assets.** At least **4 distinct** low-poly animal `.glb` models
   (e.g. deer, fox, bird, rabbit, frog, fish) are committed under
   `assets/models/` (a `wildlife/` subfolder is fine). `assets/CREDITS.md` is
   extended with each file's title, author, source URL, and license. All
   assets are **CC0 / public domain** (or CC-BY with attribution recorded).
2. **Reuses the pipeline.** Animal models are preloaded and cached through the
   existing `model-asset-pipeline` loader, gated by the same loading overlay,
   with the same procedural/placeholder fallback on load failure. No second,
   parallel asset-loading mechanism is introduced.
3. **Creature catalog.** A creature catalog data structure (analogous to the
   existing `TARGET_CATALOG`) defines each species: display name, flavor/lore
   text, model key, and rarity/weight. A `generateCreatures()` routine places
   creatures deterministically from the world seed (use a seed-derived RNG as
   `generateTargets()` does with `mulberry32(seed ^ ...)`), grounding each on
   the terrain via `heightAt(x, z)` and honoring spawn-exclusion, pond
   keep-out, and prop/tree/existing-target clearance.
4. **Capturable.** Creatures integrate into the photo-capture flow: recursive
   raycast over the model's child meshes, mapping a hit child back to the
   creature (same `userData`/parent-walk approach as the prop pipeline). A
   correctly framed capture (`isTargetFramed`) marks the creature captured,
   shows its lore via `showTargetToast`, and updates a creature counter;
   recapturing an already-captured creature is a no-op. An out-of-frame shot
   triggers the existing failure feedback.
5. **Counter UI.** The HUD shows creature capture progress distinctly from the
   crystal counter (e.g. a separate "Creatures X / Y" line, or a clearly
   delineated extension of `updateCatalogCounter()`), so the two catalogs are
   not conflated.
6. **Deterministic regen + clean lifecycle.** Pressing **R** regenerates
   creature placement deterministically from the new seed, disposes previous
   creature instances without disposing the shared cached source, refetches
   nothing, leaks nothing, and logs no console errors.
7. **Static only.** Creatures are placed static models. A subtle non-AI idle
   bob/rotation (consistent with how target crystals already bob via
   `baseY`/`phase`) is acceptable but not required. No locomotion, pathing,
   flee/AI behavior, or skeletal animation.
8. **Compatibility.** No build step; runs by serving the repo root statically;
   desktop pointer-lock and the existing mobile touch flow both work; existing
   props, trees, terrain, pond, and crystal targets are unaffected; mobile
   performance stays acceptable (cloned cached instances, normalized scale,
   no per-frame allocation in the creature update path).

## Out of Scope

- Skeletal animation / `AnimationMixer`, walk cycles, idle animation clips.
- Wandering, flocking, flee-from-player, or any creature AI/locomotion.
- Sound / ambience.
- Building or altering the asset-loading pipeline itself (reuse
  `model-asset-pipeline`; only add models and the creature placement/capture
  layer).

## Design Notes

- **Depends on `model-asset-pipeline`.** Implement only after it is merged;
  read its implementation first and reuse its loader/cache/normalization/
  fallback helpers and its `userData`-based raycast-hit → object mapping.
- **Key code paths** (`index.html`):
  - `TARGET_CATALOG` (~1131) — model for the new creature catalog.
  - `generateTargets()` (~1604) — closest template for `generateCreatures()`
    (seeded RNG, placement constraints, clearance checks, push onto array).
  - `captureTarget()` (~1684), `isTargetFramed()` (~737),
    `showTargetToast()` (~726), `updateCatalogCounter()` (~722).
  - Capture call sites: `performCapture()` (~838) and the animate-loop
    capture branch (~1831) — extend hit resolution to include creatures.
  - Startup sequence (~1757) and **R** regen path inside `animate()` (~1805)
    — add creature generation/disposal alongside the existing calls.
- Prefer a parallel `creatures[]` array with the same capture/dispose
  semantics as `targets[]`, rather than overloading the crystal `targets[]`
  array, to keep counter semantics and lore separate and the diff localized.

## Agent Notes

- **Sandbox network is restricted** (same as `model-asset-pipeline`): source
  CC0/public-domain animal GLBs from `github.com`-hosted repos or npm
  packages reachable from the sandbox; verify and record each license in
  `assets/CREDITS.md`. If a source is unreachable, choose another reachable
  CC0 source rather than committing an unverified asset.
- No automated verify gates exist. Smoke-test manually: serve with
  `python3 -m http.server`; confirm creatures render, are grounded, can be
  photographed (framed → captured + lore toast; unframed → failure), the
  creature counter increments independently of crystals, **R** regenerates
  deterministically, and the console stays clean.
- Keep changes additive and consistent with the existing inline-module style.
