import { Tabs } from "expo-router";
import React, { useEffect } from "react";
import { Platform } from "react-native";
import Animated, {
  useAnimatedStyle,
  withSpring,
  useSharedValue,
} from "react-native-reanimated";

import { HapticTab } from "@/components/HapticTab";
import { IconSymbol, type IconSymbolName } from "@/components/ui/IconSymbol";
import TabBarBackground from "@/components/ui/TabBarBackground";
import { colors as theme } from "@/theme/colors";
import { useColorScheme } from "@/hooks/useColorScheme";

function AnimatedTabIcon({
  focused,
  color,
  name,
  size = 28,
}: {
  focused: boolean;
  color: string;
  name: IconSymbolName;
  size?: number;
}) {
  const scale = useSharedValue(1);
  const glowOpacity = useSharedValue(0);

  useEffect(() => {
    scale.value = withSpring(focused ? 1.15 : 1, {
      damping: 12,
      stiffness: 200,
    });
    glowOpacity.value = withSpring(focused ? 0.25 : 0, {
      damping: 15,
      stiffness: 200,
    });
  }, [focused, scale, glowOpacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
  }));

  return (
    <Animated.View style={animatedStyle}>
      <Animated.View
        style={[
          {
            position: "absolute",
            top: -4,
            left: -4,
            right: -4,
            bottom: -4,
            borderRadius: 22,
            backgroundColor: color,
          },
          glowStyle,
        ]}
      />
      <IconSymbol size={size} name={name} color={color} />
    </Animated.View>
  );
}

export default function TabLayout() {
  const colorScheme = useColorScheme();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: theme[colorScheme ?? "light"].primary,
        tabBarInactiveTintColor: theme[colorScheme ?? "light"].textSecondary,
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarBackground: TabBarBackground,
        tabBarStyle: Platform.select({
          ios: {
            position: "absolute",
          },
          default: {},
        }),
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Dashboard",
          tabBarIcon: ({ focused, color }) => (
            <AnimatedTabIcon
              focused={focused}
              color={color}
              name="house.fill"
            />
          ),
        }}
      />
      <Tabs.Screen
        name="controls"
        options={{
          title: "Controls",
          tabBarIcon: ({ focused, color }) => (
            <AnimatedTabIcon
              focused={focused}
              color={color}
              name="gearshape.fill"
            />
          ),
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: "Logs",
          tabBarIcon: ({ focused, color }) => (
            <AnimatedTabIcon
              focused={focused}
              color={color}
              name="paperplane.fill"
            />
          ),
        }}
      />
      <Tabs.Screen
        name="schedule"
        options={{
          title: "Schedule",
          tabBarIcon: ({ focused, color }) => (
            <AnimatedTabIcon
              focused={focused}
              color={color}
              name="clock.fill"
            />
          ),
        }}
      />
    </Tabs>
  );
}
