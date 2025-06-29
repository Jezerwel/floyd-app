/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

/**
 * FLOYD 1.0 Fish Feeder App Colors
 * Marine Green Theme
 */

const primaryTeal = "#0D9488";
const secondarySeaGreen = "#10B981";
const accentYellow = "#F59E0B";
const backgroundMintCream = "#F0FDF4";

export const Colors = {
  light: {
    text: "#1F2937",
    background: backgroundMintCream,
    tint: primaryTeal,
    icon: "#6B7280",
    tabIconDefault: "#6B7280",
    tabIconSelected: primaryTeal,
    primary: primaryTeal,
    secondary: secondarySeaGreen,
    accent: accentYellow,
    card: "#FFFFFF",
    border: "#E5E7EB",
    success: secondarySeaGreen,
    warning: accentYellow,
    error: "#EF4444",
    muted: "#9CA3AF",
  },
  dark: {
    text: "#F9FAFB",
    background: "#111827",
    tint: secondarySeaGreen,
    icon: "#9CA3AF",
    tabIconDefault: "#9CA3AF",
    tabIconSelected: secondarySeaGreen,
    primary: secondarySeaGreen,
    secondary: primaryTeal,
    accent: accentYellow,
    card: "#1F2937",
    border: "#374151",
    success: secondarySeaGreen,
    warning: accentYellow,
    error: "#EF4444",
    muted: "#6B7280",
  },
};
