import {
  useState,
  useCallback,
} from "react";
import {
  Alert,
  Modal,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { Surface } from "@/components/ui/Surface";
import { ScheduleTimeline } from "@/components/sections/ScheduleTimeline";
import { useSchedule } from "@/hooks/useSchedule";

interface ScheduleItem {
  id: string;
  label: string;
  time: string;
  days: number[];
  enabled: boolean;
}

const DAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

function daysToBoolArray(days: number[]): boolean[] {
  const arr = [false, false, false, false, false, false, false];
  days.forEach((d) => {
    if (d >= 0 && d < 7) arr[d] = true;
  });
  return arr;
}

function boolToDaysArray(arr: boolean[]): number[] {
  return arr.reduce<number[]>((acc, val, i) => (val ? [...acc, i] : acc), []);
}

export default function ScheduleScreen() {
  const {
    schedules,
    fetchSchedules,
    createSchedule,
    updateSchedule,
    toggleSchedule,
    deleteSchedule,
  } = useSchedule();

  const [selectedDay, setSelectedDay] = useState(new Date().getDay());
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formLabel, setFormLabel] = useState("");
  const [formTime, setFormTime] = useState("");
  const [formDays, setFormDays] = useState<boolean[]>([
    false, false, false, false, false, false, false,
  ]);
  const [formEnabled, setFormEnabled] = useState(true);
  const [saving, setSaving] = useState(false);

  useFocusEffect(
    useCallback(() => {
      fetchSchedules();
    }, [fetchSchedules])
  );

  const resetForm = useCallback(() => {
    setEditingId(null);
    setFormLabel("");
    setFormTime("");
    setFormDays([false, false, false, false, false, false, false]);
    setFormEnabled(true);
  }, []);

  const handleAdd = useCallback(() => {
    resetForm();
    setShowModal(true);
  }, [resetForm]);

  const handleEdit = useCallback((schedule: ScheduleItem) => {
    setEditingId(schedule.id);
    setFormLabel(schedule.label);
    setFormTime(schedule.time);
    setFormDays(daysToBoolArray(schedule.days));
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
        days: boolToDaysArray(formDays),
        enabled: formEnabled,
      };

      if (editingId) {
        await updateSchedule(editingId, payload);
      } else {
        await createSchedule(payload);
      }
      setShowModal(false);
      resetForm();
    } catch {
      Alert.alert("Error", "Failed to save schedule. Please try again.");
    } finally {
      setSaving(false);
    }
  }, [
    formLabel, formTime, formDays, formEnabled, editingId,
    createSchedule, updateSchedule, resetForm,
  ]);

  const handleToggle = useCallback(
    (id: string, enabled: boolean) => {
      toggleSchedule(id, enabled);
    },
    [toggleSchedule]
  );

  const handleDelete = useCallback(
    (id: string) => {
      deleteSchedule(id);
    },
    [deleteSchedule]
  );

  return (
    <Surface safeTop>
      <ScheduleTimeline
        schedules={schedules}
        selectedDay={selectedDay}
        onSelectDay={setSelectedDay}
        onToggle={handleToggle}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onAdd={handleAdd}
      />

      <Modal
        visible={showModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowModal(false)}
      >
        <SafeAreaView className="flex-1 bg-surface">
          <View className="flex-row justify-between items-center px-5 py-4 border-b border-border">
            <TouchableOpacity onPress={() => setShowModal(false)}>
              <Text className="text-base text-text-secondary">Cancel</Text>
            </TouchableOpacity>
            <Text className="text-lg font-sans-bold text-text-primary">
              {editingId ? "Edit Schedule" : "New Schedule"}
            </Text>
            <TouchableOpacity onPress={handleSave} disabled={saving}>
              <Text className="text-base font-sans-bold text-primary">
                {saving ? "Saving..." : "Save"}
              </Text>
            </TouchableOpacity>
          </View>

          <View className="p-5 gap-4">
            <Text className="text-base font-sans-bold text-text-primary">
              Label
            </Text>
            <TextInput
              className="border border-border rounded-xl px-4 py-3 text-base text-text-primary bg-surface-card"
              placeholder="e.g. Morning Feed"
              placeholderTextColor="#94A3B8"
              value={formLabel}
              onChangeText={setFormLabel}
              autoFocus
            />

            <Text className="text-base font-sans-bold text-text-primary">
              Time
            </Text>
            <TextInput
              className="border border-border rounded-xl px-4 py-3 text-base text-text-primary bg-surface-card"
              placeholder="HH:MM (e.g. 08:30)"
              placeholderTextColor="#94A3B8"
              value={formTime}
              onChangeText={setFormTime}
              keyboardType="numbers-and-punctuation"
              maxLength={5}
            />

            <Text className="text-base font-sans-bold text-text-primary">
              Days of Week
            </Text>
            <View className="flex-row gap-2">
              {DAY_LABELS.map((day, i) => (
                <TouchableOpacity
                  key={i}
                  onPress={() => toggleDay(i)}
                  className={`flex-1 aspect-[0.75] rounded-xl border-2 items-center justify-center ${
                    formDays[i]
                      ? "bg-primary border-primary"
                      : "bg-surface-card border-border"
                  }`}
                >
                  <Text
                    className={`text-base font-sans-bold ${
                      formDays[i] ? "text-white" : "text-text-primary"
                    }`}
                  >
                    {day}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View className="flex-row justify-between items-center">
              <Text className="text-base font-sans-bold text-text-primary">
                Enabled
              </Text>
              <Switch
                value={formEnabled}
                onValueChange={setFormEnabled}
                trackColor={{ false: "#CBD5E1", true: "#0E749060" }}
                thumbColor={formEnabled ? "#0E7490" : "#94A3B8"}
              />
            </View>
          </View>
        </SafeAreaView>
      </Modal>
    </Surface>
  );
}
