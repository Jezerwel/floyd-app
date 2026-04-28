import { View } from "react-native";
import { ThemedText } from "../ui/Text";
import { IconSymbol, type IconSymbolName } from "../ui/IconSymbol";
import { CustomSlider } from "../ui/CustomSlider";

interface SliderControlProps {
  icon: IconSymbolName;
  label: string;
  value: number;
  onValueChange: (v: number) => void;
  min?: number;
  max?: number;
  suffix?: string;
}

export function SliderControl({
  icon,
  label,
  value,
  onValueChange,
  min = 0,
  max = 100,
  suffix = "%",
}: SliderControlProps) {
  return (
    <View className="flex-row items-center gap-3 px-2">
      <IconSymbol name={icon} size={24} color="#0E7490" />
      <View className="flex-1">
        <View className="flex-row justify-between mb-1">
          <ThemedText variant="caption">{label}</ThemedText>
          <ThemedText variant="body" className="font-sans-bold text-primary">
            {value}{suffix}
          </ThemedText>
        </View>
        <CustomSlider
          value={value}
          onValueChange={onValueChange}
          min={min}
          max={max}
        />
      </View>
    </View>
  );
}
