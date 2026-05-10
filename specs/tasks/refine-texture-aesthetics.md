---
id: refine-texture-aesthetics
area: scene
priority: 50
depends_on: [random-objects-and-collision]
description: Polish the four prop textures (checker, stripes, dots, noise) with mid-tone palettes, anti-aliased edges, and organic value-noise so prop colors read more cohesively across the world
---

# Refine Texture Aesthetics

## Goal

The four canvas-generated prop textures — checker, stripes, dots, noise
— currently use harsh black/white palettes and per-pixel uniform
random noise. The bright cells wash out the prop's HSL tint (since
`material.map` multiplies into `material.color`), the patterns alias
at oblique angles, and the noise looks like TV static. This spec
polishes each texture's visuals **without changing the texture
roster**: `TEXTURE_NAMES = ['checker', 'stripes', 'dots', 'noise']`,
the four `create*Texture()` function names, the `baseTextures` array
order, and every consumer (info card, `generate()`, the highlight
loop) all stay untouched. The refinements are per-texture mid-tone
palettes, soft / anti-aliased pattern edges, sinusoidal soft stripes,
and bilinearly-upscaled value-noise replacing white-noise.

## Acceptance Criteria

### Structure preserved

1. The four texture-creating functions retain their existing names:
   `createCheckerTexture`, `createStripesTexture`,
   `createDotsTexture`, `createNoiseTexture`.
2. The `baseTextures` array is built from them in the same order:
   `[checker, stripes, dots, noise]`.
3. `TEXTURE_NAMES = ['checker', 'stripes', 'dots', 'noise']` is
   unchanged.
4. Each function returns a single `THREE.CanvasTexture` exactly as
   before. Source canvas size remains `256 × 256`.
5. Per-prop usage in `generate()` is unchanged: clone the base
   texture, set `wrapS = wrapT = RepeatWrapping`,
   `repeat.set(repeatVal, repeatVal)`, and `tex.needsUpdate = true`
   after clone. The `repeatVal = Math.max(1, Math.round(maxExtent))`
   formula is unchanged.

### Anisotropic filtering

6. After the renderer is constructed, capture
   `const MAX_ANISO = renderer.capabilities.getMaxAnisotropy();`
   once.
7. Inside each `create*Texture()` function, after constructing the
   `THREE.CanvasTexture` and **before returning it**, set
   `texture.anisotropy = MAX_ANISO;`. Pattern:
   ```js
   const tex = new THREE.CanvasTexture(canvas);
   tex.anisotropy = MAX_ANISO;
   return tex;
   ```
8. Do not override `texture.minFilter`, `texture.magFilter`, or
   `texture.generateMipmaps`. Defaults
   (`LinearMipmapLinearFilter`, `LinearFilter`,
   `generateMipmaps = true`) are correct.

### Checker

9. Grid stays `8 × 8` cells of equal size (`32 × 32 px` each).
10. Cell colors: light cell `#B0B0B0`, dark cell `#5C5C5C`. No
    pure white, no near-black.
11. Soften cell boundaries: before the cell loop set
    `ctx.filter = 'blur(1.0px)'`, draw all cells as before with
    `fillRect`, then reset `ctx.filter = 'none'`. The result reads
    as a soft checker, not a sharp pixel grid.

### Stripes

12. Replace the hard `fillRect` bands with a sinusoidal luminance
    ramp along the X axis. For each integer column `x ∈ [0, size)`
    (with `size = 256`):
    ```js
    const v = 0.62 + 0.22 * Math.sin((x / size) * Math.PI * 8);
    const g = Math.round(v * 255);
    ctx.fillStyle = `rgb(${g}, ${g}, ${g})`;
    ctx.fillRect(x, 0, 1, size);
    ```
    `Math.PI * 8` produces 4 full light/dark cycles across the
    256-px width — visually similar cadence to the original 8
    stripes. Luminance ranges from `0.40` to `0.84` (`0.62 ± 0.22`).
13. The stripes texture has no hard edges; it does not need a
    `ctx.filter` blur.

### Dots

14. Grid stays `6 × 6` dots. Cell size `256 / 6 ≈ 42.67 px`. Each
    dot is centered at `(x*cell + cell/2, y*cell + cell/2)`.
15. Background fill: `#C0C0C0`. Dot color: `#5A5A5A`. Dot radius:
    `11` px (down from 12 — slightly less dominant).
16. Dots are drawn with `ctx.beginPath()`,
    `ctx.arc(cx, cy, radius, 0, Math.PI * 2)`, `ctx.fill()`. Canvas
    arcs are anti-aliased by default — do not toggle
    `imageSmoothingEnabled` for this texture.

### Noise

17. Replace the per-pixel uniform random with **value noise**:
    generate a `16 × 16` grid of random values in `[0, 1]`, then
    bilinearly upscale to `256 × 256`.
