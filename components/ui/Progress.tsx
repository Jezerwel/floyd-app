import { View } from "react-native";
import { ThemedText } from "./Text";

interface ProgressProps {
  value: number;
  variant?: "primary" | "success" | "warning" | "error";
  height?: number;
  showLabel?: boolean;
}

const colorClasses: Record<string, string> = {
  primary: "bg-primary",
  success: "bg-success",
  warning: "bg-accent",
  error: "bg-error",
};

export function Progress({
  value,
  variant = "primary",
  height = 8,
  showLabel = false,
}: ProgressProps) {
  const clampedValue = Math.max(0, Math.min(100, value));

  return (
    <View className="w-full">
      <View
        className="w-full rounded-full bg-primary-container/30 overflow-hidden"
        style={{ height }}
      >
        <View
          className={`h-full rounded-full ${colorClasses[variant]}`}
          style={{ width: `${clampedValue}%` }}
        />
      </View>
      {showLabel && (
        <ThemedText variant="caption" className="mt-1 text-right">
          {Math.round(clampedValue)}%
        </ThemedText>
      )}
    </View>
  );
}
