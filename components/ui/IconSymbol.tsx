// Fallback for using MaterialIcons on Android and web.

import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { SymbolWeight } from "expo-symbols";
import { OpaqueColorValue, type StyleProp, type TextStyle } from "react-native";

export type IconSymbolName = keyof typeof MAPPING;

/**
 * Add your SF Symbols to Material Icons mappings here.
 * - see Material Icons in the [Icons Directory](https://icons.expo.fyi).
 * - see SF Symbols in the [SF Symbols](https://developer.apple.com/sf-symbols/) app.
 */
const MAPPING = {
  clock: "access-time",
  "clock.fill": "access-time",
  "house.fill": "home",
  "paperplane.fill": "send",
  "chevron.left.forwardslash.chevron.right": "code",
  "chevron.right": "chevron-right",
  "chevron.up": "keyboard-arrow-up",
  "chevron.down": "keyboard-arrow-down",
  "gearshape.fill": "settings",
  gear: "settings",
  thermometer: "thermostat",
  wifi: "wifi",
  "wifi.slash": "signal-wifi-off",
  "arrow.clockwise": "refresh",
  "arrow.triangle.2.circlepath": "sync",
  "arrow.trianglehead.2.counterclockwise": "restore",
  "bell.fill": "notifications",
  "bookmark.fill": "bookmark",
  "play.fill": "play-arrow",
  "stop.fill": "stop",
  "slider.horizontal.3": "tune",
  "arrow.counterclockwise": "undo",
  "drop.fill": "opacity",
  "exclamationmark.triangle.fill": "warning",
  "exclamationmark.circle.fill": "error",
  "checkmark.circle.fill": "check-circle",
  "xmark.circle.fill": "cancel",
  "info.circle": "info",
  "info.circle.fill": "info",
  "questionmark.circle": "help",
  circle: "radio-button-unchecked",
  checkmark: "check",
  exclamationmark: "priority-high",
  lightbulb: "lightbulb-outline",
  "lightbulb.fill": "lightbulb",
  "archivebox.fill": "inventory",
  power: "power",
  "poweroff": "power-settings-new",
  xmark: "close",
  link: "link",
  trash: "delete",
  globe: "language",
  bell: "notifications-none",
  "server.rack": "dns",
  "antenna.radiowaves.left.and.right": "settings-input-antenna",
  waveform: "graphic-eq",
  "bell.badge": "notifications-active",
} as const;

/**
 * An icon component that uses native SF Symbols on iOS, and Material Icons on Android and web.
 * This ensures a consistent look across platforms, and optimal resource usage.
 * Icon `name`s are based on SF Symbols and require manual mapping to Material Icons.
 */
export function IconSymbol({
  name,
  size = 24,
  color,
  style,
}: {
  name: IconSymbolName;
  size?: number;
  color: string | OpaqueColorValue;
  style?: StyleProp<TextStyle>;
  weight?: SymbolWeight;
}) {
  return (
    <MaterialIcons
      color={color}
      size={size}
      name={MAPPING[name]}
      style={style}
    />
  );
}
