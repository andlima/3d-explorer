---
id: mobile-touch-controls
area: frontend
priority: 50
depends_on: [first-person-navigation, sprint-and-jump, camera-mode-aim-shoot, viewfinder-capture]
description: Add an auto-detected touch control layer (left virtual joystick to move, right-side drag-to-look, on-screen jump/sprint/regenerate/camera buttons, pinch-to-zoom FOV, shutter capture) so the explorer is fully playable on a phone without regressing the desktop pointer-lock flow
---

# Mobile Touch Controls

## Goal

Make the explorer fully playable on a touch phone. Today every input path is
gated on `PointerLockControls.isLocked`, which never engages on mobile (no
pointer lock, no keyboard, no mouse wheel), so the scene is unreachable on a
phone. Add a touch control layer — a left virtual joystick to move, drag the
rest of the screen to look, and on-screen buttons for the remaining desktop
actions — that activates **only on touch devices** and leaves the desktop
pointer-lock experience byte-for-byte unchanged.

## Acceptance Criteria

1. **Touch detection & activation.** On load, detect a touch device via
   `('ontouchstart' in window) || navigator.maxTouchPoints > 0`. Only when
   true does the touch UI exist/show (e.g., gate it behind a class added to
   `<body>`). On a non-touch device nothing about the page changes.
