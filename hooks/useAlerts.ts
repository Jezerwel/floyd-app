import { useMemo } from "react";
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

const DEFAULT_THRESHOLDS = {
  LOW_FOOD: 30,
  CRITICAL_FOOD: 10,
  TEMP_MIN: 20,
  TEMP_MAX: 32,
} as const;

const SENSOR_RANGES = {
  TEMPERATURE: { min: -40, max: 85 },
  FOOD_LEVEL: { min: 0, max: 100 },
  DISTANCE: { min: 0, max: 400 },
} as const;

const validateSensorValue = (
  value: number,
  type: keyof typeof SENSOR_RANGES
): boolean => {
  const range = SENSOR_RANGES[type];
  return value >= range.min && value <= range.max;
};

const generateAlerts = (
  deviceData: any,
  isConnected: boolean,
  thresholds: typeof DEFAULT_THRESHOLDS
): Alert[] => {
  if (!isConnected) return [];

  const currentTime = new Date().toLocaleString();
  const newAlerts: Alert[] = [];

  if (
    deviceData.foodLevelPercentage !== undefined &&
    deviceData.foodLevelPercentage !== null &&
    deviceData.ultrasonicSensorConnected
  ) {
    const foodLevel = deviceData.foodLevelPercentage;
    if (validateSensorValue(foodLevel, "FOOD_LEVEL")) {
      if (foodLevel <= thresholds.CRITICAL_FOOD) {
        newAlerts.push({
          id: "critical_food",
          type: "CRITICAL_FOOD",
          message: `Critical food level at ${foodLevel.toFixed(1)}%. Immediate refill required!`,
          timestamp: currentTime,
          severity: "HIGH",
          isResolved: false,
          triggerValue: foodLevel,
        });
      } else if (foodLevel <= thresholds.LOW_FOOD) {
        newAlerts.push({
          id: "low_food",
          type: "LOW_FOOD",
          message: `Food level dropped to ${foodLevel.toFixed(1)}%. Consider refilling soon.`,
          timestamp: currentTime,
          severity: "MEDIUM",
          isResolved: false,
          triggerValue: foodLevel,
        });
      }
    }
  }

  if (
    deviceData.temperature !== undefined &&
    deviceData.temperature !== null &&
    deviceData.temperatureSensorConnected
  ) {
    const temp = deviceData.temperature;
    if (validateSensorValue(temp, "TEMPERATURE")) {
      if (temp > thresholds.TEMP_MAX) {
        newAlerts.push({
          id: "temp_high",
          type: "TEMPERATURE_HIGH",
          message: `Water temperature is high at ${temp.toFixed(1)} C. Check cooling system.`,
          timestamp: currentTime,
          severity: "MEDIUM",
          isResolved: false,
          triggerValue: temp,
        });
      } else if (temp < thresholds.TEMP_MIN) {
        newAlerts.push({
          id: "temp_low",
          type: "TEMPERATURE_LOW",
          message: `Water temperature is low at ${temp.toFixed(1)} C. Check heating system.`,
          timestamp: currentTime,
          severity: "MEDIUM",
          isResolved: false,
          triggerValue: temp,
        });
      }
    }
  }

  if (deviceData.temperatureSensorConnected === false) {
    newAlerts.push({
      id: "temp_sensor_disconnected",
      type: "SENSOR_DISCONNECTED",
      message: "Temperature sensor disconnected. Check wiring and connections.",
      timestamp: currentTime,
      severity: "LOW",
      isResolved: false,
    });
  }

  if (deviceData.ultrasonicSensorConnected === false) {
    newAlerts.push({
      id: "ultrasonic_sensor_disconnected",
      type: "SENSOR_DISCONNECTED",
      message: "Ultrasonic sensor disconnected. Food level monitoring unavailable.",
      timestamp: currentTime,
      severity: "LOW",
      isResolved: false,
    });
  }

  return newAlerts;
};

const getRelativeTime = (timestamp: string): string => {
  const now = new Date();
  const alertTime = new Date(timestamp);
  const diffMs = now.getTime() - alertTime.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMinutes < 1) return "Just now";
  if (diffMinutes < 60) return `${diffMinutes} minute${diffMinutes > 1 ? "s" : ""} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`;
  return `${diffDays} day${diffDays > 1 ? "s" : ""} ago`;
};

const useAlerts = () => {
  const { deviceData, isConnected } = useESP8266();

  // Use configurable thresholds with defaults
  const thresholds = DEFAULT_THRESHOLDS;

  // Derive alerts directly from deviceData using useMemo (no useEffect)
  const alertData = useMemo(() => {
    const rawAlerts = generateAlerts(deviceData, isConnected, thresholds);
    const alerts = rawAlerts.map((alert) => ({
      ...alert,
      timestamp: getRelativeTime(alert.timestamp),
    }));

    return {
      alerts,
      alertCount: alerts.length,
      hasHighSeverityAlerts: alerts.some((a) => a.severity === "HIGH"),
      hasMediumSeverityAlerts: alerts.some((a) => a.severity === "MEDIUM"),
    };
  }, [
    deviceData,
    isConnected,
  ]);

  return alertData;
};

export default useAlerts;
