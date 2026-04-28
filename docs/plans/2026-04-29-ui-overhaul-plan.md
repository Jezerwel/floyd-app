# Floyd UI Overhaul — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Full UI rearchitecture — NativeWind integration, custom aquatic design system, rebuilt component architecture, responsive layouts, improved info hierarchy, accessibility coverage.

**Architecture:** NativeWind v4 (Tailwind for RN) provides utility classes. Custom theme tokens (`theme/`) extend NativeWind config. Components rebuilt in 4 layers: atomic (`ui/`), molecules, organisms (`sections/`), and screens. Hooks extracted from inline logic. `services/api.ts` unified. Reanimated for animations.

**Tech Stack:** Expo SDK 54, React Native 0.81.5, TypeScript 5.9, NativeWind v4, Tailwind CSS, react-native-reanimated 3.16, react-native-gesture-handler 2.28, expo-font, @expo/vector-icons, react-native-safe-area-context

---

## Phase 1: Infrastructure Setup

### Task 1: Install NativeWind and Tailwind

**Files:**
- Modify: `package.json`
- Modify: `app.json`
- Create: `tailwind.config.js`
- Create: `nativewind-env.d.ts`
- Create: `global.css`

**Step 1: Install dependencies**

```bash
npx expo install nativewind tailwindcss
```

**Step 2: Initialize Tailwind config**

```bash
npx tailwindcss init
```

**Step 3: Configure tailwind.config.js with custom aquatic theme**

Write `tailwind.config.js`:
```js
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: "#0E7490",
          container: "#CFFAFE",
          dark: "#22D3EE",
          "container-dark": "#164E63",
        },
        secondary: { DEFAULT: "#0891B2", dark: "#67E8F9" },
        accent: { DEFAULT: "#F59E0B", dark: "#FBBF24" },
        success: { DEFAULT: "#10B981", dark: "#34D399" },
        error: { DEFAULT: "#EF4444", dark: "#F87171" },
        surface: {
          DEFAULT: "#F0F9FA",
          card: "#FFFFFF",
          elevated: "#F8FAFC",
          dark: "#0F172A",
          "card-dark": "#1E293B",
          "elevated-dark": "#334155",
        },
        "text-primary": { DEFAULT: "#0F172A", dark: "#F1F5F9" },
        "text-secondary": { DEFAULT: "#475569", dark: "#94A3B8" },
        border: { DEFAULT: "#CBD5E1", dark: "#334155" },
      },
      fontFamily: {
        display: ["PlayfairDisplay_700Bold"],
        sans: ["DMSans_400Regular", "DMSans_500Medium", "DMSans_700Bold"],
        mono: ["SpaceMono_400Regular"],
      },
      spacing: { 0.5: "2px", 18: "72px", 22: "88px" },
      borderRadius: {
        card: "16px",
        button: "12px",
        pill: "9999px",
      },
    },
  },
  plugins: [],
};
```

**Step 4: Create nativewind-env.d.ts**

```ts
/// <reference types="nativewind/types" />
```

**Step 5: Create global.css**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

**Step 6: Update app.json to add global.css**

In `app.json`, add to the existing plugins/expo-router or add:
No changes needed — NativeWind v4 auto-detects `global.css` in project root.

**Step 7: Update babel.config.js (if exists) or app.json plugin**

Check if `babel.config.js` exists. If so, add `nativewind/babel` to plugins. If using Expo's default babel (no babel.config.js), add in app.json.

**Step 8: Verify**

```bash
npx expo start --clear
```
Expected: App starts without errors.

**Step 9: Commit**

```bash
git add package.json tailwind.config.js nativewind-env.d.ts global.css app.json
git commit -m "feat: install NativeWind v4 with custom aquatic Tailwind theme"
```

---

### Task 2: Create Theme Token Files

**Files:**
- Create: `theme/colors.ts`
- Create: `theme/typography.ts`
- Create: `theme/spacing.ts`
- Create: `theme/animation.ts`
- Create: `theme/shadows.ts`
- Create: `theme/index.ts`

**Step 1: Create theme/colors.ts**

```ts
export const colors = {
  light: {
    primary: "#0E7490",
    primaryContainer: "#CFFAFE",
    secondary: "#0891B2",
    accent: "#F59E0B",
    success: "#10B981",
    error: "#EF4444",
    surface: "#F0F9FA",
    surfaceCard: "#FFFFFF",
    surfaceElevated: "#F8FAFC",
    textPrimary: "#0F172A",
    textSecondary: "#475569",
    border: "#CBD5E1",
    ripple: "rgba(14,116,144,0.12)",
  },
  dark: {
    primary: "#22D3EE",
    primaryContainer: "#164E63",
    secondary: "#67E8F9",
    accent: "#FBBF24",
    success: "#34D399",
    error: "#F87171",
    surface: "#0F172A",
    surfaceCard: "#1E293B",
    surfaceElevated: "#334155",
    textPrimary: "#F1F5F9",
    textSecondary: "#94A3B8",
    border: "#334155",
    ripple: "rgba(34,211,238,0.15)",
  },
} as const;
```

**Step 2: Create theme/typography.ts**

```ts
export const typography = {
  fontFamily: {
    display: "PlayfairDisplay_700Bold",
    sans: "DMSans_400Regular",
    sansMedium: "DMSans_500Medium",
    sansBold: "DMSans_700Bold",
    mono: "SpaceMono_400Regular",
  },
  fontSize: {
    xs: 12,
    sm: 14,
    base: 16,
    lg: 18,
    xl: 20,
    "2xl": 24,
    "3xl": 28,
    "4xl": 32,
    "5xl": 40,
  },
  lineHeight: {
    tight: 1.25,
    normal: 1.5,
    relaxed: 1.75,
  },
  fontWeight: {
    normal: "400" as const,
    medium: "500" as const,
    bold: "700" as const,
  },
} as const;
```

**Step 3: Create theme/spacing.ts**

```ts
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  "2xl": 24,
  "3xl": 32,
  "4xl": 40,
  "5xl": 48,
  "6xl": 64,
} as const;
```

**Step 4: Create theme/animation.ts**

```ts
export const animation = {
  duration: {
    instant: 100,
    fast: 200,
    normal: 300,
    slow: 500,
  },
  easing: {
    fluid: { damping: 15, stiffness: 150 },
    standard: { damping: 20, stiffness: 200 },
    snappy: { damping: 12, stiffness: 250 },
  },
  stagger: 50,
} as const;
```

**Step 5: Create theme/shadows.ts**

```ts
import { Platform } from "react-native";

const iosShadows = {
  none: {},
  card: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
  },
  modal: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
  },
  sheet: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
  },
};

const androidShadows = {
  none: { elevation: 0 },
  card: { elevation: 2 },
  modal: { elevation: 8 },
  sheet: { elevation: 16 },
};

export const shadows = Platform.select({
  ios: iosShadows,
  android: androidShadows,
  default: androidShadows,
});
```

**Step 6: Create theme/index.ts (barrel export)**

```ts
export { colors } from "./colors";
export { typography } from "./typography";
export { spacing } from "./spacing";
export { animation } from "./animation";
export { shadows } from "./shadows";
```

**Step 7: Commit**

```bash
git add theme/
git commit -m "feat: add design token files (colors, typography, spacing, animation, shadows)"
```

---

### Task 3: Load Custom Fonts (Playfair Display + DM Sans)

**Files:**
- Modify: `app/_layout.tsx`

**Step 1: Download font files**

Download from Google Fonts:
- PlayfairDisplay-Bold.ttf → `assets/fonts/`
- DMSans-Regular.ttf → `assets/fonts/`
- DMSans-Medium.ttf → `assets/fonts/`
- DMSans-Bold.ttf → `assets/fonts/`

**Step 2: Update app/_layout.tsx font loading**

Replace the existing `useFonts` call with:

```tsx
const [fontsLoaded] = useFonts({
  SpaceMono_400Regular: require("../assets/fonts/SpaceMono-Regular.ttf"),
  PlayfairDisplay_700Bold: require("../assets/fonts/PlayfairDisplay-Bold.ttf"),
  DMSans_400Regular: require("../assets/fonts/DMSans-Regular.ttf"),
  DMSans_500Medium: require("../assets/fonts/DMSans-Medium.ttf"),
  DMSans_700Bold: require("../assets/fonts/DMSans-Bold.ttf"),
});
```

**Step 3: Commit**

