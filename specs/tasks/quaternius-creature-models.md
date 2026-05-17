---
id: quaternius-creature-models
area: frontend
priority: 50
depends_on: [wildlife-catalog]
description: Replace the procedural wildlife GLBs with 6 curated CC0 Quaternius "Ultimate Monsters" creatures and play their looping idle animation via per-instance AnimationMixer
---

# Quaternius Creature Models (animated CC0 creatures)

## Goal

Swap the five procedurally-authored wildlife GLBs for six curated, real
low-poly creature models from the **Quaternius "Ultimate Monsters"** pack
(CC0 1.0), and make them gently come alive by playing each model's looping
idle clip through an `AnimationMixer`. This keeps the existing photo-capture
catalog loop intact (`Creatures X / Y` counter, framing check, lore toast,
deterministic seeded placement) while replacing primitive "box soup" with
recognizable, animated creatures.

The six source `.gltf` files are **already committed on this task branch**
under `assets/models/wildlife/` (`cat.gltf`, `dog.gltf`, `chicken.gltf`,
`pigeon.gltf`, `mushnub.gltf`, `armabee.gltf`) — they are self-contained
(geometry and the color atlas texture are embedded as base64 in each file;
no external `.bin` or `.png` is needed). This task is the **code + credits
wiring**, not asset sourcing. Do not re-fetch or regenerate assets.

## Acceptance Criteria

1. **Catalog replaced.** `CREATURE_CATALOG` (index.html ~1128) is rewritten
   to exactly these six entries (display names / flavor / footprint / weight
   may be lightly tuned for feel, but `file`, `key`, and `idleClip` must
   match):

   | key | file | name | idleClip | footprint | weight | hover |
   |-----|------|------|----------|-----------|--------|-------|
   | `wl_cat` | `wildlife/cat.gltf` | Thicket Cat | `Idle` | 0.9 | 4 | 0 |
   | `wl_dog` | `wildlife/dog.gltf` | Loam Hound | `Idle` | 1.0 | 3 | 0 |
   | `wl_chicken` | `wildlife/chicken.gltf` | Bramble Hen | `Idle` | 0.7 | 4 | 0 |
   | `wl_pigeon` | `wildlife/pigeon.gltf` | Cobble Pigeon | `Idle` | 0.55 | 4 | 0 |
   | `wl_mushnub` | `wildlife/mushnub.gltf` | Mushnub | `Idle` | 0.7 | 2 | 0 |
   | `wl_armabee` | `wildlife/armabee.gltf` | Armabee | `Flying_Idle` | 0.7 | 1 | 1.3 |

   Each entry keeps a `fallbackColor` for the procedural-primitive fallback.
   Flavor/lore text is rewritten so it reads as quirky wild creatures (no
   leftover deer/fox/rabbit/bird/frog copy).
2. **Old assets removed.** The five procedural wildlife GLBs
   (`assets/models/wildlife/{deer,fox,rabbit,bird,frog}.glb`) and the now-unused
   generator `tools/gen-wildlife.mjs` are deleted. `tools/gen-models.mjs`
   (props — still procedural) is left untouched.
