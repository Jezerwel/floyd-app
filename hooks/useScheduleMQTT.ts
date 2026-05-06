import { useCallback, useEffect, useState } from "react";
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
	const { isConnected, deviceData, publishScheduleSync, reloadSchedules } =
		useESP32();
	const [schedules, setSchedulesLocal] = useState<Schedule[]>([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		const s = deviceData.schedules;
		if (s !== undefined && Array.isArray(s)) {
			setSchedulesLocal(s as Schedule[]);
			setLoading(false);
		}
	}, [deviceData.schedules]);

	useEffect(() => {
		if (!isConnected) return;
		setLoading(true);
		void reloadSchedules().then((ok) => {
			if (!ok) setLoading(false);
		});
	}, [isConnected, reloadSchedules]);

	const fetchSchedules = useCallback(() => {
		if (!isConnected) return;
		setLoading(true);
		void reloadSchedules().then((ok) => {
			if (!ok) setLoading(false);
		});
	}, [isConnected, reloadSchedules]);

	const pushSchedules = useCallback(
		async (newSchedules: Schedule[]): Promise<boolean> => {
			if (!isConnected) {
				setError("Not connected to feeder");
				return false;
			}
			setError(null);
			setLoading(true);
			try {
				const ok = await publishScheduleSync(newSchedules);
				if (ok) {
					setSchedulesLocal(newSchedules);
				} else {
					setError("Failed to sync schedules to the feeder");
				}
				return ok;
			} catch {
				setError("Failed to sync schedules to the feeder");
				return false;
			} finally {
				setLoading(false);
			}
		},
		[isConnected, publishScheduleSync],
	);

	return { schedules, loading, error, fetchSchedules, pushSchedules };
}
