/**
 * Floyd Fish Feeder Server Types
 * TypeScript interfaces for WebSocket communication protocol
 */

// Message Types sent from server to client
export type MessageType =
  | "sensor_data"
  | "control_response"
  | "error"
  | "status";

// Command Actions sent from client to server
export type CommandAction =
  | "toggle_relay"
  | "get_sensors"
  | "set_sensor_interval"
  | "ping";

/**
 * Base message interface for all WebSocket communications
 */
export interface BaseMessage {
  type: MessageType;
  timestamp: number;
}

/**
 * Generic message with data payload
 */
export interface WebSocketMessage<T = any> extends BaseMessage {
  data: T;
}

/**
 * Command structure sent from client to server
 */
export interface DeviceCommand {
  action: CommandAction;
  parameters?: Record<string, any>;
  timestamp?: number;
}

/**
 * Sensor data structure
 */
export interface SensorData {
  temperature?: number;
  distance?: number;
  foodLevelPercentage?: number;
  temperatureSensorConnected: boolean;
  ultrasonicSensorConnected: boolean;
  sensorConnected: boolean; // Backward compatibility
}

/**
 * Device state structure
 */
export interface DeviceState {
  ledState: boolean;
  relayState: boolean;
  motorOpened: boolean;
  sensorInterval: number;
  connected: boolean;
}

/**
 * Combined device status including sensors and state
 */
export interface DeviceStatus extends DeviceState, SensorData {
  lastUpdate: number;
}

/**
 * Feeder configuration
 */
export interface FeederConfig {
  height: number;
  minDistance: number;
  maxDistance: number;
}

/**
 * Sensor reading data for broadcast
 */
export interface SensorReading extends SensorData {
  ledState: boolean;
  relayState: boolean;
  motorOpened: boolean;
}

/**
 * Control response data
 */
export interface ControlResponse {
  action: string;
  ledState?: boolean;
  relayState?: boolean;
  motorOpened?: boolean;
  sensorInterval?: number;
  success: boolean;
  message?: string;
}

/**
 * Error response data
 */
export interface ErrorResponse {
  message: string;
  code?: string;
  action?: string;
}

/**
 * Status response data (for ping/pong and initial connection)
 */
export interface StatusResponse extends DeviceState {
  pong?: boolean;
  uptime?: number;
  feederConfig?: FeederConfig;
}

/**
 * WebSocket client information
 */
export interface ClientInfo {
  id: string;
  ip: string;
  connectedAt: number;
  lastPing?: number;
}

/**
 * ESP8266 connection configuration
 */
export interface ESP8266Config {
  host: string;
  port: number;
  reconnectDelay: number;
  maxReconnectAttempts: number;
  connectionTimeout: number;
}

/**
 * MQTT broker configuration
 */
export interface MQTTConfig {
  brokerUrl: string;
  username: string;
  password: string;
  clientId: string;
  topicPrefix: string;
  reconnectInterval: number;
  keepAlive: number;
}

/**
 * Server configuration
 */
export interface ServerConfig {
  port: number;
  sensorUpdateInterval: number;
  maxClients: number;
  feederConfig: FeederConfig;
  esp8266Config: ESP8266Config;
  mqttConfig?: MQTTConfig;
  useMqtt: boolean;
}

/**
 * Type guards for message validation
 */
export const isValidCommand = (obj: any): obj is DeviceCommand => {
  return (
    typeof obj === "object" &&
    obj !== null &&
    typeof obj.action === "string" &&
    ["toggle_relay", "get_sensors", "set_sensor_interval", "ping"].includes(
      obj.action
    )
  );
};

export const isValidMessageType = (type: string): type is MessageType => {
  return ["sensor_data", "control_response", "error", "status"].includes(type);
};

/**
 * Default values and constants
 */
export const DEFAULT_FEEDER_CONFIG: FeederConfig = {
  height: 20.0,
  minDistance: 3.0,
  maxDistance: 18.0,
};

export const DEFAULT_ESP8266_CONFIG: ESP8266Config = {
  host: process.env.ESP8266_HOST || "172.31.5.134",
  port: parseInt(process.env.ESP8266_PORT || "81", 10),
  reconnectDelay: 3000,
  maxReconnectAttempts: 5,
  connectionTimeout: 10000,
};

export const DEFAULT_MQTT_CONFIG: MQTTConfig = {
  brokerUrl: process.env.MQTT_BROKER_URL || "mqtt://broker.hivemq.com:1883",
  username: process.env.MQTT_USERNAME || "",
  password: process.env.MQTT_PASSWORD || "",
  clientId: process.env.MQTT_CLIENT_ID || `floyd-server-${Date.now()}`,
  topicPrefix: process.env.MQTT_TOPIC_PREFIX || "floyd",
  reconnectInterval: 5000,
  keepAlive: 60,
};

export const DEFAULT_SERVER_CONFIG: ServerConfig = {
  port: parseInt(process.env.PORT || "3001", 10),
  sensorUpdateInterval: 5000,
  maxClients: 10,
  feederConfig: DEFAULT_FEEDER_CONFIG,
  esp8266Config: DEFAULT_ESP8266_CONFIG,
  mqttConfig: DEFAULT_MQTT_CONFIG,
  useMqtt: process.env.USE_MQTT === "true",
};

export const SENSOR_INTERVAL_LIMITS = {
  min: 1000, // 1 second
  max: 60000, // 1 minute
} as const;
