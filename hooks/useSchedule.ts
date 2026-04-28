import { useState, useCallback } from "react";
import { api, type Schedule } from "../services/api";

export function useSchedule() {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSchedules = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getSchedules();
      setSchedules(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to fetch schedules");
    } finally {
      setLoading(false);
    }
  }, []);

  const createSchedule = useCallback(
    async (data: Omit<Schedule, "id" | "createdAt" | "updatedAt">) => {
      const schedule = await api.createSchedule(data);
      setSchedules((prev) => [...prev, schedule]);
      return schedule;
    },
    []
  );

  const updateSchedule = useCallback(
    async (id: string, data: Partial<Schedule>) => {
      const schedule = await api.updateSchedule(id, data);
      setSchedules((prev) =>
        prev.map((s) => (s.id === id ? schedule : s))
      );
      return schedule;
    },
    []
  );

  const toggleSchedule = useCallback(
    async (id: string, enabled: boolean) => {
      setSchedules((prev) =>
        prev.map((s) => (s.id === id ? { ...s, enabled } : s))
      );
      try {
        await api.updateSchedule(id, { enabled });
      } catch {
        setSchedules((prev) =>
          prev.map((s) =>
            s.id === id ? { ...s, enabled: !enabled } : s
          )
        );
      }
    },
    []
  );

  const deleteSchedule = useCallback(async (id: string) => {
    setSchedules((prev) => prev.filter((s) => s.id !== id));
    try {
      await api.deleteSchedule(id);
    } catch {
      // Revert on error — refetch to restore
    }
  }, []);

  return {
    schedules,
    loading,
    error,
    fetchSchedules,
    createSchedule,
    updateSchedule,
    toggleSchedule,
    deleteSchedule,
  };
}
