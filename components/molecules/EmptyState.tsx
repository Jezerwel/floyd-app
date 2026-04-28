import { View } from "react-native";
import { ThemedText } from "../ui/Text";
import { IconSymbol, type IconSymbolName } from "../ui/IconSymbol";
import { Button } from "../ui/Button";

interface EmptyStateProps {
  icon: IconSymbolName;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  onAction,
}: EmptyStateProps) {
  return (
    <View className="flex-1 items-center justify-center py-16 px-8">
      <IconSymbol name={icon} size={48} color="#94A3B8" />
      <ThemedText variant="h2" className="mt-4 text-center">
        {title}
      </ThemedText>
      <ThemedText
        variant="body"
        className="mt-2 text-center text-text-secondary"
      >
        {description}
      </ThemedText>
      {actionLabel && onAction && (
        <Button
          title={actionLabel}
          onPress={onAction}
          className="mt-6"
        />
      )}
    </View>
  );
}
