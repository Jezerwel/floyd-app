import { View, FlatList, ScrollView, Alert } from "react-native";
import { useMemo } from "react";
import { ThemedText } from "../ui/Text";
import { Card } from "../ui/Card";
import { DayChip } from "../molecules/DayChip";
import { EmptyState } from "../molecules/EmptyState";
import { Button } from "../ui/Button";
import { Badge } from "../ui/Badge";

interface Schedule {
  id: string;
  label: string;
  time: string;
  days: number[];
  enabled: boolean;
}

interface ScheduleTimelineProps {
  schedules: Schedule[];
  selectedDay: number;
  onSelectDay: (day: number) => void;
  onToggle: (id: string, enabled: boolean) => void;
  onEdit: (schedule: Schedule) => void;
  onDelete: (id: string) => void;
  onAdd: () => void;
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function ScheduleTimeline({
  schedules,
  selectedDay,
  onSelectDay,
  onToggle,
  onEdit,
  onDelete,
  onAdd,
}: ScheduleTimelineProps) {
  const filtered = useMemo(
    () => schedules.filter((s) => s.days.includes(selectedDay)),
    [schedules, selectedDay]
  );

  return (
    <View className="flex-1">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        className="py-3"
        contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}
      >
        {DAY_NAMES.map((day, i) => (
          <DayChip
            key={day}
            day={day}
            date={String(i + 1)}
            feedCount={
              schedules.filter((s) => s.days.includes(i)).length
            }
            isActive={selectedDay === i}
            onPress={() => onSelectDay(i)}
          />
        ))}
      </ScrollView>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 100 }}
        ListEmptyComponent={
          <EmptyState
            icon="clock"
            title="No schedules"
            description={`No feeding schedules for ${DAY_NAMES[selectedDay]}`}
            actionLabel="Add Schedule"
            onAction={onAdd}
          />
        }
        renderItem={({ item }) => (
          <Card className="mb-3">
            <View className="flex-row items-start justify-between">
              <View className="flex-1">
                <ThemedText variant="body" className="font-sans-bold">
                  {item.label || "Feed"}
                </ThemedText>
                <View className="flex-row items-center gap-2 mt-1">
                  <ThemedText variant="caption">
                    {item.time}
                  </ThemedText>
                  <Badge
                    label={item.enabled ? "Active" : "Paused"}
                    variant={item.enabled ? "success" : "neutral"}
                  />
                </View>
                <View className="flex-row gap-1 mt-2">
                  {DAY_NAMES.map((d, i) => (
                    <View
                      key={d}
                      className={`w-7 h-7 rounded-full items-center justify-center ${
                        item.days.includes(i)
                          ? "bg-primary-container"
                          : "bg-transparent"
                      }`}
                    >
                      <ThemedText
                        variant="caption"
                        className={
                          item.days.includes(i)
                            ? "text-primary font-sans-bold"
                            : "text-text-secondary"
                        }
                      >
                        {d[0]}
                      </ThemedText>
                    </View>
                  ))}
                </View>
              </View>
              <View className="gap-2 ml-2">
                <Button
                  title={item.enabled ? "Disable" : "Enable"}
                  variant={item.enabled ? "secondary" : "primary"}
                  size="sm"
                  onPress={() => onToggle(item.id, !item.enabled)}
                />
                <Button
                  title="Edit"
                  variant="ghost"
                  size="sm"
                  onPress={() => onEdit(item)}
                />
                <Button
                  title="Delete"
                  variant="ghost"
                  size="sm"
                  className="opacity-50"
                  onPress={() => {
                    Alert.alert(
                      "Delete Schedule",
                      "Remove this feeding schedule?",
                      [
                        { text: "Cancel", style: "cancel" },
                        {
                          text: "Delete",
                          style: "destructive",
                          onPress: () => onDelete(item.id),
                        },
                      ]
                    );
                  }}
                />
              </View>
            </View>
          </Card>
        )}
      />

      <Button
        title="+"
        variant="primary"
        size="lg"
        onPress={onAdd}
        className="absolute bottom-6 right-6 w-14 h-14 rounded-full"
      />
    </View>
  );
}
