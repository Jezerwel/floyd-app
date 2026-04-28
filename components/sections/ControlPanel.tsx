import { View, Alert } from "react-native";
import Animated, {
  useAnimatedStyle,
  withSpring,
  withSequence,
  useSharedValue,
  FadeInDown,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { ThemedText } from "../ui/Text";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { Badge } from "../ui/Badge";

type MotorState = "idle" | "pre_spin" | "feeding" | "post_spin" | "jam_clear";

interface ControlPanelProps {
  motorState: MotorState;
  isConnected: boolean;
  isHardwareOnline: boolean;
  onFeed: () => void;
  onStop: () => void;
  onClearJam: () => void;
  onOpenSettings: () => void;
}

export function ControlPanel({
  motorState,
  isConnected,
  isHardwareOnline,
  onFeed,
  onStop,
  onClearJam,
  onOpenSettings,
}: ControlPanelProps) {
  const scale = useSharedValue(1);
  const isFeeding = motorState === "feeding";
  const isActive = motorState !== "idle";

  const feedButtonStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handleFeed = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    scale.value = withSequence(
      withSpring(0.9, { damping: 10, stiffness: 200 }),
      withSpring(1.05, { damping: 8, stiffness: 150 }),
      withSpring(1, { damping: 12, stiffness: 180 })
    );
    onFeed();
  };

  const handleClearJam = () => {
    Alert.alert(
      "Clear Jam",
      "The auger will run in reverse to clear the jam. Continue?",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Clear Jam", style: "destructive", onPress: onClearJam },
      ]
    );
  };

  const canAct = isConnected && isHardwareOnline;

  return (
    <Animated.View
      entering={FadeInDown.springify()}
      className="items-center mt-6"
    >
      <Animated.View style={feedButtonStyle}>
        <Button
          title={isFeeding ? "FEEDING..." : "FEED"}
          variant="primary"
          size="lg"
          onPress={handleFeed}
          disabled={!canAct || isFeeding}
          haptic={false}
          className="w-40 h-40 rounded-full"
        />
      </Animated.View>

      <View className="flex-row items-center gap-2 mt-4">
        <View
          className={`w-2 h-2 rounded-full ${
            isFeeding ? "bg-accent" : isActive ? "bg-accent" : "bg-success"
          }`}
        />
        <ThemedText variant="caption">
          {isFeeding
            ? "Motor running"
            : isActive
              ? "Motor active"
              : "Motor idle"}
        </ThemedText>
      </View>

      {!canAct && (
        <Card className="mt-4 mx-4 flex-row items-center gap-2 self-stretch">
          <Badge label="OFFLINE" variant="error" />
          <ThemedText variant="caption" className="flex-1">
            {!isConnected
              ? "Not connected to cloud server"
              : "Hardware not reachable"}
          </ThemedText>
        </Card>
      )}

      <View className="flex-row gap-3 mt-4">
        {isFeeding && (
          <Button title="STOP" variant="danger" onPress={onStop} />
        )}
        <Button
          title="Settings"
          variant="ghost"
          onPress={onOpenSettings}
        />
        {canAct && (
          <Button
            title="Clear Jam"
            variant="secondary"
            onPress={handleClearJam}
          />
        )}
      </View>
    </Animated.View>
  );
}
