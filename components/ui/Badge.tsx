import { View } from "react-native";
import { ThemedText } from "./Text";

type BadgeVariant = "success" | "warning" | "error" | "info" | "neutral";

const variantStyles: Record<
  BadgeVariant,
  { bg: string; text: string; bgFallback: string }
> = {
  success: {
    bg: "bg-success/15",
    text: "text-success",
    bgFallback: "rgba(16, 185, 129, 0.15)",
  },
  warning: {
    bg: "bg-accent/15",
    text: "text-accent",
    bgFallback: "rgba(245, 158, 11, 0.15)",
  },
  error: {
    bg: "bg-error/15",
    text: "text-error",
    bgFallback: "rgba(239, 68, 68, 0.15)",
  },
  info: {
    bg: "bg-primary/15",
    text: "text-primary",
    bgFallback: "rgba(14, 116, 144, 0.15)",
  },
  neutral: {
    bg: "bg-slate-200 dark:bg-slate-700",
    text: "text-text-secondary",
    bgFallback: "rgba(226, 232, 240, 0.15)",
  },
};

interface BadgeProps {
  label: string;
  variant?: BadgeVariant;
  size?: "sm" | "md";
}

export function Badge({ label, variant = "neutral", size = "sm" }: BadgeProps) {
  const styles = variantStyles[variant];

  return (
    <View
      className={`rounded-pill items-center justify-center ${
        size === "sm" ? "px-2 py-0.5" : "px-3 py-1"
      } ${styles.bg}`}
      style={
        variant !== "neutral"
          ? { backgroundColor: styles.bgFallback }
          : undefined
      }
    >
      <ThemedText
        variant="caption"
        className={`${size === "sm" ? "text-xs" : "text-sm"} ${styles.text}`}
      >
        {label}
      </ThemedText>
    </View>
  );
}
