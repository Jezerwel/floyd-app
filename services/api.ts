const BASE_URL = "https://floyd-feeder.up.railway.app";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

export interface Schedule {
  id: string;
  label: string;
  time: string;
  days: number[];
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface FeedHistoryEntry {
  id: string;
  timestamp: string;
  duration: number;
  augerSpeed: number;
  impellerSpeed: number;
  success: boolean;
}

export const api = {
  getSchedules: () => request<Schedule[]>("/api/schedules"),
  createSchedule: (data: Omit<Schedule, "id" | "createdAt" | "updatedAt">) =>
    request<Schedule>("/api/schedules", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  updateSchedule: (id: string, data: Partial<Schedule>) =>
    request<Schedule>(`/api/schedules/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  deleteSchedule: (id: string) =>
    request<void>(`/api/schedules/${id}`, { method: "DELETE" }),
  getFeedHistory: (limit = 50) =>
    request<FeedHistoryEntry[]>(`/api/history?limit=${limit}`),
};
