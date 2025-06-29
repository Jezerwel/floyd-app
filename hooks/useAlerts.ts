import { useEffect, useState } from "react";
import { useESP8266 } from "./useESP8266Context";

export interface Alert {
  id: string;
  type:
    | "LOW_FOOD"
    | "CRITICAL_FOOD"
    | "TEMPERATURE_HIGH"
    | "TEMPERATURE_LOW"
    | "SENSOR_DISCONNECTED"
    | "CONNECTION_LOST";
  message: string;
  timestamp: string;
  severity: "HIGH" | "MEDIUM" | "LOW";
  isResolved: boolean;
  triggerValue?: number;
}

// Alert thresholds
const THRESHOLDS = {
  LOW_FOOD: 30,
  CRITICAL_FOOD: 10,
  TEMP_MIN: 20,
  TEMP_MAX: 32,
};

const useAlerts = () => {
  const { deviceData, isConnected } = useESP8266();
  const [alerts, setAlerts] = useState<Alert[]>([]);

  // Reset alerts when disconnected
  useEffect(() => {
    if (!isConnected) {
      setAlerts([]);
    }
  }, [isConnected]);

  // Monitor sensor data and generate/resolve alerts
  useEffect(() => {
    if (!isConnected) return;

    const currentTime = new Date().toLocaleString();
    const newAlerts: Alert[] = [];

    // Food level alerts
    if (
      deviceData.foodLevelPercentage !== undefined &&
      deviceData.ultrasonicSensorConnected
    ) {
      const foodLevel = deviceData.foodLevelPercentage;

      if (foodLevel <= THRESHOLDS.CRITICAL_FOOD) {
        newAlerts.push({
          id: "critical_food",
          type: "CRITICAL_FOOD",
          message: `Critical food level at ${foodLevel.toFixed(
            1
          )}%. Immediate refill required!`,
          timestamp: currentTime,
          severity: "HIGH",
          isResolved: false,
          triggerValue: foodLevel,
        });
      } else if (foodLevel <= THRESHOLDS.LOW_FOOD) {
        newAlerts.push({
          id: "low_food",
          type: "LOW_FOOD",
          message: `Food level dropped to ${foodLevel.toFixed(
            1
          )}%. Consider refilling soon.`,
          timestamp: currentTime,
          severity: "MEDIUM",
          isResolved: false,
          triggerValue: foodLevel,
        });
      }
    }

    // Temperature alerts
    if (
      deviceData.temperature !== undefined &&
      deviceData.temperatureSensorConnected
    ) {
      const temp = deviceData.temperature;

      if (temp > THRESHOLDS.TEMP_MAX) {
        newAlerts.push({
          id: "temp_high",
          type: "TEMPERATURE_HIGH",
          message: `Water temperature is high at ${temp.toFixed(
            1
          )}°C. Check cooling system.`,
          timestamp: currentTime,
          severity: "MEDIUM",
          isResolved: false,
          triggerValue: temp,
        });
      } else if (temp < THRESHOLDS.TEMP_MIN) {
        newAlerts.push({
          id: "temp_low",
          type: "TEMPERATURE_LOW",
          message: `Water temperature is low at ${temp.toFixed(
            1
          )}°C. Check heating system.`,
          timestamp: currentTime,
          severity: "MEDIUM",
          isResolved: false,
          triggerValue: temp,
        });
      }
    }

    // Sensor disconnection alerts
    if (deviceData.temperatureSensorConnected === false) {
      newAlerts.push({
        id: "temp_sensor_disconnected",
        type: "SENSOR_DISCONNECTED",
        message:
          "Temperature sensor disconnected. Check wiring and connections.",
        timestamp: currentTime,
        severity: "LOW",
        isResolved: false,
      });
    }

    if (deviceData.ultrasonicSensorConnected === false) {
      newAlerts.push({
        id: "ultrasonic_sensor_disconnected",
        type: "SENSOR_DISCONNECTED",
        message:
          "Ultrasonic sensor disconnected. Food level monitoring unavailable.",
        timestamp: currentTime,
        severity: "LOW",
        isResolved: false,
      });
    }

    // Update alerts state
    setAlerts((prevAlerts) => {
      // Remove old alerts that should be auto-resolved
      const unresolvedAlerts = prevAlerts.filter((alert) => {
        // Keep alerts that are still relevant
        const newAlertIds = newAlerts.map((a) => a.id);
        return newAlertIds.includes(alert.id);
      });

      // Add new alerts that don't already exist
      const existingIds = unresolvedAlerts.map((a) => a.id);
      const alertsToAdd = newAlerts.filter(
        (alert) => !existingIds.includes(alert.id)
      );

      // Combine and limit to 6 alerts (newest first)
      const allAlerts = [...alertsToAdd, ...unresolvedAlerts];
      return allAlerts.slice(0, 6);
    });
  }, [
    isConnected,
    deviceData.foodLevelPercentage,
    deviceData.temperature,
    deviceData.temperatureSensorConnected,
    deviceData.ultrasonicSensorConnected,
  ]);

  const getRelativeTime = (timestamp: string): string => {
    const now = new Date();
    const alertTime = new Date(timestamp);
    const diffMs = now.getTime() - alertTime.getTime();
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMinutes < 1) return "Just now";
    if (diffMinutes < 60)
      return `${diffMinutes} minute${diffMinutes > 1 ? "s" : ""} ago`;
    if (diffHours < 24)
      return `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`;
    return `${diffDays} day${diffDays > 1 ? "s" : ""} ago`;
  };

  // Convert absolute timestamps to relative times for display
  const alertsWithRelativeTime = alerts.map((alert) => ({
    ...alert,
    timestamp: getRelativeTime(alert.timestamp),
  }));

  return {
    alerts: alertsWithRelativeTime,
    alertCount: alerts.length,
    hasHighSeverityAlerts: alerts.some((alert) => alert.severity === "HIGH"),
    hasMediumSeverityAlerts: alerts.some(
      (alert) => alert.severity === "MEDIUM"
    ),
  };
};

export default useAlerts;
