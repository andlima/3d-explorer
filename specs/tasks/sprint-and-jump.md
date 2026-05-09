---
id: sprint-and-jump
area: scene
priority: 50
depends_on: [first-person-navigation]
description: Add Shift-to-sprint (2x walk speed) and Space-to-jump (gravity-based arc with locked-at-takeoff air control) to the first-person walker
---

# Sprint and Jump

## Goal

Make the first-person walker feel less static by adding two classic FPS
mechanics on top of the existing pointer-lock + WASD movement: **hold Shift to
sprint** (2× walk speed) and **tap Space to jump** (gravity-based vertical arc
with a single jump per press). Air control is reduced and is locked to whatever
horizontal speed the player took off at, so toggling Shift mid-air has no
effect. The walker remains clamped to the ground extent, and ground movement
behavior from `first-person-navigation` is otherwise unchanged.

## Acceptance Criteria

### Sprint (ground-only)

1. While the walker is **grounded** (`camera.position.y` is at the eye height,
   not in the middle of a jump), holding either `ShiftLeft` or `ShiftRight`
   multiplies horizontal walk speed by **2** (so `5 → 10` units/sec). Releasing
   Shift returns ground speed to the base walk speed on the very next frame.
2. The 2× multiplier applies equally to forward, back, and strafe. Diagonal
   normalization from `first-person-navigation` is preserved — sprinting
   diagonally is 10 u/s, not 10·√2.
3. Sprint has **no stamina, no cooldown, no acceleration ramp, no FOV change,
   and no UI indicator.** It is a pure speed multiplier while held and grounded.
4. Sprint input is **only** considered while pointer lock is engaged
   (`controls.isLocked === true`), matching the existing rule that movement
   input is ignored when unlocked.

### Jump

5. Pressing `Space` while **grounded and locked** sets the walker's vertical
   velocity to `JUMP_VELOCITY = 7.5` u/s. Gravity (`GRAVITY = 25` u/s²) is
   integrated each frame against this vertical velocity, producing an arc with
   apex roughly **1.1 units above eye height** and total airtime roughly
   **0.6 s**. (These are the natural results of `v=7.5, g=25`; do not retune
   the constants to hit different numbers.)
6. The jump is a **single jump per press**: holding `Space` continuously must
   not produce repeated jumps when the walker lands. The walker must release
   `Space` and press it again to jump a second time. (Implementation hint:
   only trigger a jump on the keydown edge, e.g. by tracking a `jumpQueued`
   flag set in `keydown` and consumed once in the animation loop, or by
   gating on a "was Space down last frame" check.)
7. **No double jump / no air jump.** A `Space` press while airborne
   (`isGrounded === false`) is ignored — it must not boost vertical velocity,
   reset the fall, or queue a second jump for after landing.
8. The walker is considered "grounded" when `camera.position.y <= EYE_HEIGHT`
   after gravity is applied. On landing, snap `camera.position.y = EYE_HEIGHT`
   exactly and zero the vertical velocity. There is no bounce, no landing lag,
   and no fall damage.
9. While airborne, `camera.position.y` is purely a function of vertical
   velocity + gravity. It is **not** clamped to eye height during ascent or
   apex — only on landing per criterion 8.

### Air control (locked at takeoff)

10. At the moment of takeoff (the frame `Space` is consumed), record the
    walker's current **horizontal speed** as `airSpeed`. Specifically:
    - If Shift was held that frame, `airSpeed = 10` (sprint).
    - Otherwise, `airSpeed = 5` (walk).
    - This value is **frozen** for the duration of this jump.
11. While airborne, horizontal movement uses `airSpeed * 0.5` as the speed
    cap, multiplied by the same normalized `(forward, right)` input vector
    used on the ground. So:
    - Walk takeoff → 2.5 u/s of air control.
    - Sprint takeoff → 5.0 u/s of air control.
12. Toggling Shift **mid-air has no effect**: pressing or releasing Shift
    while `isGrounded === false` does not change the in-air speed cap. The
    cap is determined solely by the takeoff state.
