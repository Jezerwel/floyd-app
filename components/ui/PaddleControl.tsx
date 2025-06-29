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
        styles.paddleContainer,
        {
          backgroundColor: isActive ? colors.card : colors.background,
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
            size={24}
            color={isActive ? colors.primary : colors.muted}
          />
        }
      />
    </View>
  );
};

const styles = StyleSheet.create({
  paddleContainer: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 2,
    minHeight: 200,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 3,
  },
});
