import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, View, ViewStyle } from "react-native";

interface SkeletonProps {
  width: number | string;
  height: number;
  borderRadius?: number;
  style?: ViewStyle;
}

export const Skeleton: React.FC<SkeletonProps> = ({
  width,
  height,
  borderRadius = 8,
  style,
}) => {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "light"];
  const animatedValue = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(animatedValue, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(animatedValue, {
          toValue: 0,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [animatedValue]);

  const opacity = animatedValue.interpolate({
    inputRange: [0, 1],
    outputRange: [0.3, 0.7],
  });

  return (
    <Animated.View
      style={[
        styles.skeleton,
        {
          width,
          height,
          borderRadius,
          backgroundColor: colors.muted,
          opacity,
        },
        style,
      ]}
    />
  );
};

interface SkeletonCardProps {
  lines?: number;
  showCircle?: boolean;
}

export const SkeletonCard: React.FC<SkeletonCardProps> = ({
  lines = 3,
  showCircle = false,
}) => {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "light"];

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.card, borderColor: colors.border },
      ]}
    >
      <View style={styles.cardHeader}>
        <Skeleton width={20} height={20} borderRadius={4} />
        <Skeleton width={120} height={16} />
      </View>
      {showCircle ? (
        <View style={styles.circleContainer}>
          <Skeleton width={100} height={100} borderRadius={50} />
          <View style={styles.circleInfo}>
            <Skeleton width={80} height={14} />
            <Skeleton width={60} height={24} style={{ marginTop: 8 }} />
          </View>
        </View>
      ) : (
        <View style={styles.linesContainer}>
          {Array.from({ length: lines }).map((_, index) => (
            <Skeleton
              key={index}
              width={index === lines - 1 ? "60%" : "100%"}
              height={14}
              style={{ marginBottom: index < lines - 1 ? 8 : 0 }}
            />
          ))}
        </View>
      )}
    </View>
  );
};

interface SkeletonStatRowProps {
  count?: number;
}

export const SkeletonStatRow: React.FC<SkeletonStatRowProps> = ({
  count = 2,
}) => {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "light"];

  return (
    <View style={styles.statsRow}>
      {Array.from({ length: count }).map((_, index) => (
        <View
          key={index}
          style={[
            styles.statCard,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <View style={styles.cardHeader}>
            <Skeleton width={20} height={20} borderRadius={4} />
            <Skeleton width={80} height={14} />
          </View>
          <View style={styles.statContent}>
            <Skeleton width={60} height={28} />
          </View>
        </View>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  skeleton: {
    overflow: "hidden",
  },
  card: {
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 16,
  },
  linesContainer: {
    gap: 8,
  },
  circleContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 20,
  },
  circleInfo: {
    flex: 1,
  },
  statsRow: {
    flexDirection: "row",
    gap: 12,
  },
  statCard: {
    flex: 1,
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
  },
  statContent: {
    alignItems: "center",
  },
});