13. The walker can change direction in the air (WASD still steers the
    horizontal input vector relative to look direction), but cannot exceed
    the locked `airSpeed * 0.5` cap.

### Preserved behavior

14. The existing XZ clamp from `first-person-navigation` still applies every
    frame after movement is integrated, both grounded and airborne. The
    walker cannot leave the 50×50 ground extent by jumping near an edge.
15. While **unlocked** (`controls.isLocked === false`): WASD, Shift, and
    Space are all ignored. If the player is unlocked while airborne (e.g.
    presses ESC mid-jump), the jump physics continue to play out — the
    walker still falls under gravity and lands — but no horizontal input is
    applied. (Rationale: stopping mid-air on unlock would feel buggy; let
    physics finish and ground them naturally.)
16. Pointer-lock yaw/pitch via `PointerLockControls` is unchanged. Looking
    up or down does not affect vertical movement — jumping always sends the
    walker straight up regardless of pitch (matching the existing rule that
    `moveForward` / `moveRight` operate on XZ).
17. Movement remains frame-rate independent. Both gravity integration and
    horizontal movement use the existing `THREE.Clock` `delta`. No
    per-frame constants tied to refresh rate.
18. The page remains a build-free static site — no `package.json`, no
    bundler, no new dependencies beyond Three.js. All resource references
    stay relative so it still works under the GitHub Pages project subpath.
19. The instructional overlay still appears before lock and re-appears on
    unlock. Its text **should be updated** to mention the new bindings,
    e.g. "WASD / arrows to move · Shift to sprint · Space to jump · mouse
    to look · ESC to release". Layout/CSS changes beyond the text are not
    required.

### Manual verification

20. Loading the page and clicking to lock: WASD walks at base speed.
    Holding Shift while walking visibly doubles speed (covers ground
    roughly twice as fast across the 50-unit grid).
21. Tapping Space while grounded produces a visible, smooth vertical arc:
    camera rises about 1.1 units above eye level, falls back down, and
    snaps to eye height on landing. Total airtime ≈ 0.6 s.
22. Holding Space does not produce a second jump on landing — the walker
    lands and stays grounded until Space is released and pressed again.
23. Pressing Space while airborne does nothing (no double jump, no
    velocity boost).
24. Sprint-then-jump covers more horizontal ground per jump than
    walk-then-jump. Releasing Shift at the apex of a sprint-jump does not
    slow the walker mid-air; pressing Shift at the apex of a walk-jump
    does not speed them up mid-air.
25. Walking off the edge during a jump still gets clamped — the walker
    cannot jump over the 50×50 boundary.
26. ESC mid-jump releases pointer lock, the overlay reappears, the walker
    completes its fall under gravity and lands. WASD/Shift/Space pressed
    while unlocked have no effect.
27. Browser devtools console shows no errors or warnings.

## Out of Scope

- Crouching, prone, sliding, wall-running, or any movement state beyond
  walk / sprint / jump.
- Stamina, cooldowns, sprint acceleration ramps, FOV-on-sprint, head bob,
  or any "feel" polish beyond the constants specified above.
- Double jump, coyote time, jump buffering across landings, variable jump
  height (tap-vs-hold), or any advanced jump tuning. Tap-to-jump,
  fixed-velocity, single-press is the entire mechanic.
- Collision against the cube or any other scene object — jumping onto the
  cube is not supported. The cube remains a pass-through visual prop.
- Fall damage, landing animations, dust particles, footstep audio, or any
  audiovisual feedback for sprint/jump.
- Touch / mobile / gamepad bindings. Desktop keyboard + mouse only.
- HUD elements (stamina bar, jump indicator, speedometer, crosshair).
- Persisting jump/sprint state across reloads.
- Adding TypeScript, a bundler, npm tooling, or any new runtime
  dependency. Three.js stays at its current pinned version.
- Automated tests / Playwright / visual regression — verification stays
  manual per the existing project pattern.

## Design Notes

