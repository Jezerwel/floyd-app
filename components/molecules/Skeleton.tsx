import { View } from "react-native";
import { useEffect } from "react";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
} from "react-native-reanimated";

interface SkeletonProps {
  width?: number | string;
  height?: number;
  borderRadius?: number;
  className?: string;
}

export function Skeleton({
  width = "100%",
  height = 16,
  borderRadius = 8,
  className,
}: SkeletonProps) {
  const opacity = useSharedValue(0.3);

  useEffect(() => {
    opacity.value = withRepeat(
      withSequence(
        withTiming(0.7, { duration: 800 }),
        withTiming(0.3, { duration: 800 })
      ),
      -1,
      true
    );
  }, [opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      className={`bg-slate-200 dark:bg-slate-700 ${className ?? ""}`}
      style={[{ width: width as number | undefined, height, borderRadius }, animatedStyle]}
    />
  );
}

export function SkeletonCard() {
  return (
    <View className="p-5 bg-surface-card rounded-card border border-border gap-3">
      <Skeleton width={120} height={16} />
      <Skeleton height={40} />
    </View>
  );
}

export function SkeletonStatRow() {
  return (
    <View className="flex-row gap-3 px-4">
      <Skeleton height={64} className="flex-1" borderRadius={12} />
      <Skeleton height={64} className="flex-1" borderRadius={12} />
    </View>
  );
}
