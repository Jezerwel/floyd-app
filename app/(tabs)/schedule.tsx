import { IconSymbol } from "@/components/ui/IconSymbol";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { useScheduleMQTT, type Schedule } from "@/hooks/useScheduleMQTT";
import DateTimePicker, {
  type DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import React, { useCallback, useMemo, useState } from "react";
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
import { makeLocalId } from "../../utils/localId";
import { SafeAreaView } from "react-native-safe-area-context";

function timeStringToDate(time: string): Date {
  const [hours, minutes] = time.split(":").map(Number);
  const date = new Date();
  date.setHours(hours || 8);
  date.setMinutes(minutes || 0);
  date.setSeconds(0);
  return date;
}

function dateToTimeString(date: Date): string {
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function formatTimeDisplay(time: string): string {
  if (!time) return "Tap to select time";
  const [hours, minutes] = time.split(":").map(Number);
  const date = new Date();
  date.setHours(hours);
  date.setMinutes(minutes);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

const DAY_LABELS = ["S", "M", "T", "W", "Th", "F", "S"];

export default function ScheduleScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "light"];

  const {
    schedules: mqttSchedules,
    loading: _loading,
    fetchSchedules,
    pushSchedules,
  } = useScheduleMQTT();

  const [refreshing, setRefreshing] = useState(false);
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
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [pickerDate, setPickerDate] = useState(new Date());

  const scheduleListRows = useMemo(() => {
    const filtered = mqttSchedules.filter(
      (s): s is Schedule => !!s && !!s.id,
    );
    const countById = filtered.reduce<Record<string, number>>((acc, s) => {
      acc[s.id] = (acc[s.id] ?? 0) + 1;
      return acc;
    }, {});
    const anyDup = Object.values(countById).some((c) => c > 1);
    return filtered.map((item, index) => ({
      rowKey: anyDup ? `${item.id}:${index}` : item.id,
      schedule: item,
    }));
  }, [mqttSchedules]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchSchedules();
    setRefreshing(false);
  }, [fetchSchedules]);

  const resetForm = useCallback(() => {
    setEditingId(null);
    setFormLabel("");
    setFormTime("");
    setFormDays([false, false, false, false, false, false, false]);
    setFormEnabled(true);
    setShowTimePicker(false);
    const defaultDate = new Date();
    defaultDate.setHours(8, 0, 0, 0);
    setPickerDate(defaultDate);
  }, []);

  const openAddModal = useCallback(() => {
    resetForm();
    setShowModal(true);
  }, [resetForm]);

  // Convert daysOfWeek string "0,1,2,3,4,5,6" → boolean[7]
  const daysOfWeekToBool = (dow: string): boolean[] => {
    const out = [false, false, false, false, false, false, false];
    if (!dow) return out;
    dow.split(",").forEach((d) => {
      const idx = parseInt(d.trim(), 10);
      if (idx >= 0 && idx <= 6) out[idx] = true;
    });
    return out;
  };

  const openEditModal = useCallback((schedule: Schedule) => {
    setEditingId(schedule.id);
    setFormLabel(schedule.label);
    setFormTime(schedule.time);
    setPickerDate(timeStringToDate(schedule.time));
    setFormDays(daysOfWeekToBool(schedule.daysOfWeek));
    setFormEnabled(schedule.enabled);
    setShowTimePicker(false);
    setShowModal(true);
  }, []);

  const toggleDay = useCallback((index: number) => {
    setFormDays((prev) => {
      const next = [...prev];
      next[index] = !next[index];
      return next;
    });
  }, []);

  // Convert boolean[7] → daysOfWeek string "0,1,2,..."
  const boolToDaysOfWeek = (days: boolean[]): string => {
    return days
      .map((d, i) => (d ? String(i) : null))
      .filter(Boolean)
      .join(",");
  };

  const handleSave = useCallback(async () => {
    if (!formLabel.trim()) {
      Alert.alert("Validation", "Please enter a label.");
      return;
    }
    if (!formTime) {
      Alert.alert("Validation", "Please select a time.");
      return;
    }
    if (!formDays.some((d) => d)) {
      Alert.alert("Validation", "Please select at least one day.");
      return;
    }

    setSaving(true);
    try {
      const updatedSchedules = [...mqttSchedules];
      const newSchedule: Schedule = {
        id: editingId || makeLocalId(),
        label: formLabel.trim(),
        time: formTime,
        daysOfWeek: boolToDaysOfWeek(formDays),
        augerSpeed: 768,
        impellerSpeed: 1023,
        preSpinMs: 1500,
        feedMs: 3000,
        postSpinMs: 1500,
        enabled: formEnabled,
      };

      if (editingId) {
        const idx = updatedSchedules.findIndex((s) => s.id === editingId);
        if (idx >= 0) updatedSchedules[idx] = newSchedule;
        else updatedSchedules.push(newSchedule);
      } else {
        updatedSchedules.push(newSchedule);
      }

      const ok = await pushSchedules(updatedSchedules);
      if (!ok) {
        Alert.alert(
          "Could not save",
          "The feeder did not accept the schedule. Check Bluetooth or Wi‑Fi and try again.",
        );
        return;
      }
      setShowModal(false);
      resetForm();
    } catch {
      Alert.alert("Error", "Failed to save schedule. Please try again.");
    } finally {
      setSaving(false);
    }
  }, [formLabel, formTime, formDays, formEnabled, editingId, resetForm, mqttSchedules, pushSchedules]);

  const handleToggleEnabled = useCallback(async (schedule: Schedule) => {
    const updatedSchedules = mqttSchedules.map((s) =>
      s.id === schedule.id ? { ...s, enabled: !s.enabled } : s,
    );
    const ok = await pushSchedules(updatedSchedules);
    if (!ok) {
      Alert.alert(
        "Could not update",
        "The feeder did not accept the change. Check your connection.",
      );
    }
  }, [mqttSchedules, pushSchedules]);

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
            const updatedSchedules = mqttSchedules.filter(
              (s) => s.id !== schedule.id,
            );
            const ok = await pushSchedules(updatedSchedules);
            if (!ok) {
              Alert.alert(
                "Could not delete",
                "The feeder did not accept the update. Check your connection.",
              );
            }
          },
        },
      ],
    );
  }, [mqttSchedules, pushSchedules]);

  const renderScheduleItem = useCallback(
    ({ item }: { item: { rowKey: string; schedule: Schedule } }) => {
      const sch = item.schedule;
      const itemDays = daysOfWeekToBool(sch.daysOfWeek);
      return (
      <Pressable
        onPress={() => openEditModal(sch)}
        onLongPress={() => handleDelete(sch)}
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
              {sch.label}
            </Text>
            <Text style={[styles.scheduleTime, { color: colors.primary }]}>
              {formatTimeDisplay(sch.time)}
            </Text>
          </View>
          <Switch
            value={sch.enabled}
            onValueChange={() => handleToggleEnabled(sch)}
            trackColor={{ false: colors.border, true: colors.primary + "60" }}
            thumbColor={sch.enabled ? colors.primary : colors.muted}
          />
        </View>
        <View style={styles.daysRow}>
          {DAY_LABELS.map((day, i) => (
            <View
              key={`${day}.${i}`}
              style={[
                styles.dayTag,
                {
                  backgroundColor: itemDays[i]
                    ? colors.primary
                    : colors.border + "30",
                  borderColor: itemDays[i] ? colors.primary : colors.border,
                },
              ]}
            >
              <Text
                style={[
                  styles.dayTagText,
                  { color: itemDays[i] ? "#FFFFFF" : colors.muted },
                ]}
              >
                {day}
              </Text>
            </View>
          ))}
        </View>
      </Pressable>
      );
    },
    [colors, handleDelete, handleToggleEnabled, openEditModal, daysOfWeekToBool],
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
          data={scheduleListRows}
          keyExtractor={(row) => row.rowKey}
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
          style={[
            styles.modalContainer,
            { backgroundColor: colors.background },
          ]}
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
            <Text style={[styles.fieldLabel, { color: colors.text }]}>
              Label
            </Text>
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

            <Text style={[styles.fieldLabel, { color: colors.text }]}>
              Time
            </Text>
            <TouchableOpacity
              onPress={() => {
                if (!formTime) {
                  const defaultDate = new Date();
                  defaultDate.setHours(8, 0, 0, 0);
                  setPickerDate(defaultDate);
                }
                setShowTimePicker((prev) => !prev);
              }}
              style={[
                styles.input,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                  justifyContent: "center",
                },
              ]}
              activeOpacity={0.8}
            >
              <Text
                style={{
                  color: formTime ? colors.text : colors.muted,
                  fontSize: 16,
                }}
              >
                {formatTimeDisplay(formTime)}
              </Text>
            </TouchableOpacity>
            {showTimePicker &&
              pickerDate instanceof Date &&
              Platform.OS === "ios" && (
                <DateTimePicker
                  value={pickerDate}
                  mode="time"
                  display="spinner"
                  onChange={(_event: DateTimePickerEvent, date?: Date) => {
                    if (date) {
                      setPickerDate(date);
                      setFormTime(dateToTimeString(date));
                    }
                  }}
                />
              )}
            {showTimePicker &&
              pickerDate instanceof Date &&
              Platform.OS !== "ios" && (
                <DateTimePicker
                  value={pickerDate}
                  mode="time"
                  display="default"
                  onChange={(_event: DateTimePickerEvent, date?: Date) => {
                    if (date) {
                      setPickerDate(date);
                      setFormTime(dateToTimeString(date));
                    }
                    setShowTimePicker(false);
                  }}
                />
              )}

            <Text style={[styles.fieldLabel, { color: colors.text }]}>
              Days of the Week
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
                      borderColor: formDays[i] ? colors.primary : colors.border,
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
