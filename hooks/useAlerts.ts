import { useCallback, useEffect, useMemo, useState } from "react";
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
} as const;

// Validation ranges for sensor values
const SENSOR_RANGES = {
  TEMPERATURE: { min: -40, max: 85 }, // DS18B20 sensor range
  FOOD_LEVEL: { min: 0, max: 100 },
  DISTANCE: { min: 0, max: 400 }, // HC-SR04 max range ~4m
} as const;

const validateSensorValue = (
  value: number,
  type: keyof typeof SENSOR_RANGES
): boolean => {
  const range = SENSOR_RANGES[type];
  return value >= range.min && value <= range.max;
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

  // Generate current alerts based on sensor data
  const generateCurrentAlerts = useCallback((): Alert[] => {
    if (!isConnected) return [];

    const currentTime = new Date().toLocaleString();
    const newAlerts: Alert[] = [];

    // Food level alerts
    if (
      deviceData.foodLevelPercentage !== undefined &&
      deviceData.ultrasonicSensorConnected
    ) {
      const foodLevel = deviceData.foodLevelPercentage;

      // Validate food level value
      if (validateSensorValue(foodLevel, "FOOD_LEVEL")) {
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
    }

    // Temperature alerts
    if (
      deviceData.temperature !== undefined &&
      deviceData.temperatureSensorConnected
    ) {
      const temp = deviceData.temperature;

      // Validate temperature value
      if (validateSensorValue(temp, "TEMPERATURE")) {
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

    return newAlerts;
  }, [
    isConnected,
    deviceData.foodLevelPercentage,
    deviceData.temperature,
    deviceData.temperatureSensorConnected,
    deviceData.ultrasonicSensorConnected,
  ]);

  // Memoized current alerts to avoid unnecessary recalculations
  const currentAlerts = useMemo(
    () => generateCurrentAlerts(),
    [generateCurrentAlerts]
  );

  // Only update alerts state when the actual alerts change
  useEffect(() => {
    setAlerts((prevAlerts) => {
      // Create a comparison key for each alert to detect changes
      const getCurrentAlertKeys = (alerts: Alert[]) =>
        alerts
          .map((alert) => `${alert.id}:${alert.triggerValue}`)
          .sort()
          .join("|");

      const prevAlertKeys = getCurrentAlertKeys(prevAlerts);
      const currentAlertKeys = getCurrentAlertKeys(currentAlerts);

      // Only update if alerts actually changed
      if (prevAlertKeys !== currentAlertKeys) {
        // Limit to 6 alerts (newest first)
        return currentAlerts.slice(0, 6);
      }

      return prevAlerts;
    });
  }, [currentAlerts]);

  const getRelativeTime = useCallback((timestamp: string): string => {
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
  }, []);

  // Convert absolute timestamps to relative times for display
  const alertsWithRelativeTime = useMemo(
    () =>
      alerts.map((alert) => ({
        ...alert,
        timestamp: getRelativeTime(alert.timestamp),
      })),
    [alerts, getRelativeTime]
  );

  const alertAnalysis = useMemo(
    () => ({
      alertCount: alerts.length,
      hasHighSeverityAlerts: alerts.some((alert) => alert.severity === "HIGH"),
      hasMediumSeverityAlerts: alerts.some(
        (alert) => alert.severity === "MEDIUM"
      ),
    }),
    [alerts]
  );

  return {
    alerts: alertsWithRelativeTime,
    ...alertAnalysis,
  };
};

export default useAlerts;
