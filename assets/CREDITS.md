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
