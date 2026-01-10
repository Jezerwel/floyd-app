import mqtt, { MqttClient, IClientOptions } from "mqtt";
import { EventEmitter } from "events";
import {
  MQTTConfig,
  DeviceCommand,
  SensorData,
  ControlResponse,
  DEFAULT_MQTT_CONFIG,
} from "../types";

export interface MQTTMessage {
  topic: string;
  deviceId: string;
  type: "sensors" | "status" | "response";
  data: Record<string, unknown>;
  timestamp: number;
}

export interface MQTTBridgeStatus {
  isConnected: boolean;
  isConnecting: boolean;
  lastError: string | null;
  reconnectAttempts: number;
  subscribedDevices: string[];
  messageCount: {
    received: number;
    sent: number;
  };
}

export class MQTTBridge extends EventEmitter {
  private client: MqttClient | null = null;
  private config: MQTTConfig;
  private status: MQTTBridgeStatus = {
    isConnected: false,
    isConnecting: false,
    lastError: null,
    reconnectAttempts: 0,
    subscribedDevices: [],
    messageCount: { received: 0, sent: 0 },
  };
  private subscribedDevices: Set<string> = new Set();
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(config: Partial<MQTTConfig> = {}) {
    super();
    this.config = { ...DEFAULT_MQTT_CONFIG, ...config };
    console.log("📡 MQTT Bridge initialized with config:", {
      brokerUrl: this.config.brokerUrl,
      clientId: this.config.clientId,
      topicPrefix: this.config.topicPrefix,
    });
  }

  public async connect(): Promise<void> {
    if (this.status.isConnected || this.status.isConnecting) {
      console.log("⚠️ MQTT Bridge already connected or connecting");
      return;
    }

    this.status.isConnecting = true;
    this.emit("connecting");

    const options: IClientOptions = {
      clientId: this.config.clientId,
      clean: true,
      connectTimeout: 30000,
      reconnectPeriod: this.config.reconnectInterval,
      keepalive: this.config.keepAlive,
    };

    if (this.config.username && this.config.password) {
      options.username = this.config.username;
      options.password = this.config.password;
    }

    try {
      console.log(`🔌 Connecting to MQTT broker: ${this.config.brokerUrl}`);
      this.client = mqtt.connect(this.config.brokerUrl, options);

      this.client.on("connect", () => {
        console.log("✅ MQTT Bridge connected to broker");
        this.status.isConnected = true;
        this.status.isConnecting = false;
        this.status.lastError = null;
        this.status.reconnectAttempts = 0;
        this.emit("connected");
        this.subscribeToAllDevices();
      });

      this.client.on("message", (topic, payload) => {
        this.handleMessage(topic, payload);
      });

      this.client.on("error", (error) => {
        console.error("❌ MQTT Bridge error:", error.message);
        this.status.lastError = error.message;
        this.emit("error", error);
      });

      this.client.on("close", () => {
        console.log("🔌 MQTT Bridge disconnected");
        this.status.isConnected = false;
        this.emit("disconnected");
      });

      this.client.on("reconnect", () => {
        this.status.reconnectAttempts++;
        console.log(
          `🔄 MQTT Bridge reconnecting (attempt ${this.status.reconnectAttempts})`
        );
        this.emit("reconnecting", this.status.reconnectAttempts);
      });

      this.client.on("offline", () => {
        console.log("📴 MQTT Bridge offline");
        this.status.isConnected = false;
        this.emit("offline");
      });
    } catch (error) {
      this.status.isConnecting = false;
      this.status.lastError =
        error instanceof Error ? error.message : "Unknown error";
      console.error("❌ Failed to connect to MQTT broker:", error);
      throw error;
    }
  }

