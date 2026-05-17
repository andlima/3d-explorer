# Asset Credits

All committed 3D assets used by 3d-explorer, with full provenance and license.

Every asset below is original work authored for this project and dedicated to
the public domain under **[CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/)**.
No third-party, unverified, or non-free asset is committed.

## Models — `assets/models/`

| File | Title | Author | Source | License |
|------|-------|--------|--------|---------|
| `rock.glb` | Low-poly Rock | 3d-explorer project | Authored via `tools/gen-models.mjs` in this repository | CC0 1.0 (public domain) |
| `log.glb` | Fallen Log | 3d-explorer project | Authored via `tools/gen-models.mjs` in this repository | CC0 1.0 (public domain) |
| `mushroom.glb` | Forest Mushroom | 3d-explorer project | Authored via `tools/gen-models.mjs` in this repository | CC0 1.0 (public domain) |
| `stump.glb` | Tree Stump | 3d-explorer project | Authored via `tools/gen-models.mjs` in this repository | CC0 1.0 (public domain) |
| `crystal_cluster.glb` | Crystal Cluster | 3d-explorer project | Authored via `tools/gen-models.mjs` in this repository | CC0 1.0 (public domain) |

## Wildlife models — `assets/models/wildlife/`

| File | Title | Author | Source | License |
|------|-------|--------|--------|---------|
| `wildlife/deer.glb` | Woodland Deer | 3d-explorer project | Authored via `tools/gen-wildlife.mjs` in this repository | CC0 1.0 (public domain) |
| `wildlife/fox.glb` | Russet Fox | 3d-explorer project | Authored via `tools/gen-wildlife.mjs` in this repository | CC0 1.0 (public domain) |
| `wildlife/rabbit.glb` | Meadow Rabbit | 3d-explorer project | Authored via `tools/gen-wildlife.mjs` in this repository | CC0 1.0 (public domain) |
| `wildlife/bird.glb` | Bluewing Bird | 3d-explorer project | Authored via `tools/gen-wildlife.mjs` in this repository | CC0 1.0 (public domain) |
| `wildlife/frog.glb` | Pond Frog | 3d-explorer project | Authored via `tools/gen-wildlife.mjs` in this repository | CC0 1.0 (public domain) |

### Provenance notes

These five low-poly GLB props are **original work** created specifically for
3d-explorer. They are produced deterministically by the committed authoring
tool `tools/gen-models.mjs` (run `node tools/gen-models.mjs` to regenerate
byte-identical files — the tool has no dependencies and is **not** part of the
running site or any build step). As the sole author, the 3d-explorer project
releases them into the public domain under CC0 1.0.

The models were authored in-repo rather than sourced from an external CC0
library because the implementing environment's network is restricted to
`github.com` and the npm registries; the usual CC0 asset hosts
(poly.pizza, kenney.nl, quaternius.com) are unreachable, and no
reliably-licensed low-poly nature-prop GLB set is available through the allowed
hosts. Authoring originals and dedicating them CC0 is the cleanest reachable
public-domain source and keeps the committed binary weight tiny
(~35 KB combined, uncompressed GLB, no DRACO/Meshopt).

The five low-poly **wildlife** GLBs (`assets/models/wildlife/`) are likewise
**original work** created specifically for 3d-explorer, produced
deterministically by the committed authoring tool `tools/gen-wildlife.mjs`
(run `node tools/gen-wildlife.mjs` to regenerate byte-identical files — same
constraints: no dependencies, not part of the running site or any build step).
The same restricted-network rationale applies: the reachable CC0 animal-model
sets were unavailable, so originals were authored and dedicated to the public
domain under CC0 1.0. They are flat-shaded primitive soups (boxes, spheres,
cones) emitted with `doubleSided` materials and load through the **same**
build-free GLB pipeline as the props; combined weight is ~180 KB uncompressed
GLB (no DRACO/Meshopt) — still small for a build-free static site.
