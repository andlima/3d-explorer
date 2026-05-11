---
id: viewfinder-capture
area: frontend
priority: 50
depends_on: [camera-mode-aim-shoot, catalog-targets]
description: Replace the simple camera-mode crosshair with a viewfinder overlay and require players to frame targets in-shot (zoom and/or proximity) to capture them; failed attempts emit a transient on-screen toast
---

# Viewfinder Capture

## Goal

Make camera mode feel like looking through a real viewfinder, and require the
player to actually *frame* a target — by zooming in, moving closer, or both —
before a capture attempt succeeds. Captures that are not framed tightly enough
fail with a brief on-screen toast, turning the catalog from a tap-to-collect
loop into a deliberate photography mechanic.

## Acceptance Criteria

1. While camera mode is active, a viewfinder overlay replaces the simple
   crosshair. The overlay includes, at minimum:
   - Four corner frame brackets inset from the viewport edges (L-shaped),
   - A soft radial vignette darkening the peripheral viewport,
   - A focal-length readout (e.g., `21mm`, `68mm`) derived from the current
     FOV using a 35mm-sensor approximation, positioned so it does not
     collide with `#cam-indicator` (top-left), `#catalog-counter`
     (top-right), `#target-toast` (top-right under the counter), or
     `#info-card` (bottom-center). Suggested position: just below the
     center reticle or in the bottom-left.
   - A central focus reticle that replaces the current simple `+`
     crosshair.
2. The viewfinder overlay is only visible when `cameraMode` is on, mirroring
   the current visibility toggle used for `#crosshair` and `#cam-indicator`.
   Exiting camera mode (pressing C again) hides the entire viewfinder
   overlay including brackets, vignette, focal-length readout, and reticle.
3. The focal-length readout updates live as the player scrolls the mouse
   wheel to change FOV. The displayed value is rounded to whole millimeters
   and derived from the *rendered* `camera.fov` (so it reflects the smooth
   FOV ramp, not the instantaneous `targetFov` step).
4. The focus reticle has two visual states:
   - **Idle / not framed**: a neutral color (e.g., white with subtle
     stroke). Used whenever the crosshair is not over a capturable target,
     or is over a target that is not framed tightly enough.
   - **Focus lock**: a highlighted color (e.g., saturated green or yellow)
     plus a clear secondary cue (e.g., brackets closing in around the
     reticle, or a small `LOCK` label). Shown when the crosshair is over a
     non-captured target AND the framing test (see AC 5) passes for that
     target.
5. "Framed tightly enough" is determined by the target's apparent on-screen
   size with the *current rendered* FOV and the camera-to-target distance,
   not by FOV alone. Concretely:
   ```
   const distance = camera.position.distanceTo(target.mesh.position);
   const angularRadius = Math.atan2(TARGET_RADIUS, distance);
   const halfVFov = (camera.fov * Math.PI / 180) / 2;
   const frameFraction = angularRadius / halfVFov;  // 0..1 of half-height
   const framed = frameFraction >= CAPTURE_MIN_FRAME_FRACTION;
   ```
   A starting threshold of `CAPTURE_MIN_FRAME_FRACTION ≈ 0.16` (target
   subtends ~8% of total viewport height) is the default; the implementer
   may tune within ~0.12–0.20 to feel right after playtesting.
6. On left-click in camera mode while pointer-locked, the existing raycast
   resolves the closest hit (props + targets, as today). The capture
   decision then branches:
   - Hit is a **non-captured target AND framing test passes** → capture as
     before (existing flow: dim emissive, stop bob/rotation, increment
     `capturedCount`, refresh `#catalog-counter`, show the catalog entry
     toast via the existing `#target-toast` path).
   - Hit is a **non-captured target AND framing test fails** → no capture;
     show a transient failure toast (~1.5s) with a short message such as
     `OUT OF FRAME — ZOOM IN OR GET CLOSER`. `capturedCount` and target
     state are unchanged.
   - Hit is a **captured target** → no-op, no toast (matches existing
     behavior from `catalog-targets`).
   - Hit is a **prop** → existing prop info-card flow, unchanged.
   - Raycast hits nothing → unchanged (no toast).
