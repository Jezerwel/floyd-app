import { Text as RNText, type TextProps as RNTextProps } from "react-native";

type TextVariant = "display" | "h1" | "h2" | "h3" | "body" | "caption" | "mono";

const variantClasses: Record<TextVariant, string> = {
  display: "font-display text-[40px] text-primary leading-tight",
  h1: "font-sans-bold text-2xl text-text-primary leading-tight",
  h2: "font-sans-bold text-xl text-text-primary leading-tight",
  h3: "font-sans-medium text-lg text-text-primary leading-tight",
  body: "font-sans text-base text-text-primary leading-normal",
  caption: "font-sans text-sm text-text-secondary leading-normal",
  mono: "font-mono text-sm text-text-secondary leading-normal",
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
      className={`${variantClasses[variant]} ${className ?? ""}`}
      style={color ? { color } : undefined}
      {...props}
    />
  );
}
