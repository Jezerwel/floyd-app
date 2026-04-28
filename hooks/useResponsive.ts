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
      columns: isPhone ? 1 : 2,
      sidePadding: isPhone ? 16 : 24,
      maxContentWidth: Math.min(width, 1200),
    };
  }, [width, height]);
}