7. The failure toast is a styled DOM element (similar to `#target-toast`),
   NOT `window.alert()`. It must not disrupt pointer lock, input, or the
   render loop. Rapid repeated failed clicks reset the toast's display
   timer (latest message stays visible for its full duration) rather than
   queueing multiple toasts.
8. The focus-lock reticle state and the capture decision use the *same*
   framing rule, evaluated against the same target. If the reticle shows
   `LOCK` while the player is aiming at a target, clicking captures it; if
   it does not show `LOCK`, clicking that target fails with the toast.
   This means: the per-frame focus-lock check raycasts from the screen
   center using the same `aimNdc` and the same intersect list as the
   click-time raycast.
9. Existing camera-mode behaviors are preserved unchanged:
   - C still toggles `cameraMode`,
   - mouse wheel still adjusts `targetFov` within [`MIN_FOV`, `MAX_FOV`],
   - the FOV ramp toward `targetFov` in the animate loop still runs,
   - exiting camera mode still resets `targetFov` to `DEFAULT_FOV`,
   - `#cam-indicator` ("CAM ON"), `#catalog-counter`, the existing
     successful-capture `#target-toast`, and the prop `#info-card` all
     continue to work and stay positioned where they are today.
10. Pressing R regenerates the world (including targets and counter) as
    today. The viewfinder overlay, focal-length readout, and reticle
    behave correctly across regenerations (no stale focus-lock state, no
    stuck failure toast). The failure toast hides on regenerate, matching
    how `hideInfoCard()` and `hideTargetToast()` are already called from
    the `KeyR` handler.
11. Window resize keeps the overlay correctly placed: corner brackets stay
    near corners, vignette covers the new viewport, the focal-length
    readout and reticle stay anchored. CSS-based positioning is fine;
    no per-frame layout math is required.

## Out of Scope

- Sound effects (shutter click, focus beep, etc.).
- A photo gallery, screenshot capture, or saving images of the scene.
- Manual focus mechanics, focus rings, or depth-of-field blur. The
  "focus" in this spec is purely a framing check, not optical focus.
- Restyling or repositioning existing HUD elements (`#cam-indicator`,
  `#catalog-counter`, `#info-card`, `#target-toast`) beyond what is
  required to coexist with the new viewfinder overlay.
- Penalizing failed captures (no cooldown, no failure counter, no UI
  hint about how many failures occurred).
- Showing numeric distance or size readouts to the player. The
  viewfinder telegraphs framing only via the reticle's lock state.
- Changing how props are captured/inspected. Props use the existing
  info-card path with no framing requirement.
- Adjusting target placement, glow, animation, or catalog entries (those
  are owned by `catalog-targets`).
- Adding a "look through viewfinder" zoom envelope different from the
  existing `MIN_FOV` / `MAX_FOV` (~20°–60°). Keep the existing range.

## Design Notes

- Single-file project: all changes go in `index.html`. CSS sits in the
  existing `<style>` block alongside `#crosshair`, `#cam-indicator`,
  `#info-card`, `#catalog-counter`, `#target-toast`.
- Add new constants near the existing camera-mode constants (`DEFAULT_FOV`,
  `MIN_FOV`, `MAX_FOV`, `HIGHLIGHT_DURATION`, `INFO_DURATION`):
  - `CAPTURE_MIN_FRAME_FRACTION` (default ~0.16): minimum
    `angularRadius / halfVFov` for a successful capture.
  - `FAILURE_TOAST_DURATION` (default ~1.5): seconds the failure toast
    stays visible.
  - `VIEWFINDER_SENSOR_HEIGHT_MM` (default ~24): used for the 35mm-sensor
    focal-length conversion.
- Focal length conversion from `camera.fov` (Three.js's vertical FOV in
  degrees):
  ```
  focal_mm = VIEWFINDER_SENSOR_HEIGHT_MM
             / (2 * tan(camera.fov * Math.PI / 180 / 2));
  ```
  Round to whole mm. At fov=60° this is ~21mm; at fov=20° it's ~68mm.
- Framing check is just the snippet in AC 5. Used in two places:
  (a) once per frame in the animate loop to set the reticle's lock state,
  (b) inside the `mousedown` handler to decide capture vs. failure.
  Use `camera.fov` (the rendered FOV after the ramp), not `targetFov`,
  so what the player sees matches what is checked.
