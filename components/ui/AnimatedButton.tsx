import React, { useRef } from "react";
import {
  Animated,
  StyleSheet,
  Text,
  TouchableWithoutFeedback,
  ViewStyle,
  TextStyle,
} from "react-native";
import * as Haptics from "expo-haptics";
import { IconSymbol } from "./IconSymbol";

interface AnimatedButtonProps {
  onPress: () => void;
  title: string;
  icon?: string;
  backgroundColor: string;
  textColor?: string;
  disabled?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
  hapticFeedback?: boolean;
  size?: "small" | "medium" | "large";
}

export const AnimatedButton: React.FC<AnimatedButtonProps> = ({
  onPress,
  title,
  icon,
  backgroundColor,
  textColor = "white",
  disabled = false,
  style,
  textStyle,
  hapticFeedback = true,
  size = "medium",
}) => {
  const scaleValue = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.spring(scaleValue, {
      toValue: 0.95,
      friction: 3,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleValue, {
      toValue: 1,
      friction: 3,
      useNativeDriver: true,
    }).start();
  };

  const handlePress = () => {
    if (disabled) return;

    if (hapticFeedback) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }

    onPress();
  };

  const getSizeStyles = () => {
    switch (size) {
      case "small":
        return { paddingVertical: 8, paddingHorizontal: 12, fontSize: 14 };
      case "large":
        return { paddingVertical: 16, paddingHorizontal: 24, fontSize: 18 };
      default:
        return { paddingVertical: 12, paddingHorizontal: 16, fontSize: 16 };
    }
  };

  const sizeStyles = getSizeStyles();

  return (
    <TouchableWithoutFeedback
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={handlePress}
      disabled={disabled}
    >
      <Animated.View
        style={[
          styles.button,
          {
            backgroundColor: disabled ? "#9ca3af" : backgroundColor,
            opacity: disabled ? 0.6 : 1,
            paddingVertical: sizeStyles.paddingVertical,
            paddingHorizontal: sizeStyles.paddingHorizontal,
            transform: [{ scale: scaleValue }],
          },
          style,
        ]}
      >
        {icon && (
          <IconSymbol
            name={icon as "link"}
            size={sizeStyles.fontSize + 2}
            color={textColor}
          />
        )}
        <Text
          style={[
            styles.buttonText,
            { color: textColor, fontSize: sizeStyles.fontSize },
            textStyle,
          ]}
        >
          {title}
        </Text>
      </Animated.View>
    </TouchableWithoutFeedback>
  );
};

interface AnimatedIconButtonProps {
  onPress: () => void;
  icon: string;
  backgroundColor: string;
  iconColor?: string;
  size?: number;
  disabled?: boolean;
  hapticFeedback?: boolean;
}

export const AnimatedIconButton: React.FC<AnimatedIconButtonProps> = ({
  onPress,
  icon,
  backgroundColor,
  iconColor = "white",
  size = 40,
  disabled = false,
  hapticFeedback = true,
}) => {
  const scaleValue = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.spring(scaleValue, {
      toValue: 0.9,
      friction: 3,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleValue, {
      toValue: 1,
      friction: 3,
      useNativeDriver: true,
    }).start();
  };

  const handlePress = () => {
    if (disabled) return;

    if (hapticFeedback) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    onPress();
  };

  return (
    <TouchableWithoutFeedback
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={handlePress}
      disabled={disabled}
    >
      <Animated.View
        style={[
          styles.iconButton,
          {
            backgroundColor: disabled ? "#9ca3af" : backgroundColor,
            width: size,
            height: size,
            borderRadius: size / 2,
            opacity: disabled ? 0.6 : 1,
            transform: [{ scale: scaleValue }],
          },
        ]}
      >
        <IconSymbol
          name={icon as "link"}
          size={size * 0.5}
          color={iconColor}
        />
      </Animated.View>
    </TouchableWithoutFeedback>
  );
};

const styles = StyleSheet.create({
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  buttonText: {
    fontWeight: "600",
  },
  iconButton: {
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
});
