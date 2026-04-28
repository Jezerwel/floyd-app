import { View } from "react-native";
import Animated, { FadeInUp, FadeOutUp, Layout } from "react-native-reanimated";
import { Card } from "../ui/Card";
import { ThemedText } from "../ui/Text";
import { IconSymbol } from "../ui/IconSymbol";
import { Badge } from "../ui/Badge";

interface AlertItem {
  type: string;
  message: string;
  timestamp: string;
  severity: "HIGH" | "MEDIUM" | "LOW";
}

interface AlertPanelProps {
  alerts: AlertItem[];
  alertCount: number;
}

const severityBadgeVariant = {
  HIGH: "error" as const,
  MEDIUM: "warning" as const,
  LOW: "info" as const,
};

const severityEdgeClass = {
  HIGH: "bg-error",
  MEDIUM: "bg-accent",
  LOW: "bg-border",
};

export function AlertPanel({ alerts, alertCount }: AlertPanelProps) {
  if (alertCount === 0) {
    return (
      <Card className="mx-4 mt-4">
        <View className="flex-row items-center gap-3">
          <IconSymbol name="checkmark.circle.fill" size={24} color="#10B981" />
          <View>
            <ThemedText variant="body" className="font-sans-medium">
              All systems normal
            </ThemedText>
            <ThemedText variant="caption">No active alerts</ThemedText>
          </View>
        </View>
      </Card>
    );
  }

  return (
    <View className="mt-4 gap-2 mx-4">
      <ThemedText variant="h3" className="mb-1">
        Alerts ({alertCount})
      </ThemedText>
      {alerts.map((alert, i) => (
        <Animated.View
          key={`${alert.type}-${i}`}
          entering={FadeInUp.delay(i * 50).springify()}
          exiting={FadeOutUp}
          layout={Layout.springify()}
        >
          <Card className="flex-row items-start overflow-hidden">
            <View
              className={`absolute left-0 top-0 bottom-0 w-1 ${severityEdgeClass[alert.severity]}`}
            />
            <View className="ml-3 flex-1">
              <View className="flex-row items-center gap-2 mb-1">
                <Badge
                  label={alert.severity}
                  variant={severityBadgeVariant[alert.severity]}
                />
                <ThemedText
                  variant="caption"
                  className="flex-1 text-right"
                >
                  {alert.timestamp}
                </ThemedText>
              </View>
              <ThemedText variant="body" className="font-sans-medium">
                {alert.message}
              </ThemedText>
            </View>
          </Card>
        </Animated.View>
      ))}
    </View>
  );
}
