# Asset Credits

All committed 3D assets used by 3d-explorer, with full provenance and license.

Every asset below is freely licensed under
**[CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/)**
(public domain dedication). The prop / landscape models are original work
authored for this project; the wildlife creatures are the third-party
Quaternius "Ultimate Monsters" CC0 pack. No unverified or non-free asset is
committed.

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
| `wildlife/cat.gltf` | Thicket Cat (Cat) | Quaternius — "Ultimate Monsters" | <https://quaternius.com/> | CC0 1.0 Universal (public domain dedication) |
| `wildlife/dog.gltf` | Loam Hound (Dog) | Quaternius — "Ultimate Monsters" | <https://quaternius.com/> | CC0 1.0 Universal (public domain dedication) |
| `wildlife/chicken.gltf` | Bramble Hen (Chicken) | Quaternius — "Ultimate Monsters" | <https://quaternius.com/> | CC0 1.0 Universal (public domain dedication) |
| `wildlife/pigeon.gltf` | Cobble Pigeon (Pigeon) | Quaternius — "Ultimate Monsters" | <https://quaternius.com/> | CC0 1.0 Universal (public domain dedication) |
| `wildlife/mushnub.gltf` | Mushnub | Quaternius — "Ultimate Monsters" | <https://quaternius.com/> | CC0 1.0 Universal (public domain dedication) |
| `wildlife/armabee.gltf` | Armabee | Quaternius — "Ultimate Monsters" | <https://quaternius.com/> | CC0 1.0 Universal (public domain dedication) |

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

The six **wildlife** creatures (`assets/models/wildlife/*.gltf`) are **not**
project-authored. They are curated, real low-poly models from the Quaternius
**"Ultimate Monsters"** pack, dedicated to the public domain under CC0 1.0.
The pack's bundled `License.txt` states verbatim: *"Ultimate Platformer Pack
by @Quaternius … License: CC0 1.0 Universal (CC0 1.0) Public Domain
Dedication"*. Each `.gltf` is committed as-is and is self-contained — geometry,
skin, animation clips, and the shared `Atlas_Monsters` texture are all embedded
as base64 in the file, so no sidecar `.bin` or `.png` is committed (the
redundant `Atlas_Monsters.png` shipped beside the originals is intentionally
omitted). They load through the **same** build-free pipeline as the props via
`GLTFLoader` with no extra decoders.
