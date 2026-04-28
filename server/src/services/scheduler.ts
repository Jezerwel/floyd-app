import cron from 'node-cron';
import prisma from './db';
import { ESP8266Client } from './esp8266Client';

interface ScheduledFeed {
  id: string;
  label: string;
  enabled: boolean;
  time: string;
  daysOfWeek: string;
  augerSpeed: number;
  impellerSpeed: number;
  preSpinMs: number;
  feedMs: number;
  postSpinMs: number;
}

class FeedScheduler {
  private jobs: Map<string, cron.ScheduledTask> = new Map();
  private espClient: ESP8266Client;

  constructor(espClient: ESP8266Client) {
    this.espClient = espClient;
  }

  async start() {
    console.log('[Scheduler] Loading schedules from database...');
    const schedules = await prisma.feedSchedule.findMany({
      where: { enabled: true },
    });
    for (const schedule of schedules) {
      this.addJob(schedule);
    }
    console.log(`[Scheduler] Loaded ${this.jobs.size} schedules`);
  }

  addJob(schedule: ScheduledFeed) {
    if (!schedule.enabled) return;

    const [hour, minute] = schedule.time.split(':').map(Number);
    if (isNaN(hour) || isNaN(minute)) return;

    const cronExpr = `${minute} ${hour} * * ${schedule.daysOfWeek}`;

    const task = cron.schedule(cronExpr, async () => {
      console.log(`[Scheduler] Running scheduled feed: ${schedule.label}`);

      if (!this.espClient.getStatus().isConnected) {
        console.log(`[Scheduler] ESP8266 not connected, skipping feed: ${schedule.label}`);
        await prisma.feedLog.create({
          data: {
            feedMs: schedule.feedMs,
            augerSpeed: schedule.augerSpeed,
            impellerSpeed: schedule.impellerSpeed,
            success: false,
            errorMessage: 'ESP8266 not connected',
          },
        });
        return;
      }

      try {
        this.espClient.sendCommand({
          action: 'start_feed',
          parameters: {
            augerSpeed: schedule.augerSpeed,
            impellerSpeed: schedule.impellerSpeed,
            preSpinMs: schedule.preSpinMs,
            feedMs: schedule.feedMs,
            postSpinMs: schedule.postSpinMs,
          },
        });

        await prisma.feedLog.create({
          data: {
            feedMs: schedule.feedMs,
            augerSpeed: schedule.augerSpeed,
            impellerSpeed: schedule.impellerSpeed,
            success: true,
          },
        });
      } catch (err: any) {
        console.error(`[Scheduler] Feed failed: ${err.message}`);
        await prisma.feedLog.create({
          data: {
            feedMs: schedule.feedMs,
            augerSpeed: schedule.augerSpeed,
            impellerSpeed: schedule.impellerSpeed,
            success: false,
            errorMessage: err.message,
          },
        });
      }
    });

    this.jobs.set(schedule.id, task);
  }

  removeJob(id: string) {
    const job = this.jobs.get(id);
    if (job) {
      job.stop();
      this.jobs.delete(id);
    }
  }

  stop() {
    for (const [, job] of this.jobs) {
      job.stop();
    }
    this.jobs.clear();
  }
}

export default FeedScheduler;
