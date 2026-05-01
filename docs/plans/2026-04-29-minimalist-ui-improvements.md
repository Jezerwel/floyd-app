# Minimalist UI Improvements

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Refine sensor widgets, controls, cards, color system, and motion language toward a minimalist aesthetic — clean surfaces, intentional spacing, restrained typography, crisp interactions. No glassmorphism, no glow, no idle animation.

**Architecture:** Refactor 9 existing components in-place (`components/ui/`), upgrade `Colors.ts`, and establish consistent motion patterns. No new files. No new dependencies. All changes are surgical — modify existing components, never rewrite from scratch.

**Tech Stack:** React Native (Expo), TypeScript, Reanimated 4 (sliders only), RN Animated API (everything else), StyleSheet

---

### Task 1: Refine Color System

**Files:**
- Modify: `constants/Colors.ts`

**What changes:**
- Stop swapping primary/secondary between light/dark — teal is always primary
- Dark mode background deeper (`#0A0F14` instead of `#111827`), cards darker (`#141A21`)
- Light mode background less minty (`#F8FAFB`), cards stay white
- Remove `accentYellow` — use `warning` directly where needed
- Add `textSecondary` key for subtler secondary text
- Reduce shadow values across the board (later tasks reference these)

**Step 1: Apply the refined palette**

Replace `constants/Colors.ts`:

```typescript
// FLOYD 1.0 Fish Feeder App Colors
// Minimalist restrained palette — 2 core tones + functional accents

const teal = "#0D9488";
const seaGreen = "#10B981";
const amber = "#F59E0B";
const red = "#EF4444";

export const Colors = {
  light: {
    text: "#1F2937",
    textSecondary: "#6B7280",
    background: "#F8FAFB",
    tint: teal,
    icon: "#6B7280",
    tabIconDefault: "#6B7280",
    tabIconSelected: teal,
    primary: teal,
    secondary: seaGreen,
    accent: amber,
    card: "#FFFFFF",
    border: "#E5E7EB",
    success: seaGreen,
    warning: amber,
    error: red,
    muted: "#9CA3AF",
  },
  dark: {
    text: "#F1F5F9",
    textSecondary: "#64748B",
    background: "#0A0F14",
    tint: teal,
    icon: "#64748B",
    tabIconDefault: "#64748B",
    tabIconSelected: teal,
    primary: teal,
    secondary: seaGreen,
    accent: amber,
    card: "#141A21",
    border: "#1E293B",
    success: seaGreen,
    warning: amber,
    error: red,
    muted: "#475569",
  },
};
```

**Verification:** Run `npx expo export --platform web --dump-sourcemap` — should compile clean.

---

### Task 2: Upgrade StatCard

**Files:**
- Modify: `components/ui/StatCard.tsx`

**What changes:**
- Remove shadow (elevation: 0, no shadowColor/shadowOffset)
- Flatter border: `borderWidth: 1` stays, but subtler
- No entry slide animation — just 200ms fade-in
- Larger title type (18px), value type (28px), cleaner spacing
- Remove `children` pattern forcing custom layouts — simplify to value+unit only
- Use `textSecondary` for muted text

**Step 1: Rewrite StatCard**

```typescript
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
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const timer = setTimeout(() => {
      Animated.timing(opacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }, delay);
    return () => clearTimeout(timer);
  }, [opacity, delay]);

  return (
    <Animated.View
      style={[
        styles.card,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          opacity,
        },
      ]}
    >
      <View style={styles.header}>
        <IconSymbol name={icon as "link"} size={18} color={color} />
        <Text style={[styles.title, { color: colors.textSecondary }]}>{title}</Text>
      </View>
      {children ? (
        children
      ) : (
        <View style={styles.body}>
          <Text style={[styles.value, { color: colors.text }]}>
            {value}
            {unit && (
              <Text style={[styles.unit, { color: colors.textSecondary }]}> {unit}</Text>
            )}
          </Text>
        </View>
      )}
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    padding: 20,
    marginBottom: 14,
    borderWidth: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  title: {
    fontSize: 14,
    fontWeight: "500",
  },
  body: {
    alignItems: "flex-start",
  },
  value: {
    fontSize: 28,
    fontWeight: "700",
    letterSpacing: -0.5,
  },
  unit: {
    fontSize: 16,
    fontWeight: "400",
  },
});
```

