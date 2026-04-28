import { View, Pressable } from "react-native";
import { ThemedText } from "../ui/Text";
import Animated, {
  useAnimatedStyle,
  withSpring,
  useSharedValue,
} from "react-native-reanimated";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface DayChipProps {
  day: string;
  date: string;
  feedCount: number;
  isActive: boolean;
  onPress: () => void;
}

export function DayChip({
  day,
  date,
  feedCount,
  isActive,
  onPress,
}: DayChipProps) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    scale.value = withSpring(0.95);
  };

  const handlePressOut = () => {
    scale.value = withSpring(1);
  };

  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={animatedStyle}
      className={`items-center px-4 py-2 rounded-xl border ${
        isActive
          ? "bg-primary border-primary"
          : "bg-surface-card border-border"
      }`}
      accessibilityRole="button"
      accessibilityState={{ selected: isActive }}
      accessibilityLabel={`${day} ${date}, ${feedCount} feed${feedCount !== 1 ? "s" : ""}${isActive ? ", selected" : ""}`}
    >
      <ThemedText
        variant="caption"
        className={isActive ? "text-white" : ""}
      >
        {day}
      </ThemedText>
      <ThemedText
        variant="body"
        className={`font-sans-bold ${
          isActive ? "text-white" : "text-primary"
        }`}
      >
        {date}
      </ThemedText>
      {feedCount > 0 && (
        <View
          className={`mt-1 w-5 h-5 rounded-full items-center justify-center ${
            isActive ? "bg-white/20" : "bg-primary-container"
          }`}
        >
          <ThemedText variant="caption" className="text-xs">
            {feedCount}
          </ThemedText>
        </View>
      )}
    </AnimatedPressable>
  );
}