3. **Credits updated.** `assets/CREDITS.md` no longer claims the wildlife
   models are project-authored. The wildlife table lists all six `.gltf`
   files attributed to **Quaternius — "Ultimate Monsters"**, source
   `https://quaternius.com/`, license **CC0 1.0 Universal (public domain
   dedication)**. The procedural-wildlife provenance paragraph is replaced
   with a short note that wildlife is now the Quaternius CC0 pack (the
   bundled `License.txt` states: *"Ultimate Platformer Pack by @Quaternius …
   License: CC0 1.0 Universal (CC0 1.0) Public Domain Dedication"*). The
   props table and its provenance note are left unchanged.
4. **Animations available without a second fetch.** `preloadModels`
   (index.html ~1283) is extended so that for creature defs the parsed
   animation clips are retained in the cache alongside the scene (e.g. cache
   `{ scene, animations }` for creature keys, or attach
   `gltf.animations` onto the cached object). No new loader, no second
   fetch, no refetch on **R**. Prop loading/caching/instancing is unchanged.
5. **Skinned-correct cloning.** A new `buildCreatureInstance(def)` is used
   for creatures (props keep `buildPropInstance`/`src.clone(true)` unchanged).
   It clones the cached scene with **`SkeletonUtils.clone`** (imported from
   `three/addons/utils/SkeletonUtils.js` via the existing importmap) so each
   instance has its own skeleton. Materials are cloned per instance (so the
   capture dim/emissive of one creature never bleeds into another instance of
   the same species). Shared cached geometry/textures are **not** cloned and
   **never** disposed.
6. **Looping idle animation.** Each non-fallback creature instance gets its
   own `THREE.AnimationMixer(root)` and plays a single looping clip resolved
   in this order: the clip named `def.idleClip`; else a clip named `Idle`;
   else one named `Flying_Idle`; else `animations[0]`. The action loops
   (`THREE.LoopRepeat`) and is started at a per-instance time offset derived
   from the seeded creature RNG so instances of the same species are not
   phase-locked (placement stays deterministic for a given seed). Mixers are
   advanced once per frame with `delta` in the animate loop, only for
   non-captured creatures, with no per-frame allocation.
7. **Capture freezes the creature.** `captureCreature` (index.html ~1898)
   still dims materials, updates `creatureCapturedCount`, refreshes the
   counter, and shows the lore toast — and additionally stops/pauses the
   creature's idle action so the captured creature freezes in place (mirrors
   crystals halting their bob/spin on capture). Recapturing a captured
   creature stays a no-op. An out-of-frame shot still triggers the existing
   failure feedback. Capture raycasting stays recursive and maps a hit child
   back via `userData.creatureRef` (unchanged) — verify it still resolves
   with `SkinnedMesh` children.
8. **Flying creature hovers.** Entries with `hover > 0` (Armabee) are placed
   that many world units above the grounded resting Y, and their idle bob
   oscillates around the hovered `baseY` (not the terrain). Grounded
   creatures (`hover` 0/absent) are unchanged. The existing subtle root
   bob/sway is retained but may have its amplitude reduced so it does not
   fight the skeletal idle motion (tune for feel).
9. **Clean lifecycle.** `disposeCreatures` and the overlap-reject cleanup
   path in `generateCreatures` stop the creature's mixer/actions and release
   per-instance cloned materials + any fallback-owned geometry, **without**
   disposing the shared cached scene. Pressing **R** repeatedly regenerates
   creatures deterministically from the new seed with no mixer/material leak,
   no asset refetch, and a clean console.
10. **Fallback intact.** If a creature `.gltf` fails to load, the existing
    procedural-primitive fallback (no mixer) is used and the scene stays
    fully playable — exactly as the prop/creature fallback works today
    (`modelCache.get(key) === null` path). The "Click to play" overlay still
    gates start on preload completion.
11. **No regressions.** No build step; runs by serving the repo root
    statically (`python3 -m http.server`). Desktop pointer-lock and the
    existing mobile touch flow both work. Props, trees, terrain, pond, the
    crystal `targets`, the `Creatures X / Y` counter, the success/failure
    toasts, day/night, fog, and water are unaffected. The `Creatures` label
    is kept (no rebrand to "Monsters").

## Out of Scope

- Creature locomotion, wandering, flocking, pathing, flee-from-player, or any
  AI/steering. Idle is in-place skeletal animation only.
- Playing non-idle clips (Walk/Jump/Dance/Death/etc.), animation blending,
  crossfades, or reacting to capture with a special clip (capture just
  freezes the idle).
- Converting `.gltf` → `.glb`, DRACO/Meshopt, or any asset re-authoring /
  re-export. Commit the files as-is.
- Adding more than six species, changing `CREATURE_COUNT`/placement
  constants, or restructuring `generateCreatures` placement logic beyond the
  `hover` offset and the build-instance swap.
- Restyling or repositioning HUD elements; changing crystal targets, props,
  trees, terrain, pond, or the capture/framing math.
- Sound (no idle/capture SFX).

## Design Notes

- **Single-file project.** All code goes in `index.html`, consistent with the
  existing inline-module style. The six `.gltf` files are already on the
  branch under `assets/models/wildlife/`.