  public disconnect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.client) {
      console.log("🔌 Disconnecting MQTT Bridge");
      this.client.end(true);
      this.client = null;
    }

    this.status.isConnected = false;
    this.status.isConnecting = false;
    this.subscribedDevices.clear();
    this.status.subscribedDevices = [];
  }

  public subscribeToDevice(deviceId: string): void {
    if (!this.client || !this.status.isConnected) {
      console.warn("⚠️ Cannot subscribe: MQTT not connected");
      return;
    }

    if (this.subscribedDevices.has(deviceId)) {
      return;
    }

    const topics = [
      `${this.config.topicPrefix}/${deviceId}/sensors`,
      `${this.config.topicPrefix}/${deviceId}/status`,
      `${this.config.topicPrefix}/${deviceId}/response`,
    ];

    topics.forEach((topic) => {
      this.client?.subscribe(topic, { qos: 1 }, (err) => {
        if (err) {
          console.error(`❌ Failed to subscribe to ${topic}:`, err);
        } else {
          console.log(`📥 Subscribed to ${topic}`);
        }
      });
    });

    this.subscribedDevices.add(deviceId);
    this.status.subscribedDevices = Array.from(this.subscribedDevices);
  }

  public unsubscribeFromDevice(deviceId: string): void {
    if (!this.client || !this.subscribedDevices.has(deviceId)) {
      return;
    }

    const topics = [
      `${this.config.topicPrefix}/${deviceId}/sensors`,
      `${this.config.topicPrefix}/${deviceId}/status`,
      `${this.config.topicPrefix}/${deviceId}/response`,
    ];

    topics.forEach((topic) => {
      this.client?.unsubscribe(topic);
    });

    this.subscribedDevices.delete(deviceId);
    this.status.subscribedDevices = Array.from(this.subscribedDevices);
    console.log(`📤 Unsubscribed from device: ${deviceId}`);
  }

  public sendCommand(deviceId: string, command: DeviceCommand): boolean {
    if (!this.client || !this.status.isConnected) {
      console.warn("⚠️ Cannot send command: MQTT not connected");
      return false;
    }

    const topic = `${this.config.topicPrefix}/${deviceId}/commands`;
    const payload = JSON.stringify({
      ...command,
      timestamp: Date.now(),
    });

    try {
      this.client.publish(topic, payload, { qos: 1 }, (err) => {
        if (err) {
          console.error(`❌ Failed to publish to ${topic}:`, err);
        } else {
          console.log(`📤 Command sent to ${deviceId}:`, command.action);
          this.status.messageCount.sent++;
        }
      });
      return true;
    } catch (error) {
      console.error("❌ Error sending command:", error);
      return false;
    }
  }

  public getStatus(): MQTTBridgeStatus {
    return { ...this.status };
  }

  public updateConfig(config: Partial<MQTTConfig>): void {
    const wasConnected = this.status.isConnected;

    if (wasConnected) {
      this.disconnect();
    }

    this.config = { ...this.config, ...config };

    if (wasConnected) {
      this.connect();
    }
  }

  private subscribeToAllDevices(): void {
    const wildcardTopic = `${this.config.topicPrefix}/+/+`;
    this.client?.subscribe(wildcardTopic, { qos: 1 }, (err) => {
      if (err) {
        console.error(`❌ Failed to subscribe to wildcard:`, err);
      } else {
        console.log(`📥 Subscribed to all devices: ${wildcardTopic}`);
      }
    });
  }

  private handleMessage(topic: string, payload: Buffer): void {
    try {
      const parts = topic.split("/");
      if (parts.length < 3) {
        console.warn(`⚠️ Invalid topic format: ${topic}`);
        return;
      }

      const [prefix, deviceId, messageType] = parts;

      if (prefix !== this.config.topicPrefix) {
        return;
      }

      const data = JSON.parse(payload.toString());
      this.status.messageCount.received++;

      const message: MQTTMessage = {
        topic,
        deviceId,
        type: messageType as "sensors" | "status" | "response",
        data,
        timestamp: data.timestamp || Date.now(),
      };

      console.log(
        `📨 MQTT message from ${deviceId}/${messageType}:`,
        JSON.stringify(data).substring(0, 100)
      );

      this.emit("message", message);

      switch (messageType) {
        case "sensors":
          this.emit("sensorData", deviceId, data as SensorData);
          break;
        case "status":
          this.emit("deviceStatus", deviceId, data);
          break;
        case "response":
          this.emit("commandResponse", deviceId, data as ControlResponse);
          break;
      }
    } catch (error) {
      console.error("❌ Error handling MQTT message:", error);
    }
  }
}

export default MQTTBridge;
