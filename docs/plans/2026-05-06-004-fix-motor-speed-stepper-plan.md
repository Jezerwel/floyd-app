---
title: Replace motor speed sliders with +/- stepper controls
type: fix
status: active
date: 2026-05-06
---

# Replace Motor Speed Sliders with +/- Stepper Controls

## Overview

The `PctSlider` component on the Controls screen only responds to taps — users cannot drag the slider thumb. Replace it with compact inline +/- stepper buttons that provide reliable, predictable motor speed adjustment.

---

## Problem Frame

The current `PctSlider` in `app/(tabs)/controls.tsx` uses `TouchableOpacity` with `onPress`, which only supports tap-to-set. Users report they "cannot slide them and can only change value by tapping." The gesture-based `CustomSlider` and `VerticalSlider` components exist in `components/ui/` but are unused and have their own issues (tiny 18px thumb target, missing gesture context). Rather than fix the sliders, the user chose a stepper UI as simpler and more reliable on mobile.

---

## Requirements Trace

- R1. Feed Speed (auger) must be adjustable in 10% increments from 0–100%
- R2. Spread Speed (impeller) must be adjustable in 10% increments from 0–100%
- R3. Each tap of + or - changes the value by exactly 10 (no auto-repeat on hold)
- R4. The control must respect the existing disabled state (when disconnected or feeding)
- R5. Visual style must match existing design tokens (Colors, StatCard wrapper)

---

## Scope Boundaries

- Only the Controls screen (`app/(tabs)/controls.tsx`) is changed
- `CustomSlider.tsx`, `VerticalSlider.tsx`, and `PaddleControl.tsx` are pre-existing dead code — left untouched
- No changes to motor logic, MQTT transport, or ESP32 communication
- No changes to the Schedule screen or any other screen

---

## Context & Research

### Relevant Code and Patterns

- `app/(tabs)/controls.tsx` — the target file; contains inline `PctSlider`, two `StatCard` wrappers for feed/spread speed
- `constants/Colors.ts` — color tokens (primary teal, secondary sea green, card, border, muted, text)
- `components/ui/StatCard.tsx` — wrapper used for speed sections
- `components/ui/IconSymbol.tsx` — icon component used throughout
- The existing `numberInput` style in controls.tsx shows the established input aesthetic (rounded, bordered)

### Institutional Learnings

- None relevant to this change

---

## Key Technical Decisions

- **Stepper over slider fix**: The user explicitly prefers +/- buttons. Steppers are more reliable on mobile — no gesture conflicts, no thumb hit-target issues, predictable increments.
- **Inline component (not extracted)**: The stepper is used twice (feed speed, spread speed). Per simplicity-first principle, keep it as a local component in `controls.tsx` rather than creating `components/ui/StepperControl.tsx`. Extract only if reused elsewhere later.
- **Step of 10**: Balances speed of adjustment with adequate granularity. Motor PWM is 0–1023 (10.23× multiplier), so a 10% step maps to ~102 PWM units — more than sufficient precision for a fish feeder.
- **Tap-only, no hold-repeat**: User chose simplicity. No timer/interval logic needed.

---

## Open Questions

### Resolved During Planning

- Interaction model: +/- stepper (not slider fix) — confirmed by user
- Layout: compact inline row `[–] 75% [+]` — confirmed by user
- Step size: 10 — confirmed by user
- Auto-repeat: no — confirmed by user

### Deferred to Implementation

- Exact pixel sizing of buttons — adjust visually after seeing rendered result
- Whether to add haptic feedback on +/- tap — can evaluate during implementation

---

## Implementation Units

- [x] U1. **Replace PctSlider with StepperControl in controls.tsx**

**Goal:** Remove the broken `PctSlider` component and add an inline `StepperControl` component. Wire it to both Feed Speed and Spread Speed `StatCard` sections.

**Requirements:** R1, R2, R3, R4, R5

**Dependencies:** None

**Files:**

- Modify: `app/(tabs)/controls.tsx`

**Approach:**

- Delete the `PctSlider` function component (lines 26–62)
- Add a new `StepperControl` function component above the default export
- `StepperControl` props: `{ value, onValueChange, color, disabled }` — same interface as `PctSlider` so the call sites change minimally
- UI: `[–] [value%] [+]` in a horizontal row using `TouchableOpacity` for buttons, `Text` for value
- Disable both buttons and dim when `disabled` is true
- On press: clamp new value to 0–100, rounding to nearest 10
- Use existing `styles` from the file — add stepper-specific styles
- Keep the existing `sliderRow` style for the value text, add new button styles
- Both `StatCard` usages (Feed Speed, Spread Speed) switch from `<PctSlider>` to `<StepperControl>` — props are identical (`value`, `onValueChange`, `color`)

**Patterns to follow:**

- Button styling: match the existing `numberInput` style (rounded, bordered, same color tokens)
- Disabled state: match existing `opacity: disabled ? 0.5 : 1` pattern from `PctSlider`
- Color usage: `color + "20"` for background tint, `color` for active elements — same as `PctSlider`

**Test scenarios:**

- Happy path: Tap + when value is 50 → value becomes 60. Tap - when value is 50 → value becomes 40
- Edge case: Tap + at 100 → value stays 100 (clamped). Tap - at 0 → value stays 0 (clamped)
- Edge case: Tap + at 95 → value becomes 100 (rounds to nearest 10). Tap - at 3 → value becomes 0
- Disabled state: When `disabled` is true, tapping buttons does not call `onValueChange`
- State: `onValueChange` is called with the correct new value, parent state updates, display reflects new value

**Verification:**

- Both Feed Speed and Spread Speed use `StepperControl` instead of `PctSlider`
- Tapping +/- changes the displayed value by 10, clamped 0–100
- Buttons are visually disabled and non-responsive when feeding or disconnected
- Visual style matches the app's design tokens (teal for feed, sea green for spread)

---

## System-Wide Impact

- **Interaction graph:** None — the stepper only calls `setAugerSpeed` / `setImpellerSpeed`, same as the old slider
- **Error propagation:** No new error paths
- **State lifecycle risks:** None — local React state only
- **API surface parity:** N/A — pure UI change
- **Integration coverage:** The existing `handleFeed` function reads `augerSpeed` and `impellerSpeed` — verify feed still sends correct values after UI change
- **Unchanged invariants:** `startFeed` receives the same `augerSpeed * 10.23` and `impellerSpeed * 10.23` values; MQTT message format unchanged; Schedule screen untouched

---

## Risks & Dependencies

| Risk                                           | Mitigation                                                                                      |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Stepper at coarse step (10) may feel imprecise | User chose step of 10 explicitly. If feedback changes, step is trivial to adjust (one constant) |

---

## Documentation / Operational Notes

- No docs to update — this is a UI polish fix with no behavioral change
