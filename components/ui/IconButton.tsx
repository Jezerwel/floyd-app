import { Pressable, Platform } from "react-native";
import Animated, {
  useAnimatedStyle,
  withSpring,
  useSharedValue,
} from "react-native-reanimated";
import { IconSymbol } from "./IconSymbol";
import type { IconSymbolName } from "./IconSymbol";
import * as Haptics from "expo-haptics";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface IconButtonProps {
  name: IconSymbolName;
  onPress: () => void;
  size?: number;
  color?: string;
  accessibilityLabel: string;
}

export function IconButton({
  name,
  onPress,
  size = 24,
  color = "#0F172A",
  accessibilityLabel,
}: IconButtonProps) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    scale.value = withSpring(0.9, { damping: 20, stiffness: 300 });
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 15, stiffness: 200 });
  };

  const handlePress = () => {
    if (Platform.OS === "ios") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    onPress();
  };

  return (
    <AnimatedPressable
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      className="w-11 h-11 items-center justify-center rounded-full bg-primary-container/30 active:bg-primary-container/50"
      style={animatedStyle}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      <IconSymbol name={name} size={size} color={color} />
    </AnimatedPressable>
  );
}
