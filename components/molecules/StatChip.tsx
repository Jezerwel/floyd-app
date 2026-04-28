import { View } from "react-native";
import { ThemedText } from "../ui/Text";
import { IconSymbol, type IconSymbolName } from "../ui/IconSymbol";
import Animated, { FadeInDown } from "react-native-reanimated";

interface StatChipProps {
  icon: IconSymbolName;
  label: string;
  value: string;
  color?: string;
  delay?: number;
}

export function StatChip({ icon, label, value, color, delay = 0 }: StatChipProps) {
  const chipColor = color ?? "#0E7490";

  return (
    <Animated.View
      entering={FadeInDown.delay(delay).springify()}
      className="flex-row items-center gap-2 bg-surface-card border border-border rounded-xl px-4 py-3 flex-1"
      accessibilityLabel={`${label}: ${value}`}
      accessibilityRole="text"
    >
      <IconSymbol name={icon} size={20} color={chipColor} />
      <View className="flex-1">
        <ThemedText variant="caption" className="text-xs">
          {label}
        </ThemedText>
        <ThemedText variant="body" className="font-sans-bold">
          {value}
        </ThemedText>
      </View>
    </Animated.View>
  );
}
