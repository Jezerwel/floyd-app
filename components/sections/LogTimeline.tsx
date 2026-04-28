import { View, FlatList, Pressable } from "react-native";
import { useState, useCallback } from "react";
import { ThemedText } from "../ui/Text";
import { TimelineNode } from "../molecules/TimelineNode";
import { EmptyState } from "../molecules/EmptyState";

type LogFilter = "sensors" | "alerts" | "feeds";

interface SensorLog {
  timestamp: string;
  temperature?: number;
  distance?: number;
  foodLevel?: number;
}

interface AlertLog {
  type: string;
  message: string;
  timestamp: string;
  severity: "HIGH" | "MEDIUM" | "LOW";
}

interface FeedLog {
  id: string;
  timestamp: string;
  duration: number;
  success: boolean;
  augerSpeed?: number;
  impellerSpeed?: number;
}

interface LogTimelineProps {
  sensorLogs: SensorLog[];
  alertLogs: AlertLog[];
  feedLogs: FeedLog[];
  onClear: () => void;
}

const FILTER_LABELS: Record<LogFilter, string> = {
  sensors: "Sensor Data",
  alerts: "Alerts",
  feeds: "Feeds",
};

export function LogTimeline({
  sensorLogs,
  alertLogs,
  feedLogs,
  onClear,
}: LogTimelineProps) {
  const [filter, setFilter] = useState<LogFilter>("sensors");

  const data =
    filter === "sensors"
      ? sensorLogs
      : filter === "alerts"
        ? alertLogs
        : feedLogs;

  const renderItem = useCallback(
    ({ item, index }: { item: unknown; index: number }) => {
      const isLast = index === data.length - 1;

      switch (filter) {
        case "sensors": {
          const s = item as SensorLog;
          return (
            <TimelineNode
              color="green"
              time={new Date(s.timestamp).toLocaleTimeString()}
              title={`${s.temperature?.toFixed(1) ?? "--"}°C  |  ${s.distance?.toFixed(1) ?? "--"}cm`}
              subtitle={`Food: ${s.foodLevel?.toFixed(0) ?? "--"}%`}
              isLast={isLast}
            />
          );
        }
        case "alerts": {
          const a = item as AlertLog;
          return (
            <TimelineNode
              color={a.severity === "HIGH" ? "red" : "amber"}
              time={new Date(a.timestamp).toLocaleTimeString()}
              title={a.message}
              subtitle={a.type}
              isLast={isLast}
            />
          );
        }
        case "feeds": {
          const f = item as FeedLog;
          return (
            <TimelineNode
              color="blue"
              time={new Date(f.timestamp).toLocaleTimeString()}
              title={`${f.duration}s feed`}
              subtitle={f.success ? "Completed" : "Failed"}
              isLast={isLast}
            />
          );
        }
        default:
          return null;
      }
    },
    [filter, data.length]
  );

  return (
    <View className="flex-1">
      <View className="flex-row gap-2 px-4 py-3">
        {(Object.keys(FILTER_LABELS) as LogFilter[]).map((f) => (
          <Pressable
            key={f}
            onPress={() => setFilter(f)}
            className={`px-4 py-2 rounded-pill border ${
              filter === f
                ? "bg-primary border-primary"
                : "bg-surface-card border-border"
            }`}
            accessibilityRole="button"
            accessibilityState={{ selected: filter === f }}
          >
            <ThemedText
              variant="caption"
              className={`font-sans-medium ${
                filter === f ? "text-white" : "text-text-primary"
              }`}
            >
              {FILTER_LABELS[f]}
            </ThemedText>
          </Pressable>
        ))}
        <View className="flex-1" />
        <Pressable
          onPress={onClear}
          className="px-4 py-2 rounded-pill border border-border bg-surface-card"
          accessibilityRole="button"
          accessibilityLabel="Clear all logs"
        >
          <ThemedText
            variant="caption"
            className="font-sans-medium text-text-secondary"
          >
            Clear
          </ThemedText>
        </Pressable>
      </View>

      <FlatList
        data={data}
        renderItem={renderItem}
        keyExtractor={(_, i) => `${filter}-${i}`}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 100 }}
        ListEmptyComponent={
          <EmptyState
            icon="archivebox.fill"
            title="No entries"
            description={`No ${FILTER_LABELS[filter].toLowerCase()} data recorded yet`}
          />
        }
      />
    </View>
  );
}