```bash
git add assets/fonts/ app/_layout.tsx
git commit -m "feat: add Playfair Display and DM Sans fonts"
```

---

## Phase 2: Atomic Components (`components/ui/`)

### Task 4: Build ThemedText Component

**Files:**
- Create: `components/ui/Text.tsx`
- Modify: `components/ThemedText.tsx` (deprecate, replace imports)

**Step 1: Create components/ui/Text.tsx**

```tsx
import { Text as RNText, type TextProps as RNTextProps } from "react-native";
import type { VariantProps } from "class-variance-authority";

type TextVariant = "display" | "h1" | "h2" | "h3" | "body" | "caption" | "mono";

const variantStyles: Record<TextVariant, string> = {
  display: "font-display text-4xl text-primary",
  h1: "font-sans-bold text-2xl text-text-primary",
  h2: "font-sans-bold text-xl text-text-primary",
  h3: "font-sans-medium text-lg text-text-primary",
  body: "font-sans text-base text-text-primary",
  caption: "font-sans text-sm text-text-secondary",
  mono: "font-mono text-sm text-text-secondary",
};

interface ThemedTextProps extends RNTextProps {
  variant?: TextVariant;
  color?: string;
}

export function ThemedText({
  variant = "body",
  color,
  className,
  style,
  ...props
}: ThemedTextProps) {
  return (
    <RNText
      className={`${variantStyles[variant]} dark:text-text-primary-dark ${className ?? ""}`}
      style={color ? { color } : undefined}
      {...props}
    />
  );
}
```

Note: Because `dark:text-text-primary-dark` in Tailwind doesn't work well dynamically, use `useColorScheme()` inside or rely on NativeWind's `dark:` prefix. Keep it simple for now — NativeWind v4 handles dark mode via the `dark:` utility classes and the `darkMode: "class"` config.

**Step 2: Commit**

```bash
git add components/ui/Text.tsx
git commit -m "feat: add ThemedText atomic component with variants"
```

---

### Task 5: Build Surface & Card Components

**Files:**
- Create: `components/ui/Surface.tsx`
- Create: `components/ui/Card.tsx`

**Step 1: Create components/ui/Surface.tsx**

```tsx
import { View, type ViewProps } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

interface SurfaceProps extends ViewProps {
  safeTop?: boolean;
  safeBottom?: boolean;
}

export function Surface({
  safeTop,
  safeBottom,
  className,
  style,
  ...props
}: SurfaceProps) {
  const insets = useSafeAreaInsets();

  return (
    <View
      className={`flex-1 bg-surface dark:bg-surface-dark ${className ?? ""}`}
      style={[
        safeTop && { paddingTop: insets.top },
        safeBottom && { paddingBottom: insets.bottom },
        style,
      ].filter(Boolean)}
      {...props}
    />
  );
}
```

**Step 2: Create components/ui/Card.tsx**

```tsx
import { View, type ViewProps } from "react-native";
import Animated from "react-native-reanimated";

interface CardProps extends ViewProps {
  animated?: boolean;
  delay?: number;
  noPadding?: boolean;
}

export function Card({
  animated = false,
  delay = 0,
  noPadding = false,
  className,
  children,
  ...props
}: CardProps) {
  const Component = animated ? Animated.View : View;

  return (
    <Component
      className={`bg-surface-card dark:bg-surface-card-dark rounded-card border border-border dark:border-border-dark ${
        noPadding ? "" : "p-5"
      } ${className ?? ""}`}
      {...props}
    >
      {children}
    </Component>
  );
}
```

**Step 3: Commit**

```bash
git add components/ui/Surface.tsx components/ui/Card.tsx
git commit -m "feat: add Surface and Card atomic components"
```

---

### Task 6: Build Button & IconButton Components

**Files:**
- Create: `components/ui/Button.tsx`
- Create: `components/ui/IconButton.tsx`

**Step 1: Create components/ui/Button.tsx**

```tsx
import { Pressable, type PressableProps } from "react-native";
import Animated, {
  useAnimatedStyle,
  withSpring,
  useSharedValue,
} from "react-native-reanimated";
import { ThemedText } from "./Text";
import * as Haptic from "expo-haptics";
import { Platform } from "react-native";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";
type ButtonSize = "sm" | "md" | "lg";

const variantClasses: Record<ButtonVariant, string> = {
  primary: "bg-primary active:bg-primary/80",
  secondary: "bg-primary-container active:bg-primary-container/70",
  danger: "bg-error active:bg-error/80",
  ghost: "bg-transparent active:bg-primary-container/30",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "px-4 py-2",
  md: "px-6 py-3",
  lg: "px-8 py-4",
};

const textVariant: Record<ButtonVariant, "body" | "caption"> = {
  primary: "body",
  secondary: "body",
  danger: "body",
  ghost: "body",
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
      Haptic.impactAsync(Haptic.ImpactFeedbackStyle.Light);
    }
    onPress?.(e);
  };

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
      disabled={disabled || loading}
      className={`rounded-button items-center justify-center ${variantClasses[variant]} ${sizeClasses[size]} ${
        disabled || loading ? "opacity-50" : ""
      } ${className ?? ""}`}
      style={animatedStyle}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!(disabled || loading) }}
      {...props}
    >
      <ThemedText variant={textVariant[variant]} className={`font-sans-bold ${textColor}`}>
        {loading ? "Loading..." : title}
      </ThemedText>
    </AnimatedPressable>
  );
}
```

**Step 2: Create components/ui/IconButton.tsx**

```tsx
import { Pressable } from "react-native";
import Animated, {
  useAnimatedStyle,
  withSpring,
  useSharedValue,
} from "react-native-reanimated";
import { IconSymbol } from "./IconSymbol";
import * as Haptic from "expo-haptics";
import { Platform } from "react-native";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface IconButtonProps {
  name: string;
  onPress: () => void;
  size?: number;
  color?: string;
  accessibilityLabel: string;
}

export function IconButton({
  name,
  onPress,
  size = 24,
  color,
  accessibilityLabel,
}: IconButtonProps) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    scale.value = withSpring(0.9, { damping: 20, stiffness: 300 });
  };

  const handlePress = () => {
    if (Platform.OS === "ios") {
      Haptic.impactAsync(Haptic.ImpactFeedbackStyle.Light);
    }
    onPress();
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 15, stiffness: 200 });
  };

  return (
    <AnimatedPressable
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      className="w-11 h-11 items-center justify-center rounded-full bg-primary-container/50 active:bg-primary-container"
      style={animatedStyle}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      <IconSymbol name={name} size={size} color={color} />
    </AnimatedPressable>
  );
}
```

**Step 3: Commit**

```bash
git add components/ui/Button.tsx components/ui/IconButton.tsx
git commit -m "feat: add Button and IconButton atomic components with press animation"
```

---

### Task 7: Build Badge, Divider, Progress Components

**Files:**
- Create: `components/ui/Badge.tsx`
- Create: `components/ui/Divider.tsx`
- Create: `components/ui/Progress.tsx`

**Step 1: Create components/ui/Badge.tsx**

```tsx
import { View } from "react-native";
import { ThemedText } from "./Text";

type BadgeVariant = "success" | "warning" | "error" | "info" | "neutral";

const variantClasses: Record<BadgeVariant, { bg: string; text: string }> = {
  success: { bg: "bg-success/15", text: "text-success" },
  warning: { bg: "bg-accent/15", text: "text-accent" },
  error: { bg: "bg-error/15", text: "text-error" },
  info: { bg: "bg-primary/15", text: "text-primary" },
  neutral: { bg: "bg-text-secondary/10", text: "text-text-secondary" },
};

interface BadgeProps {
  label: string;
  variant?: BadgeVariant;
  size?: "sm" | "md";
}

export function Badge({ label, variant = "neutral", size = "sm" }: BadgeProps) {
  return (
    <View
      className={`rounded-pill items-center justify-center ${
        size === "sm" ? "px-2 py-0.5" : "px-3 py-1"
      } ${variantClasses[variant].bg}`}
    >
      <ThemedText
        variant="caption"
        className={`${size === "sm" ? "text-xs" : "text-sm"} ${variantClasses[variant].text}`}
      >
        {label}
      </ThemedText>
    </View>
  );
}
```

**Step 2: Create components/ui/Divider.tsx**

```tsx
import { View } from "react-native";

interface DividerProps {
  className?: string;
}

export function Divider({ className }: DividerProps) {
  return (
    <View
      className={`h-px bg-border dark:bg-border-dark ${className ?? ""}`}
    />
  );
}
```

