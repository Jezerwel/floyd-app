import { View, type ViewProps } from "react-native";

interface CardProps extends ViewProps {
  noPadding?: boolean;
}

export function Card({
  noPadding = false,
  className,
  children,
  ...props
}: CardProps) {
  return (
    <View
      className={`bg-surface-card border border-border rounded-card ${
        noPadding ? "" : "p-5"
      } ${className ?? ""}`}
      {...props}
    >
      {children}
    </View>
  );
}
