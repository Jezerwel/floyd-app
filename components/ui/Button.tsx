import { Pressable, type PressableProps, Platform } from "react-native";
import Animated, {
  useAnimatedStyle,
  withSpring,
  useSharedValue,
} from "react-native-reanimated";
import { ThemedText } from "./Text";
import * as Haptics from "expo-haptics";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";
type ButtonSize = "sm" | "md" | "lg";

const variantClasses: Record<ButtonVariant, string> = {
  primary: "bg-primary",
  secondary: "bg-primary-container",
  danger: "bg-error",
  ghost: "bg-transparent",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "px-4 py-2",
  md: "px-6 py-3",
  lg: "px-8 py-4",
};

interface ButtonProps extends PressableProps {
  title: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: string;
  loading?: boolean;
  haptic?: boolean;
}

export function Button({
  title,
  variant = "primary",
  size = "md",
  icon,
  loading,
  haptic = true,
  disabled,
  onPress,
  className,
  ...props
}: ButtonProps) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    scale.value = withSpring(0.97, { damping: 20, stiffness: 300 });
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 15, stiffness: 200 });
  };

  const handlePress = (e: any) => {
    if (haptic && Platform.OS === "ios") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    onPress?.(e);
  };

  const isDisabled = disabled || loading;
  const textColor =
    variant === "primary" || variant === "danger"
      ? "text-white"
      : variant === "ghost"
      ? "text-primary"
      : "text-primary";

  return (
    <AnimatedPressable
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={isDisabled}
      className={`rounded-button items-center justify-center ${variantClasses[variant]} ${sizeClasses[size]} ${
        isDisabled ? "opacity-50" : ""
      } ${className ?? ""}`}
      style={animatedStyle}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!isDisabled }}
      {...props}
    >
      <ThemedText
        variant="body"
        className={`font-sans-bold ${textColor}`}
      >
        {loading ? "Loading..." : title}
      </ThemedText>
    </AnimatedPressable>
  );
}
