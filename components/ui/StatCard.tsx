import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import { IconSymbol } from "./IconSymbol";

interface StatCardProps {
  title: string;
  value?: string | number;
  unit?: string;
  icon: string;
  color: string;
  children?: React.ReactNode;
  delay?: number;
}

export const StatCard: React.FC<StatCardProps> = React.memo(({
  title,
  value,
  unit,
  icon,
  color,
  children,
  delay = 0,
}) => {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "light"];

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }),
        Animated.spring(slideAnim, {
          toValue: 0,
          friction: 8,
          tension: 40,
          useNativeDriver: true,
        }),
      ]).start();
    }, delay);

    return () => clearTimeout(timer);
  }, [fadeAnim, slideAnim, delay]);

  return (
    <Animated.View
      style={[
        styles.card,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          opacity: fadeAnim,
          transform: [{ translateY: slideAnim }],
        },
      ]}
    >
      <View style={styles.cardHeader}>
        <IconSymbol name={icon as "link"} size={20} color={color} />
        <Text style={[styles.cardTitle, { color: colors.text }]}>{title}</Text>
      </View>
      {children ? (
        children
      ) : (
        <View style={styles.cardContent}>
          <Text style={[styles.cardValue, { color: colors.text }]}>
            {value}
            {unit && (
              <Text style={[styles.cardUnit, { color: colors.muted }]}>
                {unit}
              </Text>
            )}
          </Text>
        </View>
      )}
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "600",
  },
  cardContent: {
    alignItems: "center",
  },
  cardValue: {
    fontSize: 24,
    fontWeight: "bold",
  },
  cardUnit: {
    fontSize: 16,
    fontWeight: "normal",
  },
});