18. Implementation:
    a. Create a small `16 × 16` canvas (use `makeCanvas(16)`); get
       its 2D context.
    b. Build an `ImageData(16, 16)`. For each of the 256 pixels,
       sample `r = Math.random()` and write the byte
       `Math.round((0.45 + r * 0.40) * 255)` to the R, G, and B
       channels (alpha 255). This bakes the luminance window
       `[0.45, 0.85]` directly at the source.
    c. `putImageData` the small image into the small canvas.
    d. On the `256 × 256` target canvas, leave
       `imageSmoothingEnabled` at its default (`true`) and call
       `ctx.drawImage(small, 0, 0, 256, 256)`. The browser performs
       the bilinear filter, producing a smooth gray-cloud pattern.
19. Use `Math.random()` (matches the previous behavior — texture
    pattern varies across page loads). Do **not** seed the noise
    from the world `mulberry32` rng. Base textures are created once
    at startup before any world rng exists, and that ordering must
    not change.

### Integration constraints

20. `material.emissive.setRGB(1, 1, 1)`,
    `material.emissiveIntensity = 0`, and the per-frame
    `emissiveIntensity` write in the animate loop are untouched.
21. The info-card line `texture: <checker | stripes | dots | noise>`
    (criterion 21 of `camera-mode-aim-shoot`) still resolves
    correctly because `TEXTURE_NAMES` and `textureIdx` are
    unchanged.
22. The four base textures are still created exactly once at
    startup; `disposeProps()` continues to dispose per-prop clones
    via `prop.mesh.material.map.dispose()`. No new disposal logic
    is required.
23. No new files. All edits inside `index.html`. No new dependencies.
    Three.js stays at the pinned version
    (`https://unpkg.com/three@0.160.0/...`). The page remains a
    build-free static site.
24. No memory leaks. The small `16 × 16` canvas inside
    `createNoiseTexture` is a local variable and is garbage-collected
    after the function returns; only the final `CanvasTexture` (with
    its `256 × 256` source) is retained, matching the previous
    function's lifetime.

### Manual verification

25. Load the page. Browser devtools console shows no errors and no
    warnings.
26. Walk around the props (WASD). Each of the four textures should
    be visibly distinct:
    - **checker**: soft 8×8 mid-gray two-tone, no sharp pixel
      edges at any viewing angle.
    - **stripes**: smooth wavy bands, no hard edges, ~4 light /
      dark cycles around the prop's circumference at
      `repeatVal = 1`.
    - **dots**: clean circular dots on a lighter mid-gray
      background.
    - **noise**: organic gray cloud — no pixel sparkle, no static.
27. Spot-check a saturated-color prop (any HSL with `sat > 0.6`):
    the prop's tint should clearly read across the whole surface,
    not only in the dark cells of its texture.
28. Look down a row of props at a grazing angle. Pattern edges
    should not shimmer or moiré (anisotropic filtering effective).
29. Press **R** repeatedly. Each regeneration still produces
    visually distinct textures across props (per-prop clones still
    repeat by `maxExtent`).
30. Toggle **C** (camera mode), aim and click on at least one prop
    of each texture. The info-card line `texture: …` reads exactly
    `checker`, `stripes`, `dots`, or `noise`.
31. Day → night cycle: textures stay readable both when
    sun-lit and when shadowed. Mid-tones remain visible at low
    ambient at night.

## Out of Scope

- Adding new texture categories (brick, hatch, marble, plaster,
  wood, etc.). This polish is deliberately scoped to the existing
  four.
- Renaming any texture (`TEXTURE_NAMES` is fixed).
- Multi-octave noise / fbm. One octave (16×16 upscaled) is enough
  for this texture size.
- Per-prop noise variation (e.g., reseeding noise per prop).
  Texture variation across props comes from clone + repeat + tint,
  not from per-prop pattern regeneration.
- Bump / normal / roughness / displacement maps. Albedo only.
- Loading external image files (PNG, JPG, KTX). Textures stay
  procedurally generated on canvas.
- Texture atlasing, baking, or caching beyond the existing single
  shared base + per-prop clone.
- Postprocessing, tone-mapping changes, color-management adjustments,
  gamma changes, sRGB encoding tweaks.
- Changing `material.color`, `roughness`, or `metalness`
  distributions. Only the texture's luminance and pattern change.
- Changing the per-prop selection logic (`Math.floor(rng() * 4)`)
  or the texture repeat rule.
- Pointer-events / pointer-lock / controls / animate-loop ordering.
- README updates. Running and deploying the page are unchanged.
- Automated tests / Playwright / visual regression. Verification
  stays manual per the existing project pattern.

## Design Notes

- **Why mid-tones instead of B&W**: `MeshStandardMaterial` computes
  effective albedo as `material.color * texture sample` (per RGB
  channel). With pure-white cells, the prop's color only shows in
  the dark cells, producing a "color-in-the-cracks" look. Mid-tone
  palettes (≈`0.36`–`0.85` luminance) let the tint read across the
  whole surface while keeping the pattern legible.
