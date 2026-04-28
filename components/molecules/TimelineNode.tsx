import { View } from "react-native";
import { ThemedText } from "../ui/Text";
import Animated, { FadeInLeft } from "react-native-reanimated";

type NodeColor = "green" | "amber" | "blue" | "red";

const dotColors: Record<NodeColor, string> = {
  green: "bg-success",
  amber: "bg-accent",
  blue: "bg-primary",
  red: "bg-error",
};

interface TimelineNodeProps {
  color: NodeColor;
  time: string;
  title: string;
  subtitle?: string;
  isLast?: boolean;
}

export function TimelineNode({
  color,
  time,
  title,
  subtitle,
  isLast,
}: TimelineNodeProps) {
  const dotColorClass = dotColors[color];

  return (
    <Animated.View
      entering={FadeInLeft.springify()}
      className="flex-row"
    >
      <View className="items-center mr-4">
        <View className={`w-3 h-3 rounded-full ${dotColorClass}`} />
        {!isLast && (
          <View className="w-0.5 flex-1 bg-border mt-1" />
        )}
      </View>
      <View className={`flex-1 ${isLast ? "" : "pb-6"}`}>
        <ThemedText variant="caption" className="text-xs">
          {time}
        </ThemedText>
        <ThemedText variant="body" className="font-sans-medium">
          {title}
        </ThemedText>
        {subtitle && (
          <ThemedText variant="caption">{subtitle}</ThemedText>
        )}
      </View>
    </Animated.View>
  );
}
