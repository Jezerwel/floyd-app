import mqtt, { IClientOptions, MqttClient } from "mqtt";
import { MQTT_CONFIG } from "../types";
import prisma from "./db";

type DeviceTopic = "command" | "telemetry" | "status" | "response" | "config";

class MQTTHandler {
  private client: MqttClient | null = null;
  private connectPromise: Promise<void> | null = null;
  private readonly subscribedTopics = new Set<string>();

  private readonly brokerUrl = MQTT_CONFIG.brokerUrl;

  async connect(): Promise<void> {
    if (this.client?.connected) {
      return;
    }

    if (this.connectPromise) {
      return this.connectPromise;
    }

    const options: IClientOptions = {
      clientId: `floyd-server-${process.pid}-${Date.now()}`,
      clean: true,
      reconnectPeriod: 5000,
      connectTimeout: 20000,
    };

    if (process.env.MQTT_USERNAME) {
      options.username = process.env.MQTT_USERNAME;
    }

    if (process.env.MQTT_PASSWORD) {
      options.password = process.env.MQTT_PASSWORD;
    }

    this.client = mqtt.connect(this.brokerUrl, options);
    this.client.on("message", (topic, payload) => {
      this.handleMessage(topic, payload).catch((error) => {
        console.error("[MQTT] Failed to handle message:", error);
      });
    });
    this.client.on("reconnect", () => console.log("[MQTT] Reconnecting to broker..."));
    this.client.on("error", (error) => console.error("[MQTT] Broker error:", error.message));
    this.client.on("close", () => console.log("[MQTT] Broker connection closed"));

    this.connectPromise = new Promise((resolve, reject) => {
      const handleConnect = () => {
        console.log(`[MQTT] Connected to broker ${this.brokerUrl}`);
        cleanup();
        this.connectPromise = null;
        resolve();
      };

      const handleError = (error: Error) => {
        cleanup();
        this.connectPromise = null;
        reject(error);
      };

      const cleanup = () => {
        this.client?.off("connect", handleConnect);
        this.client?.off("error", handleError);
      };

      this.client?.once("connect", handleConnect);
      this.client?.once("error", handleError);
    });

    return this.connectPromise;
  }

  async subscribeKnownDevices(): Promise<void> {
    const devices = await prisma.device.findMany({ select: { chipId: true } });
    for (const device of devices) {
      await this.subscribeDevice(device.chipId);
    }
  }

  async publishDevice(chipId: string, topic: DeviceTopic, payload: object): Promise<void> {
    if (!this.client?.connected) {
      throw new Error("MQTT client is not connected");
    }

    const fullTopic = this.deviceTopic(chipId, topic);
    await this.client.publishAsync(fullTopic, JSON.stringify(payload), { qos: 0 });
    console.log(`[MQTT] Published to ${fullTopic}`);
  }

  async subscribeDevice(chipId: string): Promise<void> {
    if (!this.client) {
      throw new Error("MQTT client is not initialized");
    }

    const topics = [
      this.deviceTopic(chipId, "telemetry"),
      this.deviceTopic(chipId, "status"),
      this.deviceTopic(chipId, "response"),
    ];

    for (const topic of topics) {
      if (this.subscribedTopics.has(topic)) {
        continue;
      }

      await this.client.subscribeAsync(topic, { qos: 0 });
      this.subscribedTopics.add(topic);
      console.log(`[MQTT] Subscribed to ${topic}`);
    }
  }

  async disconnect(): Promise<void> {
    if (!this.client) {
      return;
    }

    await this.client.endAsync();
    this.client = null;
    this.connectPromise = null;
    this.subscribedTopics.clear();
  }

  private deviceTopic(chipId: string, topic: DeviceTopic): string {
    return `floyd/devices/${chipId}/${topic}`;
  }

  private async handleMessage(topic: string, payload: Buffer): Promise<void> {
    if (!topic.endsWith("/response")) {
      return;
    }

    const message = JSON.parse(payload.toString());
    const data = message.data ?? {};

    if (data.action !== "feed_complete") {
      return;
    }

    await prisma.feedLog.create({
      data: {
        feedMs: Number(data.feedMs ?? 3000),
        augerSpeed: Number(data.augerSpeed ?? 768),
        impellerSpeed: Number(data.impellerSpeed ?? 1023),
        success: true,
      },
    });
    console.log("[MQTT] Feed completion logged");
  }
}

const mqttHandler = new MQTTHandler();

export default mqttHandler;
