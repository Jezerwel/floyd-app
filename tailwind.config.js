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