- **Constants to declare near the existing `SPEED` / `HALF_EXTENT` block**:
  ```js
  const WALK_SPEED = 5;
  const SPRINT_MULTIPLIER = 2;
  const JUMP_VELOCITY = 7.5;
  const GRAVITY = 25;
  const AIR_CONTROL = 0.5;
  const EYE_HEIGHT = 1.6;
  ```
  Reusing the existing `SPEED` constant by renaming it to `WALK_SPEED` is
  fine. The existing `HALF_EXTENT` clamp is unchanged.
- **State to track across frames**: a vertical velocity `velocityY` (number),
  a grounded flag `isGrounded` (bool, derived from `camera.position.y`), an
  edge-triggered `jumpQueued` flag for Space, and the locked `airSpeed`
  captured at takeoff. All of these can live as plain `let` bindings in the
  module scope alongside the existing `keys` object.
- **Edge-triggered Space**: the current code uses a `keys[e.code]` map that
  stays `true` while held, which would re-trigger every frame. Either:
  (a) set `jumpQueued = true` in the `keydown` handler when `e.code ===
  'Space'` and `e.repeat === false`, then consume it once per frame in the
  loop and reset to `false` after consuming; or (b) track a `wasSpaceDown`
  flag and only jump on the rising edge. Either works — pick one.
- **Order of operations in the animation loop** (when locked):
  1. Read horizontal input vector (forward, right) and normalize.
  2. If `isGrounded`, compute `groundSpeed = keys.shift ? WALK_SPEED *
     SPRINT_MULTIPLIER : WALK_SPEED` and apply via `moveForward` / `moveRight`.
  3. If `isGrounded` and `jumpQueued`, set `velocityY = JUMP_VELOCITY`,
     capture `airSpeed = groundSpeed`, set `isGrounded = false`, clear
     `jumpQueued`.
  4. If not `isGrounded`, apply `velocityY -= GRAVITY * delta`, then
     `camera.position.y += velocityY * delta`. Apply horizontal input
     using `airSpeed * AIR_CONTROL` instead of the ground speed.
  5. If `camera.position.y <= EYE_HEIGHT`, snap to `EYE_HEIGHT`, zero
     `velocityY`, set `isGrounded = true`.
  6. Clamp `camera.position.x` / `.z` to `[-HALF_EXTENT, HALF_EXTENT]`.
- **Unlocked + airborne**: per criterion 15, gravity still integrates and
  the walker still lands; only the horizontal-input branch is gated on
  `controls.isLocked`. A simple way: separate the "read input" step
  (skipped when unlocked) from the "apply gravity / land" step (always
  runs while airborne).
- **Shift detection**: `keys['ShiftLeft']` or `keys['ShiftRight']` — both
  must work. Don't gate on a single-key check.
- **Why air control is locked at takeoff**: this is the standard "Quake-ish"
  feel the user asked for — sprint-jumping covers real distance, but
  letting go of Shift mid-air shouldn't suddenly slow you. The simplest
  implementation is to record `airSpeed` once at takeoff and never read
  Shift again until the walker lands.
- **No need to touch `PlaneGeometry`, `GridHelper`, lighting, or the
  cube.** The scene is the same; only the camera physics change.

## Agent Notes

- All edits in this worktree per `AGENTS.md` / `CLAUDE.md`. Do not touch
  the main checkout.
- The current implementation is single-file in `index.html` (inline
  `<script type="module">`). Extracting to `./main.js` is fine but not
  required — file size is still modest. If you do extract, keep the
  importmap in `index.html` and reference `./main.js` with a relative
  path, matching the convention noted in `first-person-navigation`.
- Do not bump the pinned `three` version. Do not add `package.json`,
  `vite.config.*`, or any GitHub Actions workflow.
- Do not introduce any library beyond Three.js itself. No tween library,
  no input-helper library, no physics engine — gravity here is one line
  of arithmetic.
- Verify by running `python3 -m http.server 8000` from the worktree root
  and walking through criteria 20–27 in a current browser. Watch the
  devtools console for warnings.
- README updates are optional; running and deploying are unchanged.