- **Self-contained `.gltf`.** Each file embeds its buffer (geometry +
  skin + the `Atlas_Monsters` PNG, all base64 in one `data:` URI buffer) and
  defines skinned meshes (`JOINTS_0`/`WEIGHTS_0`) plus animation clips.
  `GLTFLoader` (already imported, ~line 397) loads them with no extra
  decoders. The `Atlas_Monsters.png` sitting beside the originals in the
  source pack is redundant and must **not** be committed.
- **Clip names differ by category.** The five Blob-derived models
  (cat/dog/chicken/pigeon/mushnub) expose a clip literally named `Idle`;
  the Flying-derived `armabee.gltf` has **no `Idle`** — its loop clip is
  `Flying_Idle`. Hence the ordered clip-resolution rule in AC 6 and the
  per-entry `idleClip` column in AC 1.
- **Key code paths** (`index.html`, approx lines, re-confirm before editing):
  - `CREATURE_*` constants + `CREATURE_CATALOG` (~1116–1168).
  - `preloadModels` (~1283) and `modelCache`; `buildPropInstance` /
    `disposePropInstance` (~1322–1354) — add a sibling
    `buildCreatureInstance` / `disposeCreatureInstance` rather than
    overloading the prop path.
  - `disposeCreatures` (~1388) and `generateCreatures` (~1769), including
    its overlap-reject `disposePropInstance(built)` calls — those rejected
    creature builds must go through the creature dispose (mixer-aware) path.
  - `captureCreature` (~1898).
  - Animate loop creature bob/sway block (~2104–2116) — add
    `mixer.update(delta)` for non-captured creatures here; this is also
    where the existing root bob/sway lives.
  - Importmap (~350–354) and the import block (~396–397) for adding
    `SkeletonUtils`.
- **Skinned cloning.** `Object3D.clone(true)` does not rebind skeletons;
  multiple skinned instances sharing one skeleton deform together. Use
  `import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js'`
  (present in three@0.160.0 on the unpkg `three/addons/` path the site
  already uses) for creature instances.
- **Footprint normalization** (Box3 → uniform scale to `footprint`, ground
  on `heightAt`, random Y) stays as-is; measure the Box3 from the freshly
  cloned bind pose before attaching/advancing the mixer so the footprint is
  stable. Add `+ (def.hover || 0)` to the resting Y and fold it into
  `creature.baseY` so the bob oscillates about the hovered height.
- **Per-instance mixer is cheap.** `CREATURE_COUNT` is 9 → at most 9 mixers,
  one looping action each; `mixer.update(delta)` per frame is negligible
  next to existing per-frame work. Keep the loop allocation-free.

## Agent Notes

- Read `AGENTS.md` and `CLAUDE.md` first. All edits stay in this worktree.
- Read `preloadModels`, `buildPropInstance`, `generateCreatures`,
  `captureCreature`, `disposeCreatures`, and the animate-loop creature block
  before editing. Keep the diff additive and in the existing code style; do
  not introduce a bundler, framework, or new runtime npm dependency.
- The six `.gltf` files are already committed on this branch — do not delete
  or re-download them. Do delete the five old `wildlife/*.glb` and
  `tools/gen-wildlife.mjs`, and rewrite the wildlife section of
  `assets/CREDITS.md`.
- No automated verify gates exist (`.spec.toml` has none). Smoke-test
  manually with `python3 -m http.server`:
  1. The loading overlay gates start; after start, creatures render as
     recognizable models (cat/dog/chicken/pigeon/mushnub on the ground,
     armabee hovering) and visibly **idle-animate** (breathing/bobbing
     skeletal motion), each instance slightly out of phase.
  2. Frame a creature tightly and capture → it freezes (animation stops),
     dims, the `Creatures` counter increments, lore toast shows; an
     out-of-frame shot shows the failure toast and does not capture.
  3. Recapturing a captured creature is a no-op; aiming at a prop/crystal is
     unaffected.
  4. Press **R** several times: deterministic re-placement, animations keep
     working, no console errors, no memory growth (no leaked mixers/materials).
  5. Temporarily point one creature `file` at a missing path → that species
     falls back to the procedural primitive (no animation) and the scene
     stays playable; restore the path after.
  6. Confirm desktop pointer-lock and the mobile touch flow both still work.
