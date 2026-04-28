import { Platform, type ViewStyle } from "react-native";

type ShadowSet = Record<"none" | "card" | "modal" | "sheet", ViewStyle>;

const iosShadows: ShadowSet = {
  none: {},
  card: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
  },
  modal: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
  },
  sheet: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
  },
};

const androidShadows: ShadowSet = {
  none: { elevation: 0 },
  card: { elevation: 2 },
  modal: { elevation: 8 },
  sheet: { elevation: 16 },
};

export const shadows: ShadowSet = Platform.select({
  ios: iosShadows,
  android: androidShadows,
  default: androidShadows,
})!;