**Verification:** TypeScript compiles. Visual check: cards have no shadow, cleaner spacing, title in muted, value prominent.

---

### Task 3: Upgrade CircularProgress

**Files:**
- Modify: `components/ui/CircularProgress.tsx`

**What changes:**
- Accept `trackColor` prop (defaults to theme `border`) so track respects theme
- Remove hardcoded `#E5E7EB`, `#ef4444`, `#f59e0b` — all color logic uses theme tokens
- Simplify the quadrant ring construction: use a single rotated semi-circle approach instead of 4 border sides
- Actually RN doesn't easily do arcs without SVG. Keep the 4-border-quadrant approach but make it cleaner:
  - Actually, the quadrant approach is fine visually. Just fix the hardcoded colors and clean up.
- Keep spring animation
- Remove the pop-scale on value change (too noisy for minimalist)
- Larger percentage text, medium weight instead of bold

**Step 1: Read and understand the current implementation** (done above)

**Step 2: Rewrite with theme-aware colors and cleaner structure**

```typescript
import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";

interface CircularProgressProps {
  percentage: number;
  size?: number;
  strokeWidth?: number;
  color: string;
  trackColor?: string;
}

export const CircularProgress: React.FC<CircularProgressProps> = React.memo(({
  percentage,
  size = 120,
  strokeWidth = 8,
  color,
  trackColor,
}) => {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "light"];
  const track = trackColor ?? colors.border;

  const animValue = useRef(new Animated.Value(0)).current;
  const [displayValue, setDisplayValue] = React.useState(0);

  useEffect(() => {
    const listener = animValue.addListener(({ value }) => {
      setDisplayValue(Math.round(value));
    });

    Animated.spring(animValue, {
      toValue: percentage,
      friction: 8,
      tension: 40,
      useNativeDriver: false,
    }).start();

    return () => {
      animValue.removeListener(listener);
    };
  }, [percentage, animValue]);

  const getColorForLevel = (level: number): string => {
    if (level <= 20) return colors.error;
    if (level <= 40) return colors.warning;
    return color;
  };

  const displayColor = getColorForLevel(displayValue);

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <View
        style={[
          styles.track,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            borderWidth: strokeWidth,
            borderColor: track,
          },
        ]}
      />
      <View
        style={[
          styles.fill,
          {
            width: size - strokeWidth,
            height: size - strokeWidth,
            borderRadius: (size - strokeWidth) / 2,
            borderWidth: strokeWidth / 2,
            borderTopColor: displayValue > 25 ? displayColor : "transparent",
            borderRightColor: displayValue > 50 ? displayColor : "transparent",
            borderBottomColor: displayValue > 75 ? displayColor : "transparent",
            borderLeftColor: displayValue > 0 ? displayColor : "transparent",
          },
        ]}
      />
      <Text style={[styles.value, { color: displayColor, fontSize: size * 0.22 }]}>
        {displayValue}%
      </Text>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
  },
  track: {
    position: "absolute",
  },
  fill: {
    position: "absolute",
    borderColor: "transparent",
  },
  value: {
    fontWeight: "600",
  },
});
```

**Verification:** Track color matches theme border. Level colors use theme tokens. No hardcoded hex.

---

### Task 4: Upgrade DistanceSensor

**Files:**
- Modify: `components/ui/DistanceSensor.tsx`

**What changes:**
- Cleaner bar: wider (24px), taller (100px), more minimal styling
- Remove minLine/maxLine markers (visual noise)
- Better typography — distance value as large number, food level as secondary
- Status indicator moved to top, simplified
- Use `colors.textSecondary` for labels

**Step 1: Rewrite DistanceSensor**

