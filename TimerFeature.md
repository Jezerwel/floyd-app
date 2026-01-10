
# Plan of Action: Feeder Timer Feature

This document outlines the plan to add a timer feature to the Floyd app, allowing users to set a specific duration for the fish feeder dispenser.

## 1. UI Enhancements in `controls.tsx`

- **Add a Timer Slider:**
  - Integrate a `CustomSlider` component into the "Feed Dispenser" card.
  - This slider will allow users to select a duration (e.g., 1-30 seconds).
- **Display Selected Duration:**
  - Add a `Text` component to show the currently selected timer value.
- **Update Button Logic:**
  - The "Start Feeding" button will be modified to use the selected duration when activating the dispenser.

## 2. State Management in `controls.tsx`

- **`timerDuration` State:**
  - Introduce a new state variable, `const [timerDuration, setTimerDuration] = useState(5);`, to hold the slider's value.
  - The slider will update this state.

## 3. `useESP8266` Hook Modification

- **Update `toggleRelay` Function:**
  - The `toggleRelay` function in `useESP8266Context.tsx` will be updated to accept an optional `duration` parameter.
  - When `duration` is provided, the WebSocket message sent to the ESP8266 will be in the format `START:${duration}`.
  - If no duration is provided, it will fall back to the existing `START` and `STOP` commands.

## 4. ESP8266 Firmware Update

- **Modify `ESP8266_WebSocket_Server.ino`:**
  - The WebSocket message handler will be updated to parse commands like `START:10`.
  - When such a command is received, the firmware will:
    1. Turn the relay ON.
    2. Start a non-blocking timer for the specified duration.
    3. Turn the relay OFF when the timer completes.

## 5. Implementation Steps

1. **Modify `controls.tsx`:** Add the slider and state management.
2. **Update `useESP8266Context.tsx`:** Modify the `toggleRelay` function.
3. **Update `ESP8266_WebSocket_Server.ino`:** Implement the timer logic in the firmware.
4. **Test:** Thoroughly test the feature to ensure it works as expected.
