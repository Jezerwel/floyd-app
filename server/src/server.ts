/**
 * Floyd Fish Feeder API Server
 * Express REST API with MQTT broker integration for cloud device control.
 */

import cors from "cors";
import express from "express";
import type { Request, Response, NextFunction } from "express";
import type { Server as HttpServer } from "http";
import prisma from "./services/db";
import mqttHandler from "./services/mqttClient";
import FeedScheduler from "./services/scheduler";
import { DEFAULT_SERVER_CONFIG, MQTT_CONFIG, ServerConfig } from "./types";

class FloydFeederServer {
  private readonly app: express.Application;
  private server?: HttpServer;
  private readonly config: ServerConfig;
  private readonly scheduler: FeedScheduler;
  private readonly startTime: number = Date.now();

  constructor(config: Partial<ServerConfig> = {}) {
    this.config = { ...DEFAULT_SERVER_CONFIG, ...config };
    this.scheduler = new FeedScheduler();
    this.app = express();
    this.setupExpress();

    console.log("Floyd Feeder API Server initialized");
    console.log("Configuration:", JSON.stringify(this.config, null, 2));
  }

  private setupExpress(): void {
    this.app.use(
      cors({
        origin: [
          "http://localhost:3000",
          "http://127.0.0.1:3000",
          "exp://127.0.0.1:8081",
        ],
        credentials: true,
      })
    );

    this.app.use(express.json());

    const asyncHandler = (fn: (req: Request, res: Response) => Promise<void>) =>
      (req: Request, res: Response) => {
        fn(req, res).catch((err: Error) => {
          console.error(err);
          res.status(500).json({ success: false, error: "Internal server error" });
        });
      };

    this.app.get("/health", (_req: Request, res: Response) => {
      res.json({
        status: "healthy",
        timestamp: new Date().toISOString(),
        mode: "mqtt",
        server: {
          uptime: Date.now() - this.startTime,
        },
        mqtt: {
          brokerUrl: MQTT_CONFIG.brokerUrl,
        },
      });
    });

    this.app.get("/stats", (_req: Request, res: Response) => {
      res.json({
        server: {
          uptime: Date.now() - this.startTime,
          startTime: this.startTime,
          config: this.config,
        },
        mqtt: {
          brokerUrl: MQTT_CONFIG.brokerUrl,
        },
      });
    });

    this.app.get("/api/config", (_req: Request, res: Response) => {
      res.json({
        server: this.config,
        mqtt: MQTT_CONFIG,
      });
    });

    this.app.post("/api/devices/claim", asyncHandler(async (req, res) => {
      const { deviceId, deviceName, mqttPassword } = req.body;

      if (!deviceId || !mqttPassword) {
        res.status(400).json({ success: false, error: "deviceId and mqttPassword required" });
        return;
      }

      const existing = await prisma.device.findUnique({ where: { chipId: deviceId } });
      const device = existing
        ? await prisma.device.update({
            where: { chipId: deviceId },
            data: {
              name: deviceName || existing.name,
              mqttPassword,
              claimedAt: new Date(),
            },
          })
        : await prisma.device.create({
            data: {
              chipId: deviceId,
              name: deviceName || "Floyd Feeder",
              mqttPassword,
            },
          });

      await mqttHandler.subscribeDevice(deviceId);
      res.status(existing ? 200 : 201).json({ success: true, device });
    }));

    this.app.get("/api/devices", asyncHandler(async (_req, res) => {
      const devices = await prisma.device.findMany({ orderBy: { claimedAt: "desc" } });
      res.json({ success: true, devices });
    }));

    this.app.get("/api/schedules", asyncHandler(async (_req, res) => {
      const schedules = await prisma.feedSchedule.findMany({ orderBy: { createdAt: "asc" } });
      res.json({ success: true, schedules });
    }));

    this.app.post("/api/schedules", asyncHandler(async (req, res) => {
      const { label, time, daysOfWeek, augerSpeed, impellerSpeed, preSpinMs, feedMs, postSpinMs } = req.body;
      const schedule = await prisma.feedSchedule.create({
        data: {
          label: label || "Feed",
          time,
          daysOfWeek: daysOfWeek || "0,1,2,3,4,5,6",
          augerSpeed: augerSpeed || 768,
          impellerSpeed: impellerSpeed || 1023,
          preSpinMs: preSpinMs || 1500,
          feedMs: feedMs || 3000,
          postSpinMs: postSpinMs || 1500,
          enabled: true,
        },
      });
      this.scheduler.addJob(schedule);
      res.status(201).json({ success: true, schedule });
    }));

    this.app.put("/api/schedules/:id", asyncHandler(async (req, res) => {
      const { id } = req.params;
      const data = req.body;
      this.scheduler.removeJob(id);
      const schedule = await prisma.feedSchedule.update({ where: { id }, data });
      if (schedule.enabled) {
        this.scheduler.addJob(schedule);
      }
      res.json({ success: true, schedule });
    }));

    this.app.delete("/api/schedules/:id", asyncHandler(async (req, res) => {
      const { id } = req.params;
      this.scheduler.removeJob(id);
      await prisma.feedSchedule.delete({ where: { id } });
      res.json({ success: true });
    }));

    this.app.get("/api/history", asyncHandler(async (req, res) => {
      const limit = parseInt(req.query.limit as string, 10) || 50;
      const logs = await prisma.feedLog.findMany({ orderBy: { timestamp: "desc" }, take: limit });
      res.json({ success: true, logs });
    }));

    this.app.get("/api/alerts/config", asyncHandler(async (_req, res) => {
      const config = await prisma.alertConfig.findUnique({ where: { id: "default" } });
      res.json({
        success: true,
        config: config || { lowFoodPct: 30, criticalFoodPct: 10, tempMin: 20, tempMax: 32 },
      });
    }));

    this.app.put("/api/alerts/config", asyncHandler(async (req, res) => {
      const { lowFoodPct, criticalFoodPct, tempMin, tempMax } = req.body;
      const config = await prisma.alertConfig.upsert({
        where: { id: "default" },
        update: { lowFoodPct, criticalFoodPct, tempMin, tempMax },
        create: { id: "default", lowFoodPct, criticalFoodPct, tempMin, tempMax },
      });
      res.json({ success: true, config });
    }));

    this.app.use("*", (_req, res) => {
      res.status(404).json({
        error: "Endpoint not found",
        message: "This Floyd Feeder API endpoint does not exist",
        availableEndpoints: [
          "GET /health",
          "GET /stats",
          "GET /api/config",
          "GET /api/devices",
          "POST /api/devices/claim",
          "GET /api/schedules",
          "POST /api/schedules",
          "PUT /api/schedules/:id",
          "DELETE /api/schedules/:id",
          "GET /api/history",
          "GET /api/alerts/config",
          "PUT /api/alerts/config",
        ],
      });
    });

    this.app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
      console.error("Express error:", err);
      res.status(500).json({ error: "Internal server error", message: err.message || "An unexpected error occurred" });
    });
  }

  public async start(): Promise<void> {
    try {
      await mqttHandler.connect();
      await mqttHandler.subscribeKnownDevices();

      await new Promise<void>((resolve, reject) => {
        this.server = this.app.listen(this.config.port, () => {
          console.log("=====================================");
          console.log("Floyd Fish Feeder API Server READY");
          console.log("=====================================");
          console.log(`HTTP Server: http://localhost:${this.config.port}`);
          console.log(`MQTT Broker: ${MQTT_CONFIG.brokerUrl}`);
          console.log(`Health Check: http://localhost:${this.config.port}/health`);
          console.log(`Stats: http://localhost:${this.config.port}/stats`);
          console.log("=====================================");
          resolve();
        });

        this.server.on("error", (err: any) => {
          if (err.code === "EADDRINUSE") {
            console.error(`Port ${this.config.port} is already in use`);
            console.log("Try a different port or stop the other service");
          } else {
            console.error("Server error:", err);
          }
          reject(err);
        });
      });

      await this.scheduler.start();
      console.log("[Scheduler] Feed schedules loaded");
    } catch (error) {
      console.error("Failed to start Floyd Feeder API server:", error);
      throw error;
    }
  }

  public async stop(): Promise<void> {
    console.log("Shutting down Floyd Feeder API Server...");

    this.scheduler.stop();
    await mqttHandler.disconnect();

    await new Promise<void>((resolve) => {
      if (!this.server) {
        resolve();
        return;
      }

      this.server.close(() => {
        console.log("HTTP server closed");
        resolve();
      });
    });

    await prisma.$disconnect();
    console.log("Database disconnected");
    console.log("Floyd Feeder API Server shutdown complete");
  }

  public getApp(): express.Application {
    return this.app;
  }

  public getConfig(): ServerConfig {
    return { ...this.config };
  }
}

let server: FloydFeederServer;

const gracefulShutdown = async (signal: string) => {
  console.log(`\nReceived ${signal}, initiating graceful shutdown...`);
  if (server) {
    try {
      await server.stop();
      process.exit(0);
    } catch (error) {
      console.error("Error during shutdown:", error);
      process.exit(1);
    }
  } else {
    process.exit(0);
  }
};

process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));

if (require.main === module) {
  console.log("Starting Floyd Fish Feeder API Server...");

  const args = process.argv.slice(2);
  const config: Partial<ServerConfig> = {};

  for (let i = 0; i < args.length; i += 2) {
    const key = args[i]?.replace("--", "");
    const value = args[i + 1];

    if (key === "port" && value) {
      config.port = parseInt(value, 10);
    }
  }

  server = new FloydFeederServer(config);

  server.start().catch((error) => {
    console.error("Failed to start server:", error);
    process.exit(1);
  });
}

export default FloydFeederServer;
