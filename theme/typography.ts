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