```typescript
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { IconSymbol } from "./IconSymbol";

interface DistanceSensorProps {
  distance: number;
  foodLevelPercentage: number;
  isConnected: boolean;
  maxDistance?: number;
  minDistance?: number;
}

export const DistanceSensor: React.FC<DistanceSensorProps> = ({
  distance,
  foodLevelPercentage,
  isConnected,
  maxDistance = 20,
  minDistance = 3,
}) => {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme as keyof typeof Colors];

  const getLevelColor = () => {
    if (!isConnected) return colors.muted;
    if (foodLevelPercentage > 50) return colors.success;
    if (foodLevelPercentage > 20) return colors.warning;
    return colors.error;
  };

  const getLabel = () => {
    if (!isConnected) return "Offline";
    if (foodLevelPercentage > 50) return "Good";
    if (foodLevelPercentage > 20) return "Low";
    return "Critical";
  };

  const barFill = isConnected
    ? Math.max(0, Math.min(100, ((distance - minDistance) / (maxDistance - minDistance)) * 100))
    : 0;

  const levelColor = getLevelColor();

  return (
    <View style={styles.row}>
      <View style={[styles.bar, { backgroundColor: colors.border + "40" }]}>
        <View
          style={[
            styles.barFill,
            {
              height: `${100 - barFill}%`,
              backgroundColor: levelColor,
            },
          ]}
        />
      </View>
      <View style={styles.info}>
        <View style={styles.labelRow}>
          <View style={[styles.dot, { backgroundColor: levelColor }]} />
          <Text style={[styles.label, { color: colors.textSecondary }]}>{getLabel()}</Text>
        </View>
        <Text style={[styles.distance, { color: colors.text }]}>
          {isConnected ? `${distance.toFixed(1)}` : "--"}
          <Text style={[styles.unit, { color: colors.textSecondary }]}> cm</Text>
        </Text>
        <Text style={[styles.foodLevel, { color: colors.textSecondary }]}>
          {isConnected ? `${foodLevelPercentage.toFixed(0)}%` : "--"}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: 16,
    alignItems: "center",
  },
  bar: {
    width: 24,
    height: 100,
    borderRadius: 12,
    overflow: "hidden",
    justifyContent: "flex-end",
  },
  barFill: {
    width: "100%",
    borderRadius: 12,
    minHeight: 4,
  },
  info: {
    flex: 1,
    gap: 4,
  },
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  label: {
    fontSize: 13,
    fontWeight: "500",
  },
  distance: {
    fontSize: 28,
    fontWeight: "700",
    letterSpacing: -0.5,
  },
  unit: {
    fontSize: 15,
    fontWeight: "400",
  },
  foodLevel: {
    fontSize: 14,
  },
});
```

**Verification:** Visual check — cleaner bar with fill from bottom, no min/max lines, stronger typographic hierarchy.

---

### Task 5: Upgrade BatteryLevel

**Files:**
- Modify: `components/ui/BatteryLevel.tsx`

**What changes:**
- Remove hardcoded `#9CA3AF` battery tip
- Add animated width transition on percentage change
- Cleaner shape: rounded bar, no tip nub
- Vertical layout option removed — keep horizontal only
- Use theme tokens for everything

**Step 1: Rewrite BatteryLevel**

```typescript
import React, { useEffect, useRef } from "react";
import { Animated, View, Text, StyleSheet } from "react-native";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";

interface BatteryLevelProps {
  percentage: number;
}

export const BatteryLevel: React.FC<BatteryLevelProps> = ({ percentage }) => {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "light"];
  const widthAnim = useRef(new Animated.Value(percentage)).current;

  useEffect(() => {
    Animated.timing(widthAnim, {
      toValue: percentage,
      duration: 400,
      useNativeDriver: false,
    }).start();
  }, [percentage, widthAnim]);

  const getColor = () => {
    if (percentage > 50) return colors.success;
    if (percentage > 20) return colors.warning;
    return colors.error;
  };

  const barColor = getColor();

  const fillWidth = widthAnim.interpolate({
    inputRange: [0, 100],
    outputRange: ["0%", "100%"],
    extrapolate: "clamp",
  });

  return (
    <View style={styles.container}>
      <View style={[styles.track, { backgroundColor: colors.border }]}>
        <Animated.View
          style={[styles.fill, { width: fillWidth, backgroundColor: barColor }]}
        />
      </View>
      <Text style={[styles.text, { color: colors.text }]}>{percentage}%</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  track: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
  },
  fill: {
    height: "100%",
    borderRadius: 3,
  },
  text: {
    fontSize: 16,
    fontWeight: "600",
    minWidth: 42,
  },
});
```

