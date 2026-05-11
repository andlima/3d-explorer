---
id: distance-fog
area: scene
priority: 50
depends_on: [random-terrain-elevation]
description: Add linear distance fog whose color tracks the sky horizon and whose density follows the day/night cycle (thin at noon, moderate at night, warmer at golden hour)
---

# Distance Fog

## Goal

The scene currently has no atmospheric depth — distant terrain corners and
props read sharp against a smoothly-colored sky dome, which flattens the sense
of scale and makes the day/night cycle feel like a backdrop swap instead of a
weather change. This spec adds a single `THREE.Fog` instance whose color
tracks the already-computed `skyHorizonColor` (so world objects fade seamlessly
into whatever the sky horizon is at that moment) and whose `near` / `far`
endpoints lerp between a thin "noon" preset and a moderate "night" preset
based on `sunDir.y`. The result: at noon, distant features read with a faint
haze; at golden hour, the fog warms with the orange horizon; at night, the
world fades to deep blue around 12–18 m out while close props stay crisp.

The fog is visual-only. The camera-mode click raycast, prop collision math,
world bounds clamp, terrain generation, prop placement, and player movement
are unchanged. Sun disc, moon disc, stars, and the sky dome itself are
materials that do not honor `scene.fog` and remain visually unaffected — which
is correct, because the sky dome IS the surface the fog blends into.

## Acceptance Criteria

### Constants

1. Add module-scope constants near the other world constants
   (`HALF_EXTENT`, `TERRAIN_AMPLITUDE`, etc.):
   - `FOG_NIGHT_NEAR = 6`
   - `FOG_NIGHT_FAR = 30`
   - `FOG_NOON_NEAR = 40`
   - `FOG_NOON_FAR = 150`
   - `FOG_NIGHT_THRESHOLD = -0.25`
   - `FOG_DAY_THRESHOLD = 0.3`

### Fog instance

2. Create a single fog instance once during scene setup (anywhere after
   `const scene = new THREE.Scene();`):
   ```js
   scene.fog = new THREE.Fog(0x000000, FOG_NIGHT_NEAR, FOG_NIGHT_FAR);
   ```
   The initial color is a placeholder — the per-frame update overwrites it
   on the first animation frame. Picking `0x000000` makes it obvious if the
   per-frame update is ever skipped.
3. Do not assign `scene.fog` a second time. The same fog instance lives for
   the page lifetime; only its `.color`, `.near`, and `.far` are mutated.
4. The fog instance is independent of `scene.background` (which remains
   unset — the sky dome covers the background visually). Do not assign
   `scene.background`.

### Per-frame update