**Step 3: Create components/ui/Progress.tsx**

```tsx
import { View } from "react-native";
import Animated, {
  useAnimatedStyle,
  withTiming,
  useSharedValue,
} from "react-native-reanimated";
import { useEffect } from "react";

interface ProgressProps {
  value: number; // 0-100
  variant?: "primary" | "success" | "warning" | "error";
  height?: number;
  showLabel?: boolean;
}

export function Progress({
  value,
  variant = "primary",
  height = 8,
  showLabel = false,
}: ProgressProps) {
  const width = useSharedValue(0);

  useEffect(() => {
    width.value = withTiming(value, { duration: 500 });
  }, [value]);

  const barStyle = useAnimatedStyle(() => ({
    width: `${width.value}%`,
  }));

  const colorClasses = {
    primary: "bg-primary",
    success: "bg-success",
    warning: "bg-accent",
    error: "bg-error",
  };

  return (
    <View className="w-full">
      <View
        className="w-full rounded-full bg-primary-container/30 overflow-hidden"
        style={{ height }}
      >
        <Animated.View
          className={`h-full rounded-full ${colorClasses[variant]}`}
          style={barStyle}
        />
      </View>
      {showLabel && (
        <ThemedText variant="caption" className="mt-1 text-right">
          {Math.round(value)}%
        </ThemedText>
      )}
    </View>
  );
}
```

Note: `useEffect` used only for animation target value tracking — this is a legitimate Reanimated use case.

**Step 4: Commit**

```bash
git add components/ui/Badge.tsx components/ui/Divider.tsx components/ui/Progress.tsx
git commit -m "feat: add Badge, Divider, and Progress atomic components"
```

---

## Phase 3: Hooks & Services

### Task 8: Create useResponsive Hook

**Files:**
- Create: `hooks/useResponsive.ts`
- Create: `constants/breakpoints.ts`

**Step 1: Create constants/breakpoints.ts**

```ts
export const breakpoints = {
  sm: 375,
  md: 768,
  lg: 1024,
  xl: 1440,
} as const;

export type Breakpoint = keyof typeof breakpoints;
```

**Step 2: Create hooks/useResponsive.ts**

```ts
import { useWindowDimensions } from "react-native";
import { useMemo } from "react";

export function useResponsive() {
  const { width, height } = useWindowDimensions();

  return useMemo(() => {
    const isPhone = width < 768;
    const isTablet = width >= 768 && width < 1024;
    const isDesktop = width >= 1024;
    const isPortrait = height > width;
    const isLandscape = width > height;

    return {
      width,
      height,
      isPhone,
      isTablet,
      isDesktop,
      isPortrait,
      isLandscape,
      columns: isPhone ? 1 : isLandscape ? 2 : 2,
      sidePadding: isPhone ? 16 : 24,
      maxContentWidth: Math.min(width, 1200),
    };
  }, [width, height]);
}
```

**Step 3: Commit**

```bash
git add hooks/useResponsive.ts constants/breakpoints.ts
git commit -m "feat: add useResponsive hook and breakpoint constants"
```

---

### Task 9: Extract useSchedule, useFeedHistory, useMotorControl Hooks

**Files:**
- Create: `hooks/useSchedule.ts`
- Create: `hooks/useFeedHistory.ts`
- Create: `hooks/useMotorControl.ts`
- Modify: `services/api.ts`

**Step 1: Update services/api.ts as unified REST client**

Rewrite `services/api.ts` to be the single source for all REST calls:

```ts
const BASE_URL = "https://floyd-feeder.up.railway.app";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) throw new Error(`API error: ${res.status} ${res.statusText}`);
  return res.json();
}

export interface Schedule {
  id: string;
  label: string;
  time: string;
  days: number[];
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface FeedHistoryEntry {
  id: string;
  timestamp: string;
  duration: number;
  augerSpeed: number;
  impellerSpeed: number;
  success: boolean;
}

export const api = {
  getSchedules: () => request<Schedule[]>("/api/schedules"),
  createSchedule: (data: Omit<Schedule, "id" | "createdAt" | "updatedAt">) =>
    request<Schedule>("/api/schedules", { method: "POST", body: JSON.stringify(data) }),
  updateSchedule: (id: string, data: Partial<Schedule>) =>
    request<Schedule>(`/api/schedules/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteSchedule: (id: string) =>
    request<void>(`/api/schedules/${id}`, { method: "DELETE" }),
  getFeedHistory: (limit = 50) =>
    request<FeedHistoryEntry[]>(`/api/history?limit=${limit}`),
};
```

**Step 2: Create hooks/useSchedule.ts**

```ts
import { useState, useCallback } from "react";
import { api, type Schedule } from "../services/api";

export function useSchedule() {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSchedules = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getSchedules();
      setSchedules(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const createSchedule = useCallback(async (data: Omit<Schedule, "id" | "createdAt" | "updatedAt">) => {
    const schedule = await api.createSchedule(data);
    setSchedules((prev) => [...prev, schedule]);
    return schedule;
  }, []);

  const updateSchedule = useCallback(async (id: string, data: Partial<Schedule>) => {
    const schedule = await api.updateSchedule(id, data);
    setSchedules((prev) => prev.map((s) => (s.id === id ? schedule : s)));
    return schedule;
  }, []);

  const toggleSchedule = useCallback(async (id: string, enabled: boolean) => {
    setSchedules((prev) =>
      prev.map((s) => (s.id === id ? { ...s, enabled } : s))
    );
    try {
      await api.updateSchedule(id, { enabled });
    } catch {
      setSchedules((prev) =>
        prev.map((s) => (s.id === id ? { ...s, enabled: !enabled } : s))
      );
    }
  }, []);

  const deleteSchedule = useCallback(async (id: string) => {
    setSchedules((prev) => prev.filter((s) => s.id !== id));
    try {
      await api.deleteSchedule(id);
    } catch {
      setSchedules((prev) => [...prev]);
    }
  }, []);

  return { schedules, loading, error, fetchSchedules, createSchedule, updateSchedule, toggleSchedule, deleteSchedule };
}
```

**Step 3: Create hooks/useFeedHistory.ts**

```ts
import { useState, useCallback } from "react";
import { api, type FeedHistoryEntry } from "../services/api";

export function useFeedHistory() {
  const [entries, setEntries] = useState<FeedHistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchHistory = useCallback(async (limit = 50) => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getFeedHistory(limit);
      setEntries(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  return { entries, loading, error, fetchHistory };
}
```

**Step 4: Create hooks/useMotorControl.ts**

```ts
import { useState, useCallback } from "react";

interface MotorConfig {
  augerSpeed: number;
  impellerSpeed: number;
  feedDuration: number;
  preSpin: number;
  postSpin: number;
}

const defaults: MotorConfig = {
  augerSpeed: 50,
  impellerSpeed: 50,
  feedDuration: 5,
  preSpin: 2,
  postSpin: 2,
};

export function useMotorControl() {
  const [config, setConfig] = useState<MotorConfig>(defaults);
  const [isFeeding, setIsFeeding] = useState(false);

  const updateConfig = useCallback((partial: Partial<MotorConfig>) => {
    setConfig((prev) => ({ ...prev, ...partial }));
  }, []);

  const getFeedCommand = useCallback(() => ({
    command: "start_feed",
    payload: {
      auger_speed: Math.round(config.augerSpeed * 10.23),
      impeller_speed: Math.round(config.impellerSpeed * 10.23),
      duration: config.feedDuration,
      pre_spin: config.preSpin,
      post_spin: config.postSpin,
    },
  }), [config]);

  return { config, updateConfig, isFeeding, setIsFeeding, getFeedCommand };
}
```

**Step 5: Commit**

```bash
git add services/api.ts hooks/useSchedule.ts hooks/useFeedHistory.ts hooks/useMotorControl.ts
git commit -m "feat: unify REST client and extract schedule/feed-history/motor hooks"
```

---

## Phase 4: Molecules (`components/molecules/`)

### Task 10: Build StatChip, EmptyState, Skeleton Components

**Files:**
- Create: `components/molecules/StatChip.tsx`
- Create: `components/molecules/EmptyState.tsx`
- Create: `components/molecules/Skeleton.tsx`

**Step 1: Create components/molecules/StatChip.tsx**

```tsx
import { View } from "react-native";
import { ThemedText } from "../ui/Text";
import { IconSymbol } from "../ui/IconSymbol";
import Animated, { FadeInDown } from "react-native-reanimated";

interface StatChipProps {
  icon: string;
  label: string;
  value: string;
  color?: string;
  delay?: number;
}

export function StatChip({ icon, label, value, color, delay = 0 }: StatChipProps) {
  return (
    <Animated.View
      entering={FadeInDown.delay(delay).springify()}
      className="flex-row items-center gap-2 bg-surface-card dark:bg-surface-card-dark rounded-xl px-4 py-3 border border-border dark:border-border-dark flex-1"
    >
      <IconSymbol name={icon} size={20} color={color} />
      <View className="flex-1">
        <ThemedText variant="caption" className="text-xs">
          {label}
        </ThemedText>
        <ThemedText variant="body" className="font-sans-bold">
          {value}
        </ThemedText>
      </View>
    </Animated.View>
  );
}
```

**Step 2: Create components/molecules/EmptyState.tsx**

```tsx
import { View } from "react-native";
import { ThemedText } from "../ui/Text";
import { IconSymbol } from "../ui/IconSymbol";
import { Button } from "../ui/Button";

interface EmptyStateProps {
  icon: string;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  onAction,
}: EmptyStateProps) {
  return (
    <View className="flex-1 items-center justify-center py-16 px-8">
      <IconSymbol name={icon} size={48} color="#94A3B8" />
      <ThemedText variant="h2" className="mt-4 text-center">
        {title}
      </ThemedText>
      <ThemedText variant="body" className="mt-2 text-center text-text-secondary dark:text-text-secondary-dark">
        {description}
      </ThemedText>
      {actionLabel && onAction && (
        <Button title={actionLabel} onPress={onAction} className="mt-6" />
      )}
    </View>
  );
}
```

**Step 3: Create components/molecules/Skeleton.tsx**

```tsx
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
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      className={`bg-text-secondary/20 dark:bg-text-secondary-dark/20 ${className ?? ""}`}
      style={[
        { width: width as any, height, borderRadius },
        animatedStyle,
      ]}
    />
  );
}