**Verification:** Animated fill width, no hardcoded colors, clean horizontal layout.

---

### Task 6: Upgrade CustomSlider

**Files:**
- Modify: `components/ui/CustomSlider.tsx`

**What changes:**
- Remove hardcoded `sliderWidth` — accept `width` prop, default to screen-responsive
- Fix stale-closure: store start position in a shared value (Reanimated), not in the onUpdate closure
- Labels accept `minLabel` and `maxLabel` props (default "Min"/"Max")
- Thumb: simpler design — 16px solid circle, no shadow
- Track: 4px tall, rounded
- Spring snap on gesture end (not immediate jump on release — the shared value already springs from the `useEffect`)
- Remove `useEffect` sync — instead reset translateX in `onStart` callback
- Haptic feedback on gesture end

**Step 1: Rewrite CustomSlider**

```typescript
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";

interface CustomSliderProps {
  value: number;
  onValueChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  width?: number;
  minLabel?: string;
  maxLabel?: string;
}

export const CustomSlider: React.FC<CustomSliderProps> = ({
  value,
  onValueChange,
  min = 0,
  max = 100,
  step = 1,
  width = 280,
  minLabel = "Min",
  maxLabel = "Max",
}) => {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "light"];

  const trackWidth = width;
  const translateX = useSharedValue(((value - min) / (max - min)) * trackWidth);
  const startX = useSharedValue(0);

  // Sync when value changes from outside
  React.useEffect(() => {
    translateX.value = withSpring(((value - min) / (max - min)) * trackWidth);
  }, [value, min, max, trackWidth, translateX]);

  const gesture = Gesture.Pan()
    .onStart(() => {
      startX.value = translateX.value;
    })
    .onUpdate((event) => {
      const newX = Math.max(0, Math.min(trackWidth, startX.value + event.translationX));
      translateX.value = newX;
      const stepped = Math.round((newX / trackWidth) * ((max - min) / step)) * step + min;
      const clamped = Math.max(min, Math.min(max, stepped));
      runOnJS(onValueChange)(clamped);
    })
    .onEnd(() => {
      runOnJS(Haptics.impactAsync)(Haptics.ImpactFeedbackStyle.Light);
    });

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value - 8 }],
  }));

  const fillStyle = useAnimatedStyle(() => ({
    width: translateX.value,
  }));

  return (
    <View style={styles.container}>
      <View style={[styles.trackContainer, { width: trackWidth }]}>
        <View style={[styles.track, { backgroundColor: colors.border }]}>
          <Animated.View
            style={[styles.fill, { backgroundColor: colors.primary }, fillStyle]}
          />
        </View>
        <GestureDetector gesture={gesture}>
          <Animated.View
            style={[styles.thumb, { backgroundColor: colors.primary }, thumbStyle]}
          />
        </GestureDetector>
      </View>
      <View style={[styles.labels, { width: trackWidth }]}>
        <Text style={[styles.label, { color: colors.textSecondary }]}>{minLabel}</Text>
        <Text style={[styles.label, { color: colors.textSecondary }]}>{maxLabel}</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
  },
  trackContainer: {
    position: "relative",
    height: 20,
    justifyContent: "center",
  },
  track: {
    height: 4,
    borderRadius: 2,
  },
  fill: {
    height: "100%",
    borderRadius: 2,
    position: "absolute",
  },
  thumb: {
    position: "absolute",
    top: 2,
    width: 16,
    height: 16,
    borderRadius: 8,
  },
  labels: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8,
  },
  label: {
    fontSize: 12,
    fontWeight: "500",
  },
});
```

**Verification:** Stale closure fixed via `startX` shared value. Labels customizable. Haptic on release.

