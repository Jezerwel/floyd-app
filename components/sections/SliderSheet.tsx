import { View, Modal, Pressable } from "react-native";
import { ThemedText } from "../ui/Text";
import { Button } from "../ui/Button";
import { SliderControl } from "../molecules/SliderControl";
import { useSafeAreaInsets } from "react-native-safe-area-context";

interface SliderSheetProps {
  visible: boolean;
  onClose: () => void;
  augerSpeed: number;
  impellerSpeed: number;
  feedDuration: number;
  preSpin: number;
  postSpin: number;
  onAugerChange: (v: number) => void;
  onImpellerChange: (v: number) => void;
  onDurationChange: (v: number) => void;
  onPreSpinChange: (v: number) => void;
  onPostSpinChange: (v: number) => void;
  inline?: boolean;
}

export function SliderSheet({
  visible,
  onClose,
  augerSpeed,
  impellerSpeed,
  feedDuration,
  preSpin,
  postSpin,
  onAugerChange,
  onImpellerChange,
  onDurationChange,
  onPreSpinChange,
  onPostSpinChange,
  inline = false,
}: SliderSheetProps) {
  const insets = useSafeAreaInsets();

  const content = (
    <View className="gap-6 px-4 pt-4" style={{ paddingBottom: insets.bottom + 20 }}>
      <SliderControl
        icon="gearshape.fill"
        label="Auger Speed"
        value={augerSpeed}
        onValueChange={onAugerChange}
      />
      <SliderControl
        icon="gearshape.fill"
        label="Impeller Speed"
        value={impellerSpeed}
        onValueChange={onImpellerChange}
      />
      <SliderControl
        icon="clock"
        label="Feed Duration"
        value={feedDuration}
        onValueChange={onDurationChange}
        min={0}
        max={30}
        suffix="s"
      />
      <SliderControl
        icon="clock"
        label="Pre-Spin"
        value={preSpin}
        onValueChange={onPreSpinChange}
        min={0}
        max={10}
        suffix="s"
      />
      <SliderControl
        icon="clock"
        label="Post-Spin"
        value={postSpin}
        onValueChange={onPostSpinChange}
        min={0}
        max={10}
        suffix="s"
      />
    </View>
  );

  if (inline) {
    return (
      <View className="flex-1 bg-surface-card rounded-xl m-3">
        <View className="flex-row items-center justify-between px-5 py-4">
          <ThemedText variant="h2">Feed Settings</ThemedText>
          <Button title="Done" variant="ghost" onPress={onClose} />
        </View>
        {content}
      </View>
    );
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <Pressable
        className="flex-1 bg-surface"
        style={{ paddingTop: insets.top }}
      >
        <View className="flex-row items-center justify-between px-5 py-4">
          <ThemedText variant="h2">Feed Settings</ThemedText>
          <Button title="Done" variant="ghost" onPress={onClose} />
        </View>

        {content}
      </Pressable>
    </Modal>
  );
}