export function SkeletonCard() {
  return (
    <View className="p-5 bg-surface-card dark:bg-surface-card-dark rounded-card border border-border dark:border-border-dark gap-3">
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
```

Note: The `useEffect` here is for the infinite breathing animation loop, which is a legitimate Reanimated use case (animation lifecycle management).

**Step 4: Commit**

```bash
git add components/molecules/StatChip.tsx components/molecules/EmptyState.tsx components/molecules/Skeleton.tsx
git commit -m "feat: add StatChip, EmptyState, and Skeleton molecule components"
```

---

### Task 11: Build Gauge, SliderControl, TimelineNode, DayChip Components

**Files:**
- Create: `components/molecules/Gauge.tsx`
- Create: `components/molecules/SliderControl.tsx`
- Create: `components/molecules/TimelineNode.tsx`
- Create: `components/molecules/DayChip.tsx`

**Step 1: Create components/molecules/Gauge.tsx (enhanced CircularProgress)**

```tsx
import { View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import Animated, {
  useAnimatedProps,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { ThemedText } from "../ui/Text";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

interface GaugeProps {
  percentage: number;
  size?: number;
  strokeWidth?: number;
}

export function Gauge({ percentage, size = 160, strokeWidth = 12 }: GaugeProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const animatedProgress = useSharedValue(0);

  useMemo(() => {
    animatedProgress.value = withTiming(percentage, { duration: 1000 });
  }, [percentage]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - animatedProgress.value / 100),
  }));

  const getColor = () => {
    if (percentage < 20) return "#EF4444";
    if (percentage < 40) return "#F59E0B";
    return "#0E7490";
  };

  return (
    <View className="items-center justify-center" style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="#E5E7EB"
          strokeWidth={strokeWidth}
          fill="none"
        />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={getColor()}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          animatedProps={animatedProps}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <View className="absolute items-center">
        <ThemedText variant="display" className="text-primary">
          {Math.round(percentage)}
        </ThemedText>
        <ThemedText variant="caption">% full</ThemedText>
      </View>
    </View>
  );
}
```

Note: `useMemo` used for animation value tracking — not a `useEffect`, correctly pattern.

**Step 2: Create components/molecules/SliderControl.tsx**

```tsx
import { View } from "react-native";
import { ThemedText } from "../ui/Text";
import { IconSymbol } from "../ui/IconSymbol";
import { CustomSlider } from "../ui/CustomSlider";

interface SliderControlProps {
  icon: string;
  label: string;
  value: number;
  onValueChange: (v: number) => void;
  min?: number;
  max?: number;
  suffix?: string;
}

export function SliderControl({
  icon,
  label,
  value,
  onValueChange,
  min = 0,
  max = 100,
  suffix = "%",
}: SliderControlProps) {
  return (
    <View className="flex-row items-center gap-3 px-2">
      <IconSymbol name={icon} size={24} color="#0E7490" />
      <View className="flex-1">
        <View className="flex-row justify-between mb-1">
          <ThemedText variant="caption">{label}</ThemedText>
          <ThemedText variant="body" className="font-sans-bold text-primary">
            {value}{suffix}
          </ThemedText>
        </View>
        <CustomSlider
          value={value}
          onValueChange={onValueChange}
          min={min}
          max={max}
        />
      </View>
    </View>
  );
}
```

**Step 3: Create components/molecules/TimelineNode.tsx**

```tsx
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

export function TimelineNode({ color, time, title, subtitle, isLast }: TimelineNodeProps) {
  return (
    <Animated.View entering={FadeInLeft.springify()} className="flex-row">
      <View className="items-center mr-4">
        <View className={`w-3 h-3 rounded-full ${dotColors[color]}`} />
        {!isLast && <View className="w-0.5 flex-1 bg-border dark:bg-border-dark mt-1" />}
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
```

**Step 4: Create components/molecules/DayChip.tsx**

```tsx
import { Pressable } from "react-native";
import { ThemedText } from "../ui/Text";
import Animated, { useAnimatedStyle, withSpring, useSharedValue } from "react-native-reanimated";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface DayChipProps {
  day: string;
  date: string;
  feedCount: number;
  isActive: boolean;
  onPress: () => void;
}

export function DayChip({ day, date, feedCount, isActive, onPress }: DayChipProps) {
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
          : "bg-surface-card dark:bg-surface-card-dark border-border dark:border-border-dark"
      }`}
      accessibilityRole="button"
      accessibilityState={{ selected: isActive }}
    >
      <ThemedText variant="caption" className={isActive ? "text-white" : ""}>
        {day}
      </ThemedText>
      <ThemedText
        variant="body"
        className={`font-sans-bold ${isActive ? "text-white" : "text-primary"}`}
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
```

**Step 5: Commit**

```bash
git add components/molecules/Gauge.tsx components/molecules/SliderControl.tsx components/molecules/TimelineNode.tsx components/molecules/DayChip.tsx
git commit -m "feat: add Gauge, SliderControl, TimelineNode, and DayChip molecules"
```

---

## Phase 5: Organisms — Screen Sections

### Task 12: Build Dashboard Sections (DashboardHero, StatusStrip, AlertPanel)

**Files:**
- Create: `components/sections/DashboardHero.tsx`
- Create: `components/sections/StatusStrip.tsx`
- Create: `components/sections/AlertPanel.tsx`

**Step 1: Create components/sections/DashboardHero.tsx**

```tsx
import { View, RefreshControl } from "react-native";
import { useMemo } from "react";
import Animated, { FadeInDown } from "react-native-reanimated";
import { Surface } from "../ui/Surface";
import { ThemedText } from "../ui/Text";
import { Badge } from "../ui/Badge";
import { IconButton } from "../ui/IconButton";
import { Gauge } from "../molecules/Gauge";
import { SkeletonCard, Skeleton } from "../molecules/Skeleton";
import type { ConnectionStatus } from "../../hooks/useESP8266Context";

interface DashboardHeroProps {
  connectionStatus: ConnectionStatus;
  foodLevel: number;
  distance: number;
  isDistanceConnected: boolean;
  refreshing: boolean;
  onRefresh: () => void;
}

export function DashboardHero({
  connectionStatus,
  foodLevel,
  distance,
  isDistanceConnected,
  refreshing,
  onRefresh,
}: DashboardHeroProps) {
  const statusVariant = useMemo(() => {
    switch (connectionStatus) {
      case "connected": return "success" as const;
      case "connecting": return "warning" as const;
      default: return "error" as const;
    }
  }, [connectionStatus]);

  if (foodLevel === undefined || connectionStatus === "connecting") {
    return (
      <View className="px-4 pt-4">
        <SkeletonCard />
        <Skeleton width={160} height={160} className="self-center mt-6" borderRadius={80} />
      </View>
    );
  }

  return (
    <Animated.View entering={FadeInDown.springify()}>
      <View className="flex-row items-center justify-between px-4 pt-4">
        <View className="flex-row items-center gap-2">
          <ThemedText variant="h1">Floyd</ThemedText>
          <Badge
            label={connectionStatus === "connected" ? "Connected" : "Disconnected"}
            variant={statusVariant}
          />
        </View>
        <IconButton
          name="arrow.clockwise"
          onPress={onRefresh}
          accessibilityLabel="Refresh sensor data"
        />
      </View>

      <View className="items-center mt-4 mb-2">
        <Gauge percentage={foodLevel} size={180} strokeWidth={14} />
        <ThemedText variant="caption" className="mt-2">
          {distance.toFixed(1)} cm
          {!isDistanceConnected && " (sensor offline)"}
        </ThemedText>
      </View>
    </Animated.View>
  );
}
```

**Step 2: Create components/sections/StatusStrip.tsx**

```tsx
import { View } from "react-native";
import { StatChip } from "../molecules/StatChip";

interface StatusStripProps {
  temperature: number;
  motorState: string;
  wifiStrength: number;
  motorActive: boolean;
}

export function StatusStrip({ temperature, motorState, wifiStrength, motorActive }: StatusStripProps) {
  return (
    <View className="flex-row gap-3 px-4 mt-2">
      <StatChip
        icon="thermometer.medium"
        label="Water Temp"
        value={`${temperature.toFixed(1)}°C`}
        color="#0E7490"
      />
      <StatChip
        icon="gearshape.2"
        label="Motor"
        value={motorActive ? "Feeding" : motorState === "jam_clear" ? "Clearing" : "Idle"}
        color={motorActive ? "#F59E0B" : "#10B981"}
      />
      <StatChip
        icon="wifi"
        label="WiFi"
        value={`${wifiStrength}%`}
        color={wifiStrength > 50 ? "#10B981" : "#F59E0B"}
      />
    </View>
  );
}
```

**Step 3: Create components/sections/AlertPanel.tsx**

```tsx
import { View } from "react-native";
import { useMemo } from "react";
import Animated, { FadeInUp, FadeOutUp, Layout } from "react-native-reanimated";
import { Card } from "../ui/Card";
import { ThemedText } from "../ui/Text";
import { IconSymbol } from "../ui/IconSymbol";
import { Badge } from "../ui/Badge";
import type { Alert } from "../../hooks/useAlerts";

interface AlertPanelProps {
  alerts: Alert[];
  alertCount: number;
}

export function AlertPanel({ alerts, alertCount }: AlertPanelProps) {
  if (alertCount === 0) {
    return (
      <Card className="mx-4 mt-4">
        <View className="flex-row items-center gap-3">
          <IconSymbol name="checkmark.shield" size={24} color="#10B981" />
          <View>
            <ThemedText variant="body" className="font-sans-medium">All systems normal</ThemedText>
            <ThemedText variant="caption">No active alerts</ThemedText>
          </View>
        </View>
      </Card>
    );
  }

  return (
    <View className="mt-4 gap-2 mx-4">
      <ThemedText variant="h3" className="mb-1">
        Alerts ({alertCount})
      </ThemedText>
      {alerts.map((alert, i) => (
        <Animated.View
          key={alert.type + i}
          entering={FadeInUp.delay(i * 50).springify()}
          exiting={FadeOutUp}
          layout={Layout.springify()}
        >
          <Card className="flex-row items-start gap-3">
            <View
              className={`w-1 h-full rounded-full absolute left-0 top-0 bottom-0 ${
                alert.severity === "high" ? "bg-error" : "bg-accent"
              }`}
            />
            <View className="ml-3 flex-1">
              <View className="flex-row items-center gap-2 mb-1">
                <Badge
                  label={alert.severity.toUpperCase()}
                  variant={alert.severity === "high" ? "error" : "warning"}
                />
                <ThemedText variant="caption" className="flex-1 text-right">
                  {alert.timestamp}
                </ThemedText>
              </View>
              <ThemedText variant="body" className="font-sans-medium">
                {alert.message}
              </ThemedText>
            </View>
          </Card>
        </Animated.View>
      ))}
    </View>
  );
}
```

**Step 4: Commit**

```bash
git add components/sections/DashboardHero.tsx components/sections/StatusStrip.tsx components/sections/AlertPanel.tsx
git commit -m "feat: add DashboardHero, StatusStrip, and AlertPanel organism sections"
```

---

### Task 13: Build Control Sections (ControlPanel, SliderSheet)

**Files:**
- Create: `components/sections/ControlPanel.tsx`
- Create: `components/sections/SliderSheet.tsx`
- Modify: `components/ui/CustomSlider.tsx`

**Step 1: create components/sections/ControlPanel.tsx**

```tsx
import { View, Alert } from "react-native";
import Animated, {
  useAnimatedStyle,
  withSpring,
  withSequence,
  withTiming,
  useSharedValue,
  FadeInDown,
} from "react-native-reanimated";
import * as Haptic from "expo-haptics";
import { Platform } from "react-native";
import { ThemedText } from "../ui/Text";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { Badge } from "../ui/Badge";

interface ControlPanelProps {
  motorState: string;
  isFeeding: boolean;
  isConnected: boolean;
  isHardwareOnline: boolean;
  onFeed: () => void;
  onStop: () => void;
  onClearJam: () => void;
  onOpenSettings: () => void;
}

export function ControlPanel({
  motorState,
  isFeeding,
  isConnected,
  isHardwareOnline,
  onFeed,
  onStop,
  onClearJam,
  onOpenSettings,
}: ControlPanelProps) {
  const scale = useSharedValue(1);
  const ripple = useSharedValue(0);

  const feedButtonStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    shadowOpacity: withTiming(isFeeding ? 0.3 : 0.1),
  }));

  const handleFeed = () => {
    if (Platform.OS === "ios") {
      Haptic.impactAsync(Haptic.ImpactFeedbackStyle.Heavy);
    }
    scale.value = withSequence(
      withSpring(0.9, { damping: 10, stiffness: 200 }),
      withSpring(1.05, { damping: 8, stiffness: 150 }),
      withSpring(1, { damping: 12, stiffness: 180 })
    );
    onFeed();
  };

  const handleClearJam = () => {
    Alert.alert(
      "Clear Jam",
      "The auger will run in reverse to clear the jam. Continue?",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Clear Jam", style: "destructive", onPress: onClearJam },
      ]
    );
  };

  const canAct = isConnected && isHardwareOnline;

  return (
    <Animated.View entering={FadeInDown.springify()} className="items-center mt-6">
      {/* FEED button */}
      <Animated.View style={feedButtonStyle}>
        <Button
          title={isFeeding ? "FEEDING..." : "FEED"}
          variant="primary"
          size="lg"
          onPress={handleFeed}
          disabled={!canAct || isFeeding}
          className="w-40 h-40 rounded-full"
        />
      </Animated.View>

      {/* Motor state indicator */}
      <View className="flex-row items-center gap-2 mt-4">
        <View
          className={`w-2 h-2 rounded-full ${
            isFeeding ? "bg-accent animate-pulse" : "bg-success"
          }`}
        />
        <ThemedText variant="caption">
          {isFeeding ? "Motor running" : "Motor idle"}
        </ThemedText>
      </View>

      {/* Connection status */}
      {!canAct && (
        <Card className="mt-4 mx-4 flex-row items-center gap-2">
          <Badge label="OFFLINE" variant="error" />
          <ThemedText variant="caption" className="flex-1">
            {!isConnected
              ? "Not connected to cloud server"
              : "Hardware not reachable"}
          </ThemedText>
        </Card>
      )}

      {/* Action buttons */}
      <View className="flex-row gap-3 mt-4">
        {isFeeding && (
          <Button title="STOP" variant="danger" onPress={onStop} />
        )}
        <Button
          title="Settings"
          variant="ghost"
          onPress={onOpenSettings}
        />
        {canAct && (
          <Button
            title="Clear Jam"
            variant="secondary"
            onPress={handleClearJam}
          />
        )}
      </View>
    </Animated.View>
  );
}
```

**Step 2: Create components/sections/SliderSheet.tsx**

```tsx
import { View, Modal, Pressable } from "react-native";
import { ThemedText } from "../ui/Text";
import { Button } from "../ui/Button";
import { SliderControl } from "../molecules/SliderControl";
import { Card } from "../ui/Card";
import { useSafeAreaInsets } from "react-native-safe-area-context";

interface SliderSheetProps {
  visible: boolean;
  onClose: () => void;
  augerSpeed: number;
  impellerSpeed: number;
  feedDuration: number;
  preSpin: number;
  postSpin: number;
  onAugerChange: (v: number) => void;
  onImpellerChange: (v: number) => void;
  onDurationChange: (v: number) => void;
  onPreSpinChange: (v: number) => void;
  onPostSpinChange: (v: number) => void;
}

export function SliderSheet({
  visible,
  onClose,
  augerSpeed,
  impellerSpeed,
  feedDuration,
  preSpin,
  postSpin,
  onAugerChange,
  onImpellerChange,
  onDurationChange,
  onPreSpinChange,
  onPostSpinChange,
}: SliderSheetProps) {
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <Pressable
        className="flex-1 bg-surface dark:bg-surface-dark"
        style={{ paddingTop: insets.top }}
      >
        <View className="flex-row items-center justify-between px-5 py-4">
          <ThemedText variant="h2">Feed Settings</ThemedText>
          <Button title="Done" variant="ghost" onPress={onClose} />
        </View>

        <View className="gap-6 px-4 pt-4" style={{ paddingBottom: insets.bottom + 20 }}>
          <SliderControl
            icon="gearshape.2"
            label="Auger Speed"
            value={augerSpeed}
            onValueChange={onAugerChange}
          />
          <SliderControl
            icon="gearshape.2"
            label="Impeller Speed"
            value={impellerSpeed}
            onValueChange={onImpellerChange}
          />
          <SliderControl
            icon="timer"
            label="Feed Duration"
            value={feedDuration}
            onValueChange={onDurationChange}
            min={0}
            max={30}
            suffix="s"
          />
          <SliderControl
            icon="timer"
            label="Pre-Spin"
            value={preSpin}
            onValueChange={onPreSpinChange}
            min={0}
            max={10}
            suffix="s"
          />
          <SliderControl
            icon="timer"
            label="Post-Spin"
            value={postSpin}
            onValueChange={onPostSpinChange}
            min={0}
            max={10}
            suffix="s"
          />
        </View>
      </Pressable>
    </Modal>
  );
}
```

Note: Relies on `CustomSlider` from existing `components/ui/CustomSlider.tsx`. Ensure it still works — if not, may need to refactor it to accept className.

**Step 3: Commit**

```bash
git add components/sections/ControlPanel.tsx components/sections/SliderSheet.tsx
git commit -m "feat: add ControlPanel and SliderSheet organism sections"
```

---

### Task 14: Build Log and Schedule Sections

**Files:**
- Create: `components/sections/LogTimeline.tsx`
- Create: `components/sections/ScheduleTimeline.tsx`

**Step 1: Create components/sections/LogTimeline.tsx**

```tsx
import { View, FlatList } from "react-native";
import { useState, useMemo } from "react";
import { ThemedText } from "../ui/Text";
import { TimelineNode } from "../molecules/TimelineNode";
import { EmptyState } from "../molecules/EmptyState";
import { TabButton } from "../ui/TabButton";

type LogFilter = "sensors" | "alerts" | "feeds";

interface LogTimelineProps {
  sensorLogs: Array<{ timestamp: string; temperature: number; distance: number; foodLevel: number }>;
  alertLogs: Array<{ type: string; message: string; timestamp: string; severity: string }>;
  feedLogs: Array<{ id: string; timestamp: string; duration: number; success: boolean; augerSpeed: number; impellerSpeed: number }>;
  onClear: () => void;
}

export function LogTimeline({ sensorLogs, alertLogs, feedLogs, onClear }: LogTimelineProps) {
  const [filter, setFilter] = useState<LogFilter>("sensors");

  const data = useMemo(() => {
    switch (filter) {
      case "sensors": return sensorLogs;
      case "alerts": return alertLogs;
      case "feeds": return feedLogs;
    }
  }, [filter, sensorLogs, alertLogs, feedLogs]);

  const renderItem = ({ item, index }: { item: any; index: number }) => {
    const isLast = index === data.length - 1;
    switch (filter) {
      case "sensors":
        return (
          <TimelineNode
            color="green"
            time={new Date(item.timestamp).toLocaleTimeString()}
            title={`${item.temperature?.toFixed(1) ?? "--"}°C  |  ${item.distance?.toFixed(1) ?? "--"}cm`}
            subtitle={`Food: ${item.foodLevel?.toFixed(0) ?? "--"}%`}
            isLast={isLast}
          />
        );
      case "alerts":
        return (
          <TimelineNode
            color={item.severity === "high" ? "red" : "amber"}
            time={new Date(item.timestamp).toLocaleTimeString()}
            title={item.message}
            subtitle={item.type}
            isLast={isLast}
          />
        );
      case "feeds":
        return (
          <TimelineNode
            color="blue"
            time={new Date(item.timestamp).toLocaleTimeString()}
            title={`${item.duration}s feed`}
            subtitle={item.success ? "Completed" : "Failed"}
            isLast={isLast}
          />
        );
    }
  };

  return (
    <View className="flex-1">
      <View className="flex-row gap-2 px-4 py-3">
        {(["sensors", "alerts", "feeds"] as LogFilter[]).map((f) => (
          <TabButton
            key={f}
            title={f === "sensors" ? "Sensor Data" : f === "alerts" ? "Alerts" : "Feeds"}
            isActive={filter === f}
            onPress={() => setFilter(f)}
          />
        ))}
        <View className="flex-1" />
        <TabButton
          title="Clear"
          isActive={false}
          onPress={onClear}
        />
      </View>

      <FlatList
        data={data}
        renderItem={renderItem}
        keyExtractor={(_, i) => `${filter}-${i}`}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 100 }}
        ListEmptyComponent={
          <EmptyState
            icon="doc.text"
            title="No entries"
            description={`No ${filter} data recorded yet`}
          />
        }
      />
    </View>
  );
}
```

**Step 2: Create components/sections/ScheduleTimeline.tsx**

```tsx
import { View, FlatList, ScrollView } from "react-native";
import { useMemo } from "react";
import { ThemedText } from "../ui/Text";
import { Card } from "../ui/Card";
import { DayChip } from "../molecules/DayChip";
import { EmptyState } from "../molecules/EmptyState";
import { Button } from "../ui/Button";
import { Badge } from "../ui/Badge";
import type { Schedule } from "../../hooks/useSchedule";

interface ScheduleTimelineProps {
  schedules: Schedule[];
  selectedDay: number;
  onSelectDay: (day: number) => void;
  onToggle: (id: string, enabled: boolean) => void;
  onEdit: (schedule: Schedule) => void;
  onDelete: (id: string) => void;
  onAdd: () => void;
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function ScheduleTimeline({
  schedules,
  selectedDay,
  onSelectDay,
  onToggle,
  onEdit,
  onDelete,
  onAdd,
}: ScheduleTimelineProps) {
  const filtered = useMemo(
    () => schedules.filter((s) => s.days.includes(selectedDay)),
    [schedules, selectedDay]
  );

  return (
    <View className="flex-1">
      {/* Week strip */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        className="py-3"
        contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}
      >
        {DAY_NAMES.map((day, i) => (
          <DayChip
            key={day}
            day={day}
            date={String(i + 1)}
            feedCount={schedules.filter((s) => s.days.includes(i)).length}
            isActive={selectedDay === i}
            onPress={() => onSelectDay(i)}
          />
        ))}
      </ScrollView>

      {/* Timeline */}
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 100 }}
        ListEmptyComponent={
          <EmptyState
            icon="clock"
            title="No schedules"
            description={`No feeding schedules for ${DAY_NAMES[selectedDay]}`}
            actionLabel="Add Schedule"
            onAction={onAdd}
          />
        }
        renderItem={({ item }) => (
          <Card className="mb-3">
            <View className="flex-row items-center justify-between">
              <View className="flex-1">
                <ThemedText variant="body" className="font-sans-bold">
                  {item.label || "Feed"}
                </ThemedText>
                <View className="flex-row items-center gap-2 mt-1">
                  <ThemedText variant="caption">⏰ {item.time}</ThemedText>
                  <Badge
                    label={item.enabled ? "Active" : "Paused"}
                    variant={item.enabled ? "success" : "neutral"}
                  />
                </View>
                <View className="flex-row gap-1 mt-2">
                  {DAY_NAMES.map((d, i) => (
                    <View
                      key={d}
                      className={`w-7 h-7 rounded-full items-center justify-center ${
                        item.days.includes(i) ? "bg-primary-container" : "bg-transparent"
                      }`}
                    >
                      <ThemedText
                        variant="caption"
                        className={item.days.includes(i) ? "text-primary font-sans-bold" : ""}
                      >
                        {d[0]}
                      </ThemedText>
                    </View>
                  ))}
                </View>
              </View>
              <View className="gap-2">
                <Button
                  title={item.enabled ? "Disable" : "Enable"}
                  variant={item.enabled ? "secondary" : "primary"}
                  size="sm"
                  onPress={() => onToggle(item.id, !item.enabled)}
                />
                <Button
                  title="Edit"
                  variant="ghost"
                  size="sm"
                  onPress={() => onEdit(item)}
                />
              </View>
            </View>
          </Card>
        )}
      />

      {/* FAB */}
      <Button
        title="+"
        variant="primary"
        size="lg"
        onPress={onAdd}
        className="absolute bottom-6 right-6 w-14 h-14 rounded-full shadow-lg"
      />
    </View>
  );
}
```

**Step 3: Commit**

```bash
git add components/sections/LogTimeline.tsx components/sections/ScheduleTimeline.tsx
git commit -m "feat: add LogTimeline and ScheduleTimeline organism sections"
```

---

## Phase 6: Screen Rewiring

### Task 15: Rewrite Dashboard Screen

**Files:**
- Modify: `app/(tabs)/index.tsx`

**Step 1: Rewrite dashboard to use new section components**

Rewrite `index.tsx` to ~150 lines using the organism sections:

```tsx
import { ScrollView, RefreshControl } from "react-native";
import { useCallback, useMemo } from "react";
import { Surface } from "@/components/ui/Surface";
import { DashboardHero } from "@/components/sections/DashboardHero";
import { StatusStrip } from "@/components/sections/StatusStrip";
import { AlertPanel } from "@/components/sections/AlertPanel";
import { useESP8266Context } from "@/hooks/useESP8266Context";
import { useAlerts } from "@/hooks/useAlerts";
import { useColorScheme } from "@/hooks/useColorScheme";

export default function DashboardScreen() {
  const {
    deviceData,
    esp8266Status,
    connectionStatus,
    refreshData,
    refreshing,
  } = useESP8266Context();

  const { alerts, alertCount } = useAlerts(deviceData);

  const foodLevel = useMemo(() => {
    if (typeof deviceData?.foodLevel === "number") return deviceData.foodLevel;
    const d = deviceData?.distance;
    if (typeof d !== "number" || d > 400 || d < 0) return undefined;
    return Math.max(0, Math.min(100, 100 - (d / 40) * 100));
  }, [deviceData]);

  const handleRefresh = useCallback(() => {
    refreshData();
  }, [refreshData]);

  return (
    <Surface safeTop className="flex-1">
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
        contentContainerStyle={{ paddingBottom: 100 }}
      >
        <DashboardHero
          connectionStatus={connectionStatus}
          foodLevel={foodLevel ?? 0}
          distance={deviceData?.distance ?? 0}
          isDistanceConnected={deviceData?.isDistanceConnected ?? false}
          refreshing={refreshing}
          onRefresh={handleRefresh}
        />

        <StatusStrip
          temperature={deviceData?.temperature ?? 0}
          motorState={deviceData?.motorState ?? "idle"}
          wifiStrength={deviceData?.wifiStrength ?? 0}
          motorActive={deviceData?.motorState === "feeding"}
        />

        <AlertPanel alerts={alerts} alertCount={alertCount} />
      </ScrollView>
    </Surface>
  );
}
```

**Step 2: Commit**

```bash
git add app/(tabs)/index.tsx
git commit -m "feat: rewrite Dashboard screen with new organism sections"
```

---

### Task 16: Rewrite Controls Screen

**Files:**
- Modify: `app/(tabs)/controls.tsx`

**Step 1: Rewrite controls to use ControlPanel + SliderSheet**

```tsx
import { useState, useCallback } from "react";
import { Surface } from "@/components/ui/Surface";
import { ControlPanel } from "@/components/sections/ControlPanel";
import { SliderSheet } from "@/components/sections/SliderSheet";
import { useESP8266Context } from "@/hooks/useESP8266Context";
import { useMotorControl } from "@/hooks/useMotorControl";

export default function ControlsScreen() {
  const [showSettings, setShowSettings] = useState(false);
  const {
    deviceData,
    esp8266Status,
    connectionStatus,
    sendCommand,
  } = useESP8266Context();

  const { config, updateConfig, isFeeding, setIsFeeding, getFeedCommand } =
    useMotorControl();

  const handleFeed = useCallback(() => {
    const cmd = getFeedCommand();
    sendCommand(cmd);
    setIsFeeding(true);
  }, [getFeedCommand, sendCommand, setIsFeeding]);

  const handleStop = useCallback(() => {
    sendCommand({ command: "stop_feed" });
    setIsFeeding(false);
  }, [sendCommand, setIsFeeding]);

  const handleClearJam = useCallback(() => {
    sendCommand({ command: "clear_jam" });
  }, [sendCommand]);

  return (
    <Surface safeTop className="flex-1 items-center justify-center">
      <ControlPanel
        motorState={deviceData?.motorState ?? "idle"}
        isFeeding={isFeeding}
        isConnected={connectionStatus === "connected"}
        isHardwareOnline={esp8266Status === "online"}
        onFeed={handleFeed}
        onStop={handleStop}
        onClearJam={handleClearJam}
        onOpenSettings={() => setShowSettings(true)}
      />

      <SliderSheet
        visible={showSettings}
        onClose={() => setShowSettings(false)}
        augerSpeed={config.augerSpeed}
        impellerSpeed={config.impellerSpeed}
        feedDuration={config.feedDuration}
        preSpin={config.preSpin}
        postSpin={config.postSpin}
        onAugerChange={(v) => updateConfig({ augerSpeed: v })}
        onImpellerChange={(v) => updateConfig({ impellerSpeed: v })}
        onDurationChange={(v) => updateConfig({ feedDuration: v })}
        onPreSpinChange={(v) => updateConfig({ preSpin: v })}
        onPostSpinChange={(v) => updateConfig({ postSpin: v })}
      />
    </Surface>
  );
}
```

**Step 2: Commit**

```bash
git add app/(tabs)/controls.tsx
git commit -m "feat: rewrite Controls screen with ControlPanel + SliderSheet"
```

---

### Task 17: Rewrite Logs Screen

**Files:**
- Modify: `app/(tabs)/history.tsx`

```tsx
import { useState, useCallback } from "react";
import { Surface } from "@/components/ui/Surface";
import { LogTimeline } from "@/components/sections/LogTimeline";
import { useESP8266Context } from "@/hooks/useESP8266Context";
import { useFeedHistory } from "@/hooks/useFeedHistory";
import { useFocusEffect } from "expo-router";

export default function HistoryScreen() {
  const [sensorLogs, setSensorLogs] = useState<any[]>([]);
  const { deviceData } = useESP8266Context();
  const { entries: feedLogs, fetchHistory } = useFeedHistory();
  const [alertLogs, setAlertLogs] = useState<any[]>([]);

  useFocusEffect(
    useCallback(() => {
      fetchHistory();
    }, [fetchHistory])
  );

  // Accumulate sensor readings when on this screen
  useFocusEffect(
    useCallback(() => {
      if (deviceData?.timestamp) {
        setSensorLogs((prev) => {
          const exists = prev.some(
            (l) => l.timestamp === deviceData.timestamp
          );
          if (exists) return prev;
          return [
            { ...deviceData, timestamp: deviceData.timestamp },
            ...prev.slice(0, 49),
          ];
        });
      }
    }, [deviceData])
  );

  const handleClear = useCallback(() => {
    setSensorLogs([]);
  }, []);

  return (
    <Surface safeTop className="flex-1">
      <LogTimeline
        sensorLogs={sensorLogs}
        alertLogs={alertLogs}
        feedLogs={feedLogs}
        onClear={handleClear}
      />
    </Surface>
  );
}
```

**Step 2: Commit**

```bash
git add app/(tabs)/history.tsx
git commit -m "feat: rewrite Logs screen with LogTimeline section"
```

---

### Task 18: Rewrite Schedule Screen

**Files:**
- Modify: `app/(tabs)/schedule.tsx`

```tsx
import { useState, useCallback } from "react";
import { Alert } from "react-native";
import { Surface } from "@/components/ui/Surface";
import { ScheduleTimeline } from "@/components/sections/ScheduleTimeline";
import { useSchedule } from "@/hooks/useSchedule";
import { useFocusEffect } from "expo-router";
import type { Schedule } from "@/hooks/useSchedule";

export default function ScheduleScreen() {
  const {
    schedules,
    loading,
    fetchSchedules,
    toggleSchedule,
    createSchedule,
    updateSchedule,
    deleteSchedule,
  } = useSchedule();

  const [selectedDay, setSelectedDay] = useState(new Date().getDay());
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<Schedule | null>(null);

  useFocusEffect(
    useCallback(() => {
      fetchSchedules();
    }, [fetchSchedules])
  );

  const handleToggle = useCallback(
    (id: string, enabled: boolean) => {
      toggleSchedule(id, enabled);
    },
    [toggleSchedule]
  );

  const handleEdit = useCallback((schedule: Schedule) => {
    setEditingSchedule(schedule);
    setEditModalVisible(true);
  }, []);

  const handleDelete = useCallback(
    (id: string) => {
      Alert.alert("Delete Schedule", "Remove this feeding schedule?", [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: () => deleteSchedule(id) },
      ]);
    },
    [deleteSchedule]
  );

  const handleAdd = useCallback(() => {
    setEditingSchedule(null);
    setEditModalVisible(true);
  }, []);

  return (
    <Surface safeTop className="flex-1">
      <ScheduleTimeline
        schedules={schedules}
        selectedDay={selectedDay}
        onSelectDay={setSelectedDay}
        onToggle={handleToggle}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onAdd={handleAdd}
      />
    </Surface>
  );
}
```

**Step 2: Commit**

```bash
git add app/(tabs)/schedule.tsx
git commit -m "feat: rewrite Schedule screen with ScheduleTimeline section"
```

---

## Phase 7: Animation & Polish

### Task 19: Add Tab Bar Animations and Polish

**Files:**
- Modify: `app/(tabs)/_layout.tsx`

**Step 1: Enhance tab bar with ripple indicator and transition animations**

Update `app/(tabs)/_layout.tsx` to add:
- Custom `tabBarIcon` that scales on active tab using Reanimated
- Ripple dot indicator below active icon
- Tab bar background with ocean gradient hint

Use the existing `HapticTab` and `TabBarBackground` but enhance them.

**Step 2: Commit**

```bash
git add app/(tabs)/_layout.tsx components/HapticTab.tsx
git commit -m "feat: add animated tab bar with ripple indicator and transitions"
```

---

### Task 20: Add Page Transition Animations

**Files:**
- Modify: `app/_layout.tsx`

Add `screenOptions` with custom `animation` to the Stack navigator for fluid slide transitions between screens. Since we use tabs, this is mostly for any future stack screens.

---

## Phase 8: Responsive Layouts

### Task 21: Implement Responsive Grid Layouts

**Files:**
- Modify: `app/(tabs)/index.tsx` (Dashboard)
- Modify: `app/(tabs)/controls.tsx` (Controls)
- Modify: `components/sections/DashboardHero.tsx`
- Modify: `components/sections/StatusStrip.tsx`

**Step 1: Add responsive breakpoint logic to Dashboard**

Use `useResponsive()` hook. On tablet/landscape:
- DashboardHero and StatusStrip render side-by-side in a 2-column grid
- AlertPanel gets wider cards
- Adjust padding and font sizes

**Step 2: Add responsive logic to Controls**

On landscape/tablet: show sliders inline beside the FEED button instead of in a modal.

**Step 3: Commit**

```bash
git add app/ components/sections/
git commit -m "feat: add responsive grid layouts for tablet and landscape"
```

---

## Phase 9: Accessibility

### Task 22: Add Accessibility Labels and Roles

**Files:**
- Modify: `components/ui/Button.tsx` (already has some — verify)
- Modify: `components/ui/IconButton.tsx` (already has some — verify)
- Modify: `components/ui/Badge.tsx`
- Modify: `components/molecules/StatChip.tsx`
- Modify: `components/molecules/TimelineNode.tsx`
- Modify: `components/molecules/DayChip.tsx`
- Modify: All section components
- Modify: `components/HapticTab.tsx`

**Step 1: Audit and add accessibility props**

For every interactive element:
- `accessibilityRole`: button, header, tab, image, switch, etc.
- `accessibilityLabel`: descriptive string
- `accessibilityState`: selected, disabled, expanded, etc.

For non-interactive but meaningful elements:
- `accessible={true}`
- `accessibilityLabel`

**Step 2: Add reduced-motion support**

Wrap all `useSharedValue(0)` → `withTiming()` calls to check `AccessibilityInfo.isReduceMotionEnabled()` before animating:

```ts
import { AccessibilityInfo } from "react-native";

const [reduceMotion, setReduceMotion] = useState(false);

useEffect(() => {
  AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
  const sub = AccessibilityInfo.addEventListener(
    "reduceMotionChanged",
    setReduceMotion
  );
  return () => sub.remove();
}, []);
```

When `reduceMotion` is true, set animation duration to 0 or skip animations.

**Step 3: Commit**

```bash
git add components/ hooks/
git commit -m "feat: add comprehensive accessibility labels, roles, and reduced-motion support"
```

---

## Phase 10: Cleanup

### Task 23: Remove Dead Code and Unused Dependencies

**Files to remove:**
- Remove: `components/ThemedText.tsx` (replaced by `components/ui/Text.tsx`)
- Remove: `components/ThemedView.tsx` (replaced by `components/ui/Surface.tsx`)
- Remove: `components/AnimatedButton.tsx` (replaced by `components/ui/Button.tsx`)
- Deprecate: `constants/Colors.ts` (replaced by `theme/colors.ts`)
- Remove: `services/api.ts` old version (replaced)

**Dependencies to uninstall:**
```bash
npm uninstall @prisma/client @prisma/react-native react-native-webview
```

**Step 1: Run uninstall**

```bash
npm uninstall @prisma/client @prisma/react-native react-native-webview
```

**Step 2: Remove dead files and update imports**

Remove old components and update any remaining imports across the codebase.

**Step 3: Run lint**

```bash
npx expo lint
```

Fix any lint errors.

**Step 4: Commit**

```bash
git add .
git commit -m "chore: remove dead code and unused dependencies (prisma client, webview)"
```

---

## Final Verification

### Task 24: Full Build and Lint Check

**Step 1: Lint**

```bash
npx expo lint
```
Expected: Zero errors.

**Step 2: TypeScript check**

```bash
npx tsc --noEmit
```
Expected: Zero type errors.

**Step 3: Test on device/simulator**

```bash
npx expo start
```
Verify:
- Dashboard loads with gauge, stats, alerts
- Controls FEED button works, settings sheet opens
- Log timeline renders with filter chips
- Schedule displays with day selector
- Dark mode toggles correctly
- Tab bar animations play
- No screen has horizontal scroll
- All interactive elements have press feedback

**Step 4: Commit final fixes**

```bash
git add .
git commit -m "fix: final lint and type fixes for UI overhaul"
```

---

## Summary

| Phase | Tasks | Files Created | Files Modified | Files Removed |
|---|---|---|---|---|
| 1. Infrastructure | 3 | 5 | 2 | 0 |
| 2. Atomic Components | 4 | 8 | 0 | 0 |
| 3. Hooks & Services | 2 | 4 | 1 | 0 |
| 4. Molecules | 2 | 8 | 0 | 0 |
| 5. Organisms | 3 | 7 | 0 | 0 |
| 6. Screen Rewiring | 4 | 0 | 4 | 0 |
| 7. Animation & Polish | 2 | 0 | 2 | 0 |
| 8. Responsive | 1 | 0 | 4 | 0 |
| 9. Accessibility | 1 | 0 | ~10 | 0 |
| 10. Cleanup | 1 | 0 | 0 | ~5 |
| 11. Verification | 1 | 0 | 0 | 0 |

**Total: 24 tasks, ~32 new files, ~23 modified files, ~5 removed files**