---

### Task 7: Upgrade VerticalSlider

**Files:**
- Modify: `components/ui/VerticalSlider.tsx`

**What changes:**
- Same stale-closure fix as CustomSlider (`startY` shared value)
- Accept `width` prop (track thickness)
- Labels customizable: `maxLabel` and `minLabel` props
- Thumb: 16px solid circle, no shadow
- Track: 4px wide, rounded
- Haptic on gesture end
- Cleaner label positioning — no absolute positioning magic numbers
- Value display uses `colors.textSecondary` when not primary-colored

**Step 1: Rewrite VerticalSlider**

```typescript
import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  runOnJS,
  withSpring,
} from "react-native-reanimated";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import * as Haptics from "expo-haptics";

interface VerticalSliderProps {
  value: number;
  onValueChange: (value: number) => void;
  min?: number;
  max?: number;
  height?: number;
  title: string;
  icon?: React.ReactNode;
  maxLabel?: string;
  minLabel?: string;
}

export const VerticalSlider: React.FC<VerticalSliderProps> = ({
  value,
  onValueChange,
  min = 1,
  max = 100,
  height = 150,
  title,
  icon,
  maxLabel = "Max",
  minLabel = "Min",
}) => {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "light"];

  const translateY = useSharedValue(height - ((value - min) / (max - min)) * height);
  const startY = useSharedValue(0);

  React.useEffect(() => {
    translateY.value = withSpring(height - ((value - min) / (max - min)) * height);
  }, [value, min, max, height, translateY]);

  const gesture = Gesture.Pan()
    .onStart(() => {
      startY.value = translateY.value;
    })
    .onUpdate((event) => {
      const newY = Math.max(0, Math.min(height, startY.value + event.translationY));
      translateY.value = newY;
      const newValue = Math.round(((height - newY) / height) * (max - min) + min);
      runOnJS(onValueChange)(Math.max(min, Math.min(max, newValue)));
    })
    .onEnd(() => {
      runOnJS(Haptics.impactAsync)(Haptics.ImpactFeedbackStyle.Light);
    });

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value - 8 }],
  }));

  const fillStyle = useAnimatedStyle(() => ({
    height: height - translateY.value,
    marginTop: translateY.value,
  }));

  return (
    <View style={styles.container}>
      {icon && <View style={styles.icon}>{icon}</View>}
      <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
      <View style={styles.sliderRow}>
        <Text style={[styles.sideLabel, { color: colors.textSecondary }]}>{maxLabel}</Text>
        <View style={[styles.track, { height, backgroundColor: colors.border }]}>
          <Animated.View
            style={[styles.fill, { backgroundColor: colors.primary }, fillStyle]}
          />
          <GestureDetector gesture={gesture}>
            <Animated.View
              style={[styles.thumb, { backgroundColor: colors.primary }, thumbStyle]}
            />
          </GestureDetector>
        </View>
        <Text style={[styles.sideLabel, { color: colors.textSecondary }]}>{minLabel}</Text>
      </View>
      <Text style={[styles.value, { color: colors.primary }]}>{value}%</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    padding: 16,
  },
  icon: {
    marginBottom: 6,
  },
  title: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 8,
    textAlign: "center",
  },
  sliderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  sideLabel: {
    fontSize: 10,
    fontWeight: "500",
    width: 28,
    textAlign: "center",
  },
  track: {
    width: 4,
    borderRadius: 2,
    position: "relative",
  },
  fill: {
    width: "100%",
    borderRadius: 2,
    position: "absolute",
    bottom: 0,
  },
  thumb: {
    position: "absolute",
    left: -6,
    width: 16,
    height: 16,
    borderRadius: 8,
  },
  value: {
    fontSize: 14,
    fontWeight: "600",
    marginTop: 10,
  },
});
```

**Verification:** Labels beside track (not absolute positioned), stale closure fixed, haptic on release.

---

### Task 8: Upgrade PaddleControl

**Files:**
- Modify: `components/ui/PaddleControl.tsx`