5. Inside `animate()`, AFTER the existing `updateSkyColors(t)` call (so
   `skyHorizonColor` reflects this frame's interpolated horizon color),
   update fog with these three writes, in this order:
   ```js
   scene.fog.color.copy(skyHorizonColor);
   const fogT = THREE.MathUtils.smoothstep(sunDir.y, FOG_NIGHT_THRESHOLD, FOG_DAY_THRESHOLD);
   scene.fog.near = THREE.MathUtils.lerp(FOG_NIGHT_NEAR, FOG_NOON_NEAR, fogT);
   scene.fog.far = THREE.MathUtils.lerp(FOG_NIGHT_FAR, FOG_NOON_FAR, fogT);
   ```
6. The fog update lives in the existing day/night block (after
   `updateSkyColors`, before or near the sun/ambient intensity updates).
   It must be inside the per-frame `animate()` body, not behind any
   conditional branch (no `if (regenerateRequested)` etc.).
7. `fogT` is computed from `sunDir.y` only. It is not exposed elsewhere
   and is not reused.

### Material affect

8. The terrain mesh's `MeshStandardMaterial` has `fog: true` by default
   (Three.js library default). Verify no explicit `fog: false` is added
   anywhere; do not touch the existing `terrainMaterial` constructor.
9. Each prop's `MeshStandardMaterial` inside `generate()` is constructed
   without overriding the `fog` property — fog applies to all props. Do
   not add `fog: false`.
10. The `skyMaterial` `ShaderMaterial` is NOT modified. It does not declare
    a `fog` uniform or `#include <fog_pars_fragment>`, so `scene.fog` does
    not affect the sky dome's shading. The sky dome remains the unfogged
    "infinite" backdrop that world objects fade INTO.
11. The `sunDisc` and `moonDisc` (`MeshBasicMaterial` with `depthWrite:
    false`) are unchanged. `MeshBasicMaterial` honors fog by default, but
    these discs sit at `SUN_DISTANCE = 75` from the camera and would be
    visibly fogged at night (far=30) which is wrong — celestial bodies
    should remain crisp. Pass `fog: false` to BOTH `sunDisc` and `moonDisc`
    material constructors (a minimal change to those two `new
    THREE.MeshBasicMaterial({ ... })` calls).
12. The `starMaterial` `ShaderMaterial` is unchanged. Like `skyMaterial`,
    it does not declare a `fog` uniform, so stars remain unfogged.

### No other changes

13. Camera `near` / `far` (0.1 / 200) are unchanged. Camera `fov` zoom
    logic is unchanged.
14. The camera-mode raycast (`raycaster.intersectObjects(...)`) is
    unchanged. Fog does not limit pick distance.
15. `HALF_EXTENT` and world bounds clamp are unchanged. The player may
    still walk to the world edge.
16. `generate()`, `disposeProps()`, `buildTerrainGeometry()`, `heightAt()`,
    `computeSupportY()`, `pushOutAxis()`, and `resetPlayerToSpawn()` are
    not edited. The fog has no interaction with prop placement, terrain
    geometry, or player physics.
17. No new dependencies. Three.js stays at the pinned
    `https://unpkg.com/three@0.160.0/...` version. Page remains a
    build-free static site; all edits live in `index.html`. No new files.

### Manual verification

18. Load the page. Browser devtools console shows no errors and no
    warnings.
19. Stand at spawn and look around at the start of the cycle (sun rising,
    horizon orange). The far terrain edges and distant props read with a
    soft warm haze; close props (within ~5 m) stay crisp.
20. Wait ~15 seconds for noon. Fog is at its thinnest — distant terrain
    is still hazy enough to feel atmospheric but most props across the
    50 × 50 world are clearly recognizable. Sun disc is crisp, not foggy.
21. Wait through dusk into night. Fog thickens visibly and tints deep
    blue. Distant props (~20 m and beyond) fade to dark blue. Walk in any
    direction; props "emerge" from the fog as you approach them.
22. At full night, look up. Stars are crisp (not fogged). The sky dome's
    deep-blue gradient is unchanged — the fog blends ground objects INTO
    the horizon color without smearing the sky itself.
23. Through the entire cycle there is no visible seam between fogged
    world objects and the sky dome at the horizon — objects at the edge
    of fog `far` blend smoothly into the horizon color, not into a
    contrasting band.
24. Press **R** several times. Each regeneration produces new prop layout
    and terrain; the fog appearance is unaffected (it's tied only to the
    sun cycle, not the seed).
25. Toggle **C** (camera mode), zoom in (mouse wheel) on a distant fogged
    prop, then click it. The info card displays correctly — the raycast
    sees through fog at any density.
26. Jump onto a tall prop and look across the world. The horizon is hazy
    in the appropriate tint; nearby surfaces below are crisp.

## Out of Scope

- Exponential / `THREE.FogExp2` fog. Linear fog with explicit near/far is
  used for predictable visibility ranges.
- Height-based / vertical-falloff fog (fog thicker near the ground than at
  altitude). Uniform fog is sufficient for the world's small vertical
  range (~3 m props, ±0.6 m terrain).
- Volumetric fog, god rays, light shafts, raymarched scattering.
- Per-prop, per-region, or biome-zone fog overrides.
- Animating fog density independently of the sun (weather, fog rolls in
  randomly, etc.). The fog is a pure function of `sunDir.y`.
- Limiting the camera-mode raycast or pick distance based on fog (user
  has explicitly requested visual-only fog).
- Reducing camera `far` to match fog `far`. Camera far stays at 200 so
  far-clip and fog are independent concerns.
- Fogging the sky dome. The dome is the backdrop the fog blends into.
- Fogging stars, sun disc, or moon disc. Celestial bodies stay crisp at
  all hours.
- Tinting the fog color with anything other than the existing
  `skyHorizonColor`. No separate fog keyframes.
- Animating the smoothstep thresholds (`FOG_NIGHT_THRESHOLD`,
  `FOG_DAY_THRESHOLD`) per-keyframe. They are constants.
- Updating the lock-overlay copy, README, or instructions UI.
- Adding shadow casting / receiving. Fog and shadows are orthogonal.
- Automated tests / visual-regression / Playwright. Verification stays
  manual per existing project pattern.
- Adjusting prop or terrain colors to "look better" under fog. The fog
  reads correctly against the existing palette.

## Design Notes

- **Why `THREE.Fog` (linear) over `THREE.FogExp2`**: the world is small
  (50 × 50, ~70 m corner-to-corner) and bounded. Linear fog with explicit
  `near` / `far` makes the "visibility distance" knob legible — at night,
  `far = 30` means objects past 30 m are fully fog color, period. Exp2
  density values are harder to reason about for art direction at this
  scale.
- **Why fog color = `skyHorizonColor`**: the sky dome shader paints the
  horizon ring with `skyHorizonColor` and blends up to `skyTopColor`. If
  fog color matches the horizon, distant fogged objects fade into the
  exact band of sky behind them — no seam, regardless of which direction
  the player looks. This is the cheap version of physically-correct
  aerial perspective.
- **Why noon `far = 150`**: at high noon the player should still feel
  scale — distant terrain corners shouldn't pop into existence. With
  noon `near = 40` and `far = 150`, an object 70 m away (worst-case
  corner-to-corner distance) is at fog factor `(70 - 40) / (150 - 40) ≈
  0.27`, a 27 % blend with the light cyan horizon. That reads as faint
  haze, not heavy fog. Setting `far` close to camera `far = 200` is safe
  because anything past camera far is clipped anyway.
- **Why night `near = 6, far = 30`**: the user picked the "moderate
  ~12–18 m visibility" option. With these endpoints, an object 12 m away
  is at fog factor `(12 - 6) / (30 - 6) = 0.25` (mostly visible); at 18 m,
  factor `0.5` (half-faded); at 30 m+, fully fog. Sweet spot for
  atmospheric-but-navigable night.
- **Why smoothstep `(-0.25, 0.3)` on `sunDir.y`**: the lower threshold
  matches `starMaterial`'s `smoothstep(sunDir.y, -0.25, -0.05)` for
  "stars fully visible," so fog reaches full night density exactly when
  the sky is fully dark. The upper threshold `0.3` corresponds to a sun
  elevation of ~17° — high enough that fog stays at "noon thin" for the
  bulk of the daytime arc, but not so high that golden hour (sun near
  horizon) jumps abruptly to thin fog.
- **At sunset (`sunDir.y ≈ 0`)**: `fogT = smoothstep(0, -0.25, 0.3) ≈
  0.30` (eased). So `near ≈ lerp(6, 40, 0.30) ≈ 16` and `far ≈ lerp(30,
  150, 0.30) ≈ 66`. Combined with the warm orange `skyHorizonColor` at
  that t, this produces the "golden hour haze" look — fog is thicker
  than noon but tinted warm.
- **Why `fog: false` on sun/moon discs**: they live at `SUN_DISTANCE = 75`
  from the camera. At noon (far=150) they're at fog factor `(75 - 40) /
  (150 - 40) ≈ 0.32` — already 32 % faded if fog applied, which would
  desaturate them visibly. At night (far=30), they'd be fully fog color,
  i.e. invisible (the moon would vanish). Stars are exempt automatically
  because `starMaterial` is a `ShaderMaterial` without fog support; the
  sky dome is exempt for the same reason. The sun/moon discs use
  `MeshBasicMaterial`, which honors `scene.fog` by default unless
  `fog: false` is passed in the constructor — hence the explicit opt-out.
- **Why no `scene.background`**: the sky dome already covers the entire
  view (radius 80, camera inside). Setting `scene.background` to the fog
  color would double-paint — the sky dome would render over it
  immediately. Leaving background unset lets the dome handle its own
  rendering with its custom shader.
- **Why `scene.fog` is set once and mutated**: Three.js picks up
  `scene.fog.color`, `.near`, `.far` from the same instance every frame
  via material uniforms. There is no need to replace the fog object;
  mutating in place is idiomatic and avoids per-frame GC pressure. The
  fog ref on materials is captured at compile time when each material is
  built — switching `scene.fog` to a new instance mid-flight requires
  per-material rebuilds.
- **Computed-once-per-frame, not cached**: `fogT` and the lerps are
  cheap (3 multiplies, 3 additions, 1 smoothstep). No memoization needed.

## Agent Notes

- All edits in this worktree per `AGENTS.md` / `CLAUDE.md`. Do not touch
  the main checkout. Single-file change to `index.html`.
- Implementation order suggestion:
  1. Add the six new constants near the other world constants block
     (`HALF_EXTENT`, `TERRAIN_AMPLITUDE`, `STEP_DOWN_TOLERANCE`, etc., at
     roughly the same depth in the file — around line ~520).
  2. Add `scene.fog = new THREE.Fog(0x000000, FOG_NIGHT_NEAR, FOG_NIGHT_FAR);`
     once during scene setup. A natural spot is right after
     `const scene = new THREE.Scene();` on line 135, or anywhere before
     `animate()` is first called — order does not matter as long as it
     runs before the first render.
  3. Add `fog: false` to the `MeshBasicMaterial` constructors for
     `sunDisc` (line ~205) and `moonDisc` (line ~211). The two existing
     material objects already pass `{ color: ..., depthWrite: false }`;
     append `, fog: false`.
  4. Inside `animate()`, AFTER the existing `updateSkyColors(t)` call
     (line ~812), add the three-line fog update block (color copy +
     near/far lerps via `fogT`).
- Watch for these pitfalls:
  - The fog update MUST run after `updateSkyColors(t)` and after
    `sunDir.set(...)`. Both already happen at the top of `animate()`;
    put the fog block immediately after `updateSkyColors(t)` so the
    ordering is obvious.
  - Do not assign `scene.background`. The sky dome covers the view;
    setting a background color would either be hidden by the dome
    (wasted work) or, if it leaked through during the dome shader's
    `depthWrite: false` pass in a future change, would visibly conflict
    with the dome's gradient.
  - Three.js `MeshBasicMaterial` defaults `fog` to `true`. Without
    `fog: false`, the sun and moon discs WILL desaturate / disappear at
    night — verify in step 20–21 of the manual checks.
  - Do not change `terrainMaterial` or any prop material's `fog` property
    — they should remain fogged. `MeshStandardMaterial` also defaults
    `fog` to `true`.
  - `THREE.MathUtils.smoothstep(x, edge0, edge1)` returns 0 when `x ≤
    edge0` and 1 when `x ≥ edge1`. Pass `sunDir.y` as `x`,
    `FOG_NIGHT_THRESHOLD` as `edge0`, `FOG_DAY_THRESHOLD` as `edge1` —
    same argument shape as the existing stars-opacity line on ~832.
  - `THREE.MathUtils.lerp(a, b, t)` returns `a` at t=0, `b` at t=1.
    Pass night first, noon second, `fogT` last.
  - The fog block must NOT live inside the `if (regenerateRequested)`
    branch on ~834. It runs every frame.
- Test locally with `python3 -m http.server 8000` from the worktree root.
  Walk through criteria 18–26. Wait for at least one full day/night
  cycle (60 s) to see fog density transition both ways. Open devtools
  and confirm no warnings (criterion 18).
