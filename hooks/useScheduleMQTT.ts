import { useCallback, useMemo, useState } from "react";
import { useESP32 } from "./useESP32Context";

export interface Schedule {
  id: string;
  label: string;
  time: string; // "HH:MM"
  daysOfWeek: string; // "0,1,2,3,4,5,6"
  augerSpeed: number;
  impellerSpeed: number;
  preSpinMs: number;
  feedMs: number;
  postSpinMs: number;
  enabled: boolean;
}

export function useScheduleMQTT() {
  const { isConnected, publishCommand, deviceData, publishScheduleSync } =
    useESP32();
  const [schedules, setSchedulesLocal] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSchedules = useCallback(() => {
    if (!isConnected) return;
    setLoading(true);
    publishCommand("get_schedules");
  }, [isConnected, publishCommand]);

  const pushSchedules = useCallback(
    (newSchedules: Schedule[]): boolean => {
      if (!isConnected) {
        setError("Not connected to feeder");
        return false;
      }
      setLoading(true);
      const ok = publishScheduleSync(newSchedules);
      if (ok) {
        setSchedulesLocal(newSchedules);
      }
      setLoading(false);
      return ok;
    },
    [isConnected, publishScheduleSync],
  );

  // Derive schedules from deviceData when schedules_list arrives (no useEffect)
  useMemo(() => {
    if (deviceData?.schedules && Array.isArray(deviceData.schedules)) {
      setSchedulesLocal(deviceData.schedules as Schedule[]);
      setLoading(false);
    }
    return undefined;
  }, [deviceData]);

  // Fetch on connect
  useMemo(() => {
    if (isConnected) {
      fetchSchedules();
    }
    return undefined;
  }, [isConnected, fetchSchedules]);

  return { schedules, loading, error, fetchSchedules, pushSchedules };
}