**What changes:**
- Remove shadow from container
- Flatter border, same radius as StatCard (12px)
- Active state: border color change only (no background swap — too heavy)
- Better integration with updated VerticalSlider

**Step 1: Rewrite PaddleControl**

```typescript
import React from "react";
import { View, StyleSheet } from "react-native";
import { IconSymbol } from "./IconSymbol";
import { VerticalSlider } from "./VerticalSlider";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";

interface PaddleControlProps {
  title: string;
  icon: any;
  speed: number;
  onSpeedChange: (speed: number) => void;
  isActive: boolean;
}

export const PaddleControl: React.FC<PaddleControlProps> = ({
  title,
  icon,
  speed,
  onSpeedChange,
  isActive,
}) => {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "light"];

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.card,
          borderColor: isActive ? colors.primary : colors.border,
        },
      ]}
    >
      <VerticalSlider
        value={speed}
        onValueChange={onSpeedChange}
        min={1}
        max={100}
        height={120}
        title={title}
        icon={
          <IconSymbol
            name={icon as any}
            size={20}
            color={isActive ? colors.primary : colors.textSecondary}
          />
        }
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    minHeight: 200,
  },
});
```

**Verification:** No shadow, clean border, card background always set.

---

### Task 9: Audit & Align Remaining Components

**Files:**
- Modify: `components/ui/AlertItem.tsx`
- Modify: `components/ui/AnimatedButton.tsx`
- Modify: `components/ui/AnimatedValue.tsx`
- Modify: `components/ui/InlineError.tsx`
- Modify: `components/ui/TabButton.tsx`
- Modify: `components/ui/Skeleton.tsx`

**What changes (surgical, one per component):**

**AlertItem.tsx:** Remove shadow. Use `colors.textSecondary` for timestamp text.

**AnimatedButton.tsx:** Remove shadow from button style. Lighter haptic (`Light` instead of `Medium`) for consistency.

**AnimatedValue.tsx:** Use `fontWeight: "600"` instead of `"bold"`. Remove the scale-pop animation from `AnimatedPercentage` — just animate the number value, no scale.

**InlineError.tsx:** Remove `borderWidth: 1` from container. Use `colors.textSecondary` for message when variant is info.

**TabButton.tsx:** Remove shadow. Make `borderWidth: 1` always (remove conditional border styling that could be missing). Use `colors.textSecondary` for inactive text.

**Skeleton.tsx:** Use `colors.border` as skeleton background instead of `colors.muted` (lighter, subtler). Reduce opacity range from `[0.3, 0.7]` to `[0.2, 0.4]` for subtler shimmer.

**Step 1: Apply all changes** (each is a 1-3 line edit):

```typescript
// AlertItem.tsx — remove shadow block
// Delete: shadowColor, shadowOffset, shadowOpacity, elevation from alertItem style

// AnimatedButton.tsx — remove shadow block from button + iconButton styles
// Change: Haptics.ImpactFeedbackStyle.Medium -> Light

// AnimatedValue.tsx — change fontWeight: "bold" to "600" in styles.value
// Remove: scale animation from AnimatedPercentage useEffect

// InlineError.tsx — delete borderWidth: 1 from container style
// Change message color: use colors.textSecondary when variant === "info"

// TabButton.tsx — delete shadow block from tabButton style
// Change inactive text: colors.muted -> colors.textSecondary
// Always borderWidth: 1, remove conditional styling

// Skeleton.tsx — change backgroundColor: colors.muted -> colors.border
// Change opacity range: [0.3, 0.7] -> [0.2, 0.4]
```

**Verification:** TypeScript compiles. No shadow on any component. Consistent `textSecondary` usage.

---

### Task 10: Verify & Build

**Step 1: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: zero errors.

**Step 2: Lint**

```bash
npx eslint .
```

Expected: zero errors (or same as before).

**Step 3: Export check**

```bash
npx expo export --platform web --dump-sourcemap
```

Expected: clean export, no build failures.

**Step 4: Commit**

```bash
git add constants/Colors.ts components/ui/
git commit -m "refactor: minimalist UI overhaul — refined colors, cleaner components, consistent motion"
```