- Per-frame focus-lock state: in the existing animate loop (after the FOV
  ramp), raycast once from `aimNdc` against the same intersect list used
  by `mousedown`. If the closest hit is a non-captured target and the
  framing check passes, set the reticle into LOCK state; otherwise reset
  to idle. A single extra raycast per frame against ~tens of meshes is
  cheap given the existing per-frame work.
- DOM structure suggestion (any equivalent structure is acceptable):
  - Wrap viewfinder pieces in a `#viewfinder` container that is shown
    when camera mode is on (replaces the visibility toggle currently on
    `#crosshair`); or keep `#crosshair` and add sibling elements
    (`#vf-brackets`, `#vf-vignette`, `#vf-focal`, `#vf-failure-toast`).
  - Vignette: one fixed-position `div` with `background:
    radial-gradient(...)`, `pointer-events: none`. Tune the gradient stops
    so the center stays fully transparent and the corners are noticeably
    darker (~60–80% black) without occluding the brackets.
  - Corner brackets: four absolutely-positioned `div`s with two CSS
    borders each (top+left, top+right, bottom+left, bottom+right) to form
    L-shapes. Inset ~8–12% from each edge.
  - Reticle: a small fixed-position element with two states toggled by a
    class (e.g., `.lock`). Idle is a circle or `+`; lock adds a colored
    stroke and the `LOCK` label or closing brackets.
- Failure toast: keep it a separate DOM element from `#target-toast` so a
  successful capture toast and a failed-capture toast never share state.
  Position near center-bottom or just below the reticle. Style consistent
  with the existing toasts (semi-transparent dark background, monospace
  font, fade or quick show/hide via a `.visible` class).
- Reuse the existing per-toast timer pattern: a `failureToastTimer`
  variable updated in the animate loop, mirroring `infoTimer` and
  `targetToastTimer`. Reset to `FAILURE_TOAST_DURATION` on each failed
  click; tick down each frame; hide at zero.

## Agent Notes

- Read `AGENTS.md` and `CLAUDE.md` first. All edits must happen in this
  worktree (do not edit the main checkout).
- Read these sections of `index.html` before adding code:
  - the `<style>` block defining `#crosshair`, `#cam-indicator`,
    `#info-card`, `#catalog-counter`, `#target-toast`,
  - the `keydown` handler for `KeyC` and `KeyR`,
  - the `wheel` handler that adjusts `targetFov`,
  - the `mousedown` handler that does the capture raycast,
  - `captureTarget`, `showInfoCard`, `hideInfoCard`, `showTargetToast`,
    `hideTargetToast`,
  - the animate loop, in particular the FOV ramp block.
  The new code should follow the same conventions (DOM elements created
  in markup, classes toggled for visibility, timers decremented in the
  animate loop).
- Test plan (manual, in a browser):
  1. Serve the repo (`python3 -m http.server 8000`) and open the page.
  2. Click to lock, press C — the viewfinder overlay appears (corner
     brackets, vignette, focal-length readout, new reticle); the old `+`
     crosshair is no longer the visible reticle.
  3. Scroll the mouse wheel — the focal-length readout changes (smaller
     mm at wider FOV, larger mm at narrower FOV).
  4. Aim at a distant glowing target without zooming — reticle stays in
     idle state; left-click — failure toast appears (e.g.,
     `OUT OF FRAME — ZOOM IN OR GET CLOSER`) and the counter does not
     change.
  5. Zoom in (scroll up) until the target fills more of the frame — the
     reticle flips to LOCK; left-click — target captures (dims, stops
     bobbing), counter increments, catalog entry toast appears as before.
  6. Walk close to another target at default FOV — reticle locks at
     short range; capture works without zoom. Confirms framing depends
     on screen-space size, not FOV alone.
  7. Aim at a regular prop — reticle stays idle (props are not
     capturable); left-click shows the prop info-card as before.
  8. Aim at an already-captured target — reticle stays idle; left-click
     is a no-op (no toast).
  9. Press R — overlay still works, counter resets, no stuck reticle or
     toast state.
  10. Press C to exit camera mode — entire overlay disappears.
  11. Resize the window — brackets, vignette, readout, and reticle stay
      correctly placed.
- Keep the change additive — do not regress: prop info-card flow,
  day/night cycle, fog, water animation, target placement/animation,
  movement and collision, sprint/jump, or the existing catalog counter
  and successful-capture toast.