- **Why per-texture luminance windows**: stripes (sinusoidal) need
  a slightly higher mean than checker (hard transition softened by
  blur) to read at the same perceived contrast. Dots benefit from a
  brighter background to keep the dot grid from looking heavy.
  Values were picked by eye — small tweaks within ±`0.05` luminance
  are acceptable, but the spec freezes them so the implementation
  is deterministic.
- **Why `ctx.filter = 'blur(1.0px)'` for checker only**: stripes
  already soften via the sinusoidal ramp. Dots are circles drawn
  with native AA. Noise is bilinearly upscaled. Only the checker
  has hard pixel-aligned cell boundaries that benefit from a tiny
  blur. Resetting `ctx.filter = 'none'` afterward is good hygiene.
- **Why value-noise (low-res upscaled) instead of per-pixel
  uniform**: per-pixel uniform random has energy at every spatial
  frequency and moirés badly under mipmapping — the visible "TV
  static" sparkle. A `16 × 16` random grid bilinearly upscaled has
  dominant low-frequency energy, mipmaps cleanly, and reads as a
  soft cloud / weathering pattern.
- **Why one octave is enough**: at this `256 × 256` texture size and
  the `repeatVal` range (1–3 typically), a second octave would add
  visual fuss without legibility gain. Keep the implementation
  small.
- **Why anisotropy bump**: the props are walked around at various
  angles, including grazing ones. The default anisotropy of `1`
  produces blurry oblique sampling. Setting
  `anisotropy = renderer.capabilities.getMaxAnisotropy()` (`16` on
  most desktop GPUs, falls back to `1` if the
  `EXT_texture_filter_anisotropic` extension is unavailable) keeps
  the patterns crisp at angle without changing the texture data.
- **Why keep `Math.random()` for noise**: the existing noise
  generator uses `Math.random()` directly, so the noise pattern
  varies between page loads. The world rng (`mulberry32`) is
  created later inside `generate()` and is reseeded on each **R**
  press — base textures are created once at module load, before
  any world rng exists. Keeping `Math.random()` preserves the
  load-time freshness without restructuring init order.
- **Cloned-texture inheritance**: `THREE.Texture.clone()` copies
  `anisotropy` along with all other sampling state, so setting
  it once on each base texture is enough — every per-prop clone
  inherits it. The existing
  `tex.needsUpdate = true` after clone is for the cloned
  instance and must remain.

## Agent Notes

- All edits in this worktree per `AGENTS.md` / `CLAUDE.md`. Do not
  touch the main checkout. Single-file change to `index.html`.
- Implementation order suggestion:
  1. Add `const MAX_ANISO = renderer.capabilities.getMaxAnisotropy();`
     immediately after `renderer.setSize(...)`. (It can live wherever
     it is in scope before the texture creators run; right after
     renderer setup is the natural anchor.)
  2. In each of the four `create*Texture()` functions, replace the
     existing `return new THREE.CanvasTexture(canvas);` with the
     three-line pattern in criterion 7 (capture, set anisotropy,
     return).
  3. Update `createCheckerTexture()` palette to `#B0B0B0` /
     `#5C5C5C` (criterion 10) and wrap the cell loop with
     `ctx.filter = 'blur(1.0px)'` / `ctx.filter = 'none'`
     (criterion 11).
  4. Rewrite `createStripesTexture()` body as the per-column
     sinusoidal loop in criterion 12.
  5. Update `createDotsTexture()` palette and dot radius to the
     values in criteria 14–15.
  6. Rewrite `createNoiseTexture()` body to the small-canvas
     bilinear upscale in criterion 18. Keep the existing `256 × 256`
     target canvas size; the small `16 × 16` canvas is local to the
     function.
- Watch for these pitfalls:
  - `ctx.filter` is supported in all evergreen browsers but is a
    draw-state — set before `fillRect`, reset to `'none'` after.
  - When using `ctx.drawImage(smallCanvas, 0, 0, 256, 256)` to
    upscale noise, `ctx.imageSmoothingEnabled` must be `true`
    (default) for the bilinear filter to work. Do **not** set it
    to `false` for the noise canvas.
  - `texture.anisotropy` accepts a finite number;
    `getMaxAnisotropy()` returns `1` if the
    `EXT_texture_filter_anisotropic` extension is unavailable,
    which is harmless. Do not branch on its value.
  - Do not change the per-prop clone path in `generate()`. The
    `tex.needsUpdate = true` after clone is intentional and must
    remain.
  - The texture is multiplied by `material.color`. Verify by
    spot-checking that a brightly colored prop (e.g., a saturated
    red or yellow) reads as that color across the whole surface,
    not just in the dark cells.
  - Keep all four textures at the same `256 × 256` source size so
    `repeatVal` continues to behave consistently across them.
- Test locally with `python3 -m http.server 8000` from the worktree
  root. Walk through criteria 25–31. Open devtools and confirm no
  warnings (criterion 25).
