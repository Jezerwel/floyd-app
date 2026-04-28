import { IconSymbol } from "@/components/ui/IconSymbol";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const CLOUD_SERVER = "https://floyd-feeder.up.railway.app";

interface Schedule {
  _id: string;
  label: string;
  time: string;
  days: boolean[];
  enabled: boolean;
}

const DAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

async function fetchSchedules(): Promise<Schedule[]> {
  const res = await fetch(`${CLOUD_SERVER}/api/schedules`);
  return res.json();
}

async function createSchedule(data: {
  label: string;
  time: string;
  days: boolean[];
  enabled: boolean;
}): Promise<Schedule> {
  const res = await fetch(`${CLOUD_SERVER}/api/schedules`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return res.json();
}

async function updateSchedule(
  id: string,
  data: {
    label: string;
    time: string;
    days: boolean[];
    enabled: boolean;
  }
): Promise<Schedule> {
  const res = await fetch(`${CLOUD_SERVER}/api/schedules/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return res.json();
}

async function deleteSchedule(id: string): Promise<void> {
  await fetch(`${CLOUD_SERVER}/api/schedules/${id}`, {
    method: "DELETE",
  });
}

export default function ScheduleScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "light"];

  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [_loading, _setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formLabel, setFormLabel] = useState("");
  const [formTime, setFormTime] = useState("");
  const [formDays, setFormDays] = useState<boolean[]>([
    false,
    false,
    false,
    false,
    false,
    false,
    false,
  ]);
  const [formEnabled, setFormEnabled] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadSchedules = useCallback(async () => {
    try {
      const data = await fetchSchedules();
      setSchedules(data);
    } catch {
      Alert.alert("Error", "Failed to load schedules. Check your connection.");
    }
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadSchedules();
    setRefreshing(false);
  }, [loadSchedules]);

  const resetForm = useCallback(() => {
    setEditingId(null);
    setFormLabel("");
    setFormTime("");
    setFormDays([false, false, false, false, false, false, false]);
    setFormEnabled(true);
  }, []);

  const openAddModal = useCallback(() => {
    resetForm();
    setShowModal(true);
  }, [resetForm]);

  const openEditModal = useCallback((schedule: Schedule) => {
    setEditingId(schedule._id);
    setFormLabel(schedule.label);
    setFormTime(schedule.time);
    setFormDays([...schedule.days]);
    setFormEnabled(schedule.enabled);
    setShowModal(true);
  }, []);

  const toggleDay = useCallback((index: number) => {
    setFormDays((prev) => {
      const next = [...prev];
      next[index] = !next[index];
      return next;
    });
  }, []);

  const handleSave = useCallback(async () => {
    if (!formLabel.trim()) {
      Alert.alert("Validation", "Please enter a label.");
      return;
    }
    if (!/^\d{2}:\d{2}$/.test(formTime)) {
      Alert.alert("Validation", "Please enter a valid time in HH:MM format.");
      return;
    }
    if (!formDays.some((d) => d)) {
      Alert.alert("Validation", "Please select at least one day.");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        label: formLabel.trim(),
        time: formTime,
        days: formDays,
        enabled: formEnabled,
      };

      if (editingId) {
        const updated = await updateSchedule(editingId, payload);
        setSchedules((prev) =>
          prev.map((s) => (s._id === editingId ? updated : s))
        );
      } else {
        const created = await createSchedule(payload);
        setSchedules((prev) => [...prev, created]);
      }
      setShowModal(false);
      resetForm();
    } catch {
      Alert.alert("Error", "Failed to save schedule. Please try again.");
    } finally {
      setSaving(false);
    }
  }, [formLabel, formTime, formDays, formEnabled, editingId, resetForm]);

  const handleToggleEnabled = useCallback(
    async (schedule: Schedule) => {
      const newEnabled = !schedule.enabled;
      setSchedules((prev) =>
        prev.map((s) =>
          s._id === schedule._id ? { ...s, enabled: newEnabled } : s
        )
      );
      try {
        await updateSchedule(schedule._id, {
          label: schedule.label,
          time: schedule.time,
          days: schedule.days,
          enabled: newEnabled,
        });
      } catch {
        setSchedules((prev) =>
          prev.map((s) =>
            s._id === schedule._id ? { ...s, enabled: schedule.enabled } : s
          )
        );
      }
    },
    []
  );

  const handleDelete = useCallback((schedule: Schedule) => {
    Alert.alert(
      "Delete Schedule",
      `Delete "${schedule.label}"? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteSchedule(schedule._id);
              setSchedules((prev) => prev.filter((s) => s._id !== schedule._id));
            } catch {
              Alert.alert("Error", "Failed to delete schedule.");
            }
          },
        },
      ]
    );
  }, []);

  const renderScheduleItem = useCallback(
    ({ item }: { item: Schedule }) => (
      <Pressable
        onPress={() => openEditModal(item)}
        onLongPress={() => handleDelete(item)}
        style={({ pressed }) => [
          styles.scheduleCard,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
            opacity: pressed ? 0.7 : 1,
          },
        ]}
      >
        <View style={styles.scheduleRow}>
          <View style={styles.scheduleInfo}>
            <Text style={[styles.scheduleLabel, { color: colors.text }]}>
              {item.label}
            </Text>
            <Text style={[styles.scheduleTime, { color: colors.primary }]}>
              {item.time}
            </Text>
          </View>
          <Switch
            value={item.enabled}
            onValueChange={() => handleToggleEnabled(item)}
            trackColor={{ false: colors.border, true: colors.primary + "60" }}
            thumbColor={item.enabled ? colors.primary : colors.muted}
          />
        </View>
        <View style={styles.daysRow}>
          {DAY_LABELS.map((day, i) => (
            <View
              key={i}
              style={[
                styles.dayTag,
                {
                  backgroundColor: item.days[i]
                    ? colors.primary
                    : colors.border + "30",
                  borderColor: item.days[i] ? colors.primary : colors.border,
                },
              ]}
            >
              <Text
                style={[
                  styles.dayTagText,
                  { color: item.days[i] ? "#FFFFFF" : colors.muted },
                ]}
              >
                {day}
              </Text>
            </View>
          ))}
        </View>
      </Pressable>
    ),
    [colors, handleDelete, handleToggleEnabled, openEditModal]
  );

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
    >
      <View style={styles.header}>
        <IconSymbol name="clock" size={24} color={colors.primary} />
        <Text style={[styles.headerTitle, { color: colors.text }]}>
          Feeding Schedule
        </Text>
      </View>

      {!_loading && (
        <FlatList
          data={schedules}
          keyExtractor={(item) => item._id}
          renderItem={renderScheduleItem}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <IconSymbol name="clock" size={48} color={colors.muted} />
              <Text style={[styles.emptyTitle, { color: colors.text }]}>
                No Schedules
              </Text>
              <Text style={[styles.emptySubtitle, { color: colors.muted }]}>
                Tap the + button to create your first feeding schedule.
              </Text>
            </View>
          }
        />
      )}

      {_loading && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      )}

      <TouchableOpacity
        style={[styles.fab, { backgroundColor: colors.primary }]}
        onPress={openAddModal}
        activeOpacity={0.8}
      >
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>

      <Modal
        visible={showModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowModal(false)}
      >
        <SafeAreaView
          style={[styles.modalContainer, { backgroundColor: colors.background }]}
        >
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowModal(false)}>
              <Text style={[styles.modalCancel, { color: colors.muted }]}>
                Cancel
              </Text>
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: colors.text }]}>
              {editingId ? "Edit Schedule" : "New Schedule"}
            </Text>
            <TouchableOpacity onPress={handleSave} disabled={saving}>
              <Text style={[styles.modalSave, { color: colors.primary }]}>
                {saving ? "Saving..." : "Save"}
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.modalBody}>
            <Text style={[styles.fieldLabel, { color: colors.text }]}>Label</Text>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                  color: colors.text,
                },
              ]}
              placeholder="e.g. Morning Feed"
              placeholderTextColor={colors.muted}
              value={formLabel}
              onChangeText={setFormLabel}
              autoFocus
            />

            <Text style={[styles.fieldLabel, { color: colors.text }]}>Time</Text>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                  color: colors.text,
                },
              ]}
              placeholder="HH:MM (e.g. 08:30)"
              placeholderTextColor={colors.muted}
              value={formTime}
              onChangeText={setFormTime}
              keyboardType="numbers-and-punctuation"
              maxLength={5}
            />

            <Text style={[styles.fieldLabel, { color: colors.text }]}>
              Days of Week
            </Text>
            <View style={styles.daysToggleRow}>
              {DAY_LABELS.map((day, i) => (
                <TouchableOpacity
                  key={i}
                  onPress={() => toggleDay(i)}
                  style={[
                    styles.dayToggle,
                    {
                      backgroundColor: formDays[i]
                        ? colors.primary
                        : colors.card,
                      borderColor: formDays[i]
                        ? colors.primary
                        : colors.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.dayToggleText,
                      { color: formDays[i] ? "#FFFFFF" : colors.text },
                    ]}
                  >
                    {day}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.enabledRow}>
              <Text style={[styles.fieldLabel, { color: colors.text }]}>
                Enabled
              </Text>
              <Switch
                value={formEnabled}
                onValueChange={setFormEnabled}
                trackColor={{
                  false: colors.border,
                  true: colors.primary + "60",
                }}
                thumbColor={formEnabled ? colors.primary : colors.muted}
              />
            </View>
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "bold",
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 100,
    flexGrow: 1,
  },
  scheduleCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  scheduleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  scheduleInfo: {
    flex: 1,
  },
  scheduleLabel: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 4,
  },
  scheduleTime: {
    fontSize: 24,
    fontWeight: "bold",
  },
  daysRow: {
    flexDirection: "row",
    gap: 6,
  },
  dayTag: {
    width: 36,
    height: 28,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  dayTagText: {
    fontSize: 13,
    fontWeight: "600",
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 80,
    gap: 12,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginTop: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    textAlign: "center",
    paddingHorizontal: 40,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  fab: {
    position: "absolute",
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 6,
  },
  fabText: {
    color: "#FFFFFF",
    fontSize: 28,
    lineHeight: 30,
    fontWeight: "300",
    marginTop: Platform.OS === "ios" ? 0 : -2,
  },
  modalContainer: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E5E7EB",
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: "600",
  },
  modalCancel: {
    fontSize: 16,
  },
  modalSave: {
    fontSize: 16,
    fontWeight: "600",
  },
  modalBody: {
    padding: 20,
    gap: 16,
  },
  fieldLabel: {
    fontSize: 15,
    fontWeight: "600",
    marginBottom: -8,
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  daysToggleRow: {
    flexDirection: "row",
    gap: 8,
  },
  dayToggle: {
    flex: 1,
    aspectRatio: 0.75,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  dayToggleText: {
    fontSize: 15,
    fontWeight: "700",
  },
  enabledRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
});
