import { View } from "react-native";
import { StatChip } from "../molecules/StatChip";

type MotorState = "idle" | "pre_spin" | "feeding" | "post_spin" | "jam_clear";

interface StatusStripProps {
  temperature: number | undefined;
  motorState: MotorState;
  wifiStrength: number;
}

export function StatusStrip({
  temperature,
  motorState,
  wifiStrength,
}: StatusStripProps) {
  const motorLabel =
    motorState === "feeding"
      ? "Feeding"
      : motorState === "pre_spin"
        ? "Pre-Spin"
        : motorState === "post_spin"
          ? "Post-Spin"
          : motorState === "jam_clear"
            ? "Clearing"
            : "Idle";

  const motorColor =
    motorState === "feeding" || motorState === "pre_spin" || motorState === "post_spin"
      ? "#F59E0B"
      : motorState === "jam_clear"
        ? "#EF4444"
        : "#10B981";

  return (
    <View className="flex-row gap-3 px-4 mt-2">
      <StatChip
        icon="thermometer"
        label="Water Temp"
        value={`${temperature?.toFixed(1) ?? "--"}°C`}
        color="#0E7490"
      />
      <StatChip
        icon="gearshape.fill"
        label="Motor"
        value={motorLabel}
        color={motorColor}
      />
      <StatChip
        icon="wifi"
        label="WiFi"
        value={`${wifiStrength}%`}
        color={wifiStrength > 50 ? "#10B981" : "#F59E0B"}
      />
    </View>
  );
}
