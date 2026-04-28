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
      className={`flex-1 bg-surface ${className ?? ""}`}
      style={[
        safeTop && { paddingTop: insets.top },
        safeBottom && { paddingBottom: insets.bottom },
        style,
      ].filter(Boolean)}
      {...props}
    />
  );
}