2. **Session start.** On a touch device, tapping the `#lock-overlay` ("Click
   to play") starts a touch session instead of requesting pointer lock:
   introduce a `mobileActive` flag, set it true, and hide the overlay
   (reuse the existing `.hidden` mechanism). `controls.lock()` is **not**
   called on touch devices (pointer lock is unavailable and must not be
   relied on). On desktop, the tap still calls `controls.lock()` exactly as
   today.
3. **Unified active gate.** Introduce a single predicate (e.g.
   `isSessionActive()` returning `controls.isLocked || mobileActive`) and use
   it everywhere movement/capture is currently gated on `controls.isLocked`
   — specifically the per-frame movement block (currently
   `if (controls.isLocked)` around index.html:1524) and the capture handler
   (currently `!controls.isLocked` around index.html:686). Desktop behavior
   must be identical (when not on touch, `mobileActive` is always false).
4. **Move — virtual joystick.** A thumbstick anchored in the lower-left
   produces a normalized 2-D vector (forward/strafe, each in [-1, 1], with a
   small dead zone) that feeds the **existing** movement math. When the
   joystick is engaged it supplies the `forward`/`right` inputs the keyboard
   currently supplies; keyboard handling stays intact for desktop. Diagonal
   magnitude is still clamped to 1 as today. Movement respects terrain,
   collision, world bounds, gravity, and ground/air speed exactly as the
   keyboard path does (no new physics).
5. **Look — drag.** Dragging anywhere on the screen that is not the joystick
   or a button rotates the camera: horizontal drag = yaw, vertical drag =
   pitch, scaled by a tunable sensitivity constant. Pitch is clamped to
   roughly ±85° (mirror PointerLockControls' polar clamp; never allow flip).
   Look state is owned by the touch layer (track yaw/pitch directly and apply
   to the camera) and must not fight PointerLockControls (on touch, PLC never
   locks, so its mousemove handler never runs).
6. **Multi-touch independence.** Moving (left thumb on joystick) and looking
   (right thumb dragging) work **simultaneously**, and either works while a
   button is held. Track touches by pointer/touch identifier so the joystick,
   look-drag, pinch, and button taps never steal each other's input.
7. **Jump button.** A button performs the same action as Space: sets
   `jumpQueued = true` (one jump per press; respects the existing
   grounded/air logic). Holding it does not auto-repeat jumps.
8. **Sprint control.** A sprint control ORs into the existing sprint test
   (currently `keys['ShiftLeft'] || keys['ShiftRight']`, used in both the
   speed calc and the jump speed calc). Implement it as a **toggle** (tap to
   turn sprint on, tap again to turn it off) since holding a button while
   driving joystick + look is impractical; reflect the on/off state visually
   on the button. Sprint multiplier value is unchanged.
9. **Regenerate button.** A button performs the same action as `R`: sets
   `regenerateRequested = true` and calls `hideInfoCard()`,
   `hideTargetToast()`, `hideFailureToast()` — i.e. it must mirror the
   existing `KeyR` handler exactly.
10. **Camera-mode button.** A button toggles `cameraMode` with the **exact**
    side effects of the current `KeyC` branch: toggle `#viewfinder` and
    `#cam-indicator` `.visible`, and on turn-off reset `targetFov` to
    `DEFAULT_FOV`, remove `#viewfinder .locked`, and hide the failure toast.
    Refactor so the `KeyC` handler and the button call one shared function
    (no logic duplication / drift).
11. **FOV pinch zoom.** While `cameraMode` is on, a two-finger pinch in the
    look region adjusts `targetFov` within `[MIN_FOV, MAX_FOV]` (pinch out =
    zoom in / narrower FOV, matching the camera metaphor), replacing the
    mouse wheel. While two fingers are down for a pinch, look-drag is
    suppressed so the gestures don't conflict. The existing FOV ramp toward
    `targetFov`, the focal-length readout, and the reticle lock all continue
    to work off the rendered `camera.fov` as today.
12. **Shutter / capture button.** In camera mode a shutter button performs
    the exact center-reticle capture decision currently in the `mousedown`
    handler: raycast from `aimNdc` against props+targets, then branch —
    non-captured target & framed → `captureTarget`; non-captured target &
    not framed → `showFailureToast`; captured target → no-op (no toast);
    prop → highlight + `showInfoCard`; no hit → nothing. Refactor so
    `mousedown` and the shutter button call one shared capture function
    (no logic duplication / drift). The per-frame focus-lock reticle
    (index.html:1479, keyed only on `cameraMode`) continues to work on
    touch unchanged.
13. **Camera-only controls visibility.** The shutter button (and any
    pinch/zoom affordance) is only present/active when `cameraMode` is on,
    mirroring how `#viewfinder` and `#cam-indicator` are shown. Move/look/
    jump/sprint/regenerate controls are available whenever the touch session
    is active.
14. **No HUD collision.** Touch controls must not overlap or occlude the
    existing HUD: `#cam-indicator` (top-left), `#catalog-counter`
    (top-right), `#target-toast` (top-right under the counter),
    `#info-card` and `#vf-failure-toast` (bottom-center), and the viewfinder
    corner brackets/vignette/reticle. Suggested layout: joystick lower-left,
    action-button cluster lower-right, clear of the bottom-center info-card
    band.
15. **Gesture isolation.** The touch UI must not trigger browser scrolling,
    page pinch-zoom, pull-to-refresh, or text selection (e.g.
    `touch-action: none` and `overscroll-behavior: none` on the touch layer,
    `user-select: none`). Prefer this over disabling the page viewport;
    only adjust the `viewport` meta if strictly necessary and document why.
16. **Regenerate / resize robustness.** After `R` or the regenerate button
    (which calls `resetPlayerToSpawn()`), look state is re-synced to the
    camera's reset orientation (no stale yaw/pitch), the joystick releases to
    neutral, sprint toggle/cameraMode are not silently corrupted, and no
    stuck failure toast — matching how the desktop `KeyR` path already
    behaves. On window resize / orientation change the controls stay
    correctly anchored (CSS-based positioning; no per-frame layout math) and
    the existing resize handler (camera aspect + renderer size) still runs.
17. **Desktop regression-free.** On a non-touch device: pointer lock,
    WASD/arrows, Shift sprint, Space jump, `R`, `C`, mouse-look, mouse-wheel
    FOV, left-click capture, ESC release, and the lock-overlay copy all
    behave exactly as before this task. No touch DOM is shown and no touch
    listeners alter desktop input.

## Out of Scope

- Any change to desktop behavior: pointer lock, keyboard, mouse-move look,
  mouse wheel, left-click capture, ESC, and the desktop overlay flow stay
  identical.
- New gameplay or actions beyond touch-equivalents of existing desktop
  actions. No new mechanics.
- Gamepad / external controller support, device-orientation/gyro look, or
  haptics/vibration.
- Tuning game balance: walk/sprint speed, jump, gravity, `MIN_FOV`/
  `MAX_FOV`, `CAPTURE_MIN_FRAME_FRACTION`, etc. stay at current values.
- Restyling or repositioning the existing HUD/viewfinder beyond the minimum
  needed to keep touch controls from overlapping them.
- A settings/options UI, sensitivity sliders, or remappable controls
  (a single tunable sensitivity *constant* in code is enough).
- PWA/offline/install, the Fullscreen API, or a wake-lock. Optional, not
  required; do not add unless trivial and clearly non-regressing.
- Responsive art/texture/lighting changes for small screens.

## Design Notes

- **Single-file project.** All changes go in `index.html`: CSS in the
  existing `<style>` block (alongside `#lock-overlay`, `#viewfinder`,
  `#cam-indicator`, etc.), markup near the existing HUD nodes, JS in the
  existing module `<script>`.
- **Key existing anchors** (line numbers approximate, verify before editing):
  - `#lock-overlay` markup ~index.html:254 and CSS ~index.html:17; its
    click handler ~index.html:636.
  - `PointerLockControls` construction ~index.html:634; `controls.isLocked`
    gates the movement block ~index.html:1524 and the capture handler
    ~index.html:686.
  - `keydown` handler (`Space`/`KeyR`/`KeyC`) ~index.html:649; `wheel`
    handler ~index.html:672; `mousedown` capture ~index.html:685;
    `keyup` ~index.html:707; `resize` ~index.html:711.
  - Camera-mode constants `DEFAULT_FOV`/`MIN_FOV`/`MAX_FOV` ~index.html:557;
    `cameraMode`, `targetFov` ~index.html:567; `aimNdc` ~index.html:573.
  - Movement reads `keys['KeyW'...]`, sprint test `keys['ShiftLeft'] ||
    keys['ShiftRight']` ~index.html:1525–1568; `jumpQueued`,
    `regenerateRequested` ~index.html:647; per-frame focus-lock raycast
    ~index.html:1479; FOV ramp ~index.html:1466; `resetPlayerToSpawn`
    used in the regenerate block ~index.html:1462.
  - `captureTarget`, `showInfoCard`/`hideInfoCard`,
    `showTargetToast`/`hideTargetToast`, `showFailureToast`/
    `hideFailureToast`, `isTargetFramed` are defined ~index.html:584–632.
- **Refactor for shared logic** (so desktop and touch can't drift):
  - Extract the `KeyC` body into e.g. `toggleCameraMode()`; call it from
    `keydown` and the camera button.
  - Extract the `mousedown` capture branch into e.g. `performCapture()`
    (uses `aimNdc`, the props+targets intersect list, and the existing
    branch decision); call it from `mousedown` and the shutter button.
  - Replace the raw `controls.isLocked` gates with `isSessionActive()`.
- **Look math.** Maintain `touchYaw`/`touchPitch` numbers. On look-drag,
  add `-dx * SENS` to yaw and `-dy * SENS` to pitch, clamp pitch to about
  `±(Math.PI/2 - 0.1)`, then apply via
  `camera.quaternion.setFromEuler(new THREE.Euler(touchPitch, touchYaw, 0,
  'YXZ'))`. Initialize `touchYaw`/`touchPitch` from the camera's current
  orientation when the touch session starts and again after
  `resetPlayerToSpawn()`. `controls.moveForward`/`moveRight` derive
  direction from the camera, so movement keeps working with this approach.
- **Joystick.** A base circle + draggable knob; output = clamped
  `(touch - center) / JOYSTICK_RADIUS_PX` with a dead zone. Feed its
  forward/right into the same place keyboard input is consumed in the
  movement block, e.g. choose joystick input when the stick is engaged,
  else fall back to `keys[...]` (keyboard path unchanged for desktop).
- **Pinch.** When exactly two pointers are down in the look region and
  `cameraMode` is on, compute the distance between them; map the per-move
  delta in distance to a `targetFov` delta clamped to `[MIN_FOV, MAX_FOV]`.
  Suppress single-finger look while a pinch is in progress.
- **Add constants** near index.html:557, e.g. `TOUCH_LOOK_SENSITIVITY`,
  `TOUCH_PINCH_FOV_SENSITIVITY`, `JOYSTICK_RADIUS_PX`,
  `JOYSTICK_DEADZONE` — single source of truth, tune after device testing.
- **Events.** Prefer Pointer Events (`pointerdown`/`pointermove`/
  `pointerup`/`pointercancel`) with `setPointerCapture` and per-pointer id
  tracking; this cleanly supports simultaneous joystick + look + buttons.
  Use `e.preventDefault()` on the touch layer to stop synthetic
  mouse/scroll, but ensure desktop mouse paths are untouched.
- **Z-index / pointer-events.** The full-screen look surface sits above the
  canvas but below the overlay (`z-index: 10`) and below the HUD; the
  joystick and buttons are interactive (`pointer-events: auto`) while the
  look surface is a transparent catch-all. HUD elements remain
  `pointer-events: none` as today.
- **No verify gates** are configured (`.spec.toml`); validation is the
  manual test plan below. Keep the change additive — plain JS, no build,
  three via the existing importmap.

## Agent Notes

- Read `AGENTS.md` and `CLAUDE.md` first. **All edits happen in this
  worktree** — never the main checkout.
- Read the anchors listed in Design Notes before writing code; match the
  existing conventions (DOM created in markup, classes toggled for
  visibility, timers/flags consumed in the animate loop, shared functions
  over duplicated branches).
- Touch testing without a phone: use browser devtools device emulation
  with **touch simulation on** (Chrome DevTools device toolbar / responsive
  mode) served via `python3 -m http.server 8000`. Note in the completion
  summary that on-hardware verification is recommended but emulator-tested.
- Manual test plan (emulated touch device):
  1. Load with touch emulation on → mobile UI visible; tap overlay → session
     starts (overlay hidden), no pointer-lock error in console.
  2. Drag left joystick → walk in the dragged direction; release → stop.
  3. Drag the right side → camera yaws/pitches; pitch can't flip over.
  4. Joystick + right-side drag at the same time → move and look together.
  5. Jump button → single hop; Sprint toggle → faster move, button shows
     on-state; toggle off → normal speed.
  6. Camera button → viewfinder + `CAM ON` appear; shutter button appears.
  7. Pinch out/in in camera mode → focal-length readout changes within the
     existing range; reticle locks on a well-framed target.
  8. Shutter on a framed target → capture (counter increments, catalog
     toast); on an unframed target → failure toast, counter unchanged;
     on a captured target → no-op; on a prop → info-card.
  9. Regenerate button and the camera button match `R` / `C` exactly; after
     regenerate, look isn't stuck, no stale toast, joystick neutral.
  10. Rotate / resize the viewport → controls stay anchored, scene resizes,
      no page scroll/zoom from dragging on the canvas.
  11. **Desktop regression pass (touch emulation OFF):** pointer lock,
      WASD/arrows, Shift, Space, R, C, mouse-look, wheel FOV, left-click
      capture, ESC — all behave exactly as before; no mobile DOM present.
- Do not regress: first-person navigation, collision/terrain, sprint/jump,
  day/night, fog, water, trees, target placement/animation, the catalog
  counter, successful-capture toast, prop info-card, or the viewfinder.
