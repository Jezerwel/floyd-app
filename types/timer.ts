/**
 * Timer-related types for fish feeder timer functionality
 */

export interface TimerState {
  isActive: boolean;
  remainingTime: number; // in seconds
  totalTime: number; // in seconds
  startTime: number; // timestamp when timer started
}

export interface TimerConfig {
  minutes: number;
  seconds: number;
}

export type TimerStatus =
  | "idle"
  | "running"
  | "paused"
  | "completed"
  | "stopped";

export interface TimerControlState {
  status: TimerStatus;
  config: TimerConfig;
  state: TimerState;
  lastUpdateTime: number;
}

export const DEFAULT_TIMER_STATE: TimerState = {
  isActive: false,
  remainingTime: 0,
  totalTime: 0,
  startTime: 0,
};

export const DEFAULT_TIMER_CONFIG: TimerConfig = {
  minutes: 0,
  seconds: 30,
};

export const DEFAULT_TIMER_CONTROL_STATE: TimerControlState = {
  status: "idle",
  config: DEFAULT_TIMER_CONFIG,
  state: DEFAULT_TIMER_STATE,
  lastUpdateTime: 0,
};
