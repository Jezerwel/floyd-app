import { useState, useCallback } from "react";
import { api, type FeedHistoryEntry } from "../services/api";

export function useFeedHistory() {
  const [entries, setEntries] = useState<FeedHistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchHistory = useCallback(async (limit = 50) => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getFeedHistory(limit);
      setEntries(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to fetch history");
    } finally {
      setLoading(false);
    }
  }, []);

  return { entries, loading, error, fetchHistory };
}
