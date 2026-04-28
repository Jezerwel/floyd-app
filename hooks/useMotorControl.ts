import { useState, useCallback } from "react";

interface MotorConfig {
  augerSpeed: number;
  impellerSpeed: number;
  feedDuration: number;
  preSpin: number;
  postSpin: number;
}

const defaults: MotorConfig = {
  augerSpeed: 50,
  impellerSpeed: 50,
  feedDuration: 5,
  preSpin: 2,
  postSpin: 2,
};

export function useMotorControl() {
  const [config, setConfig] = useState<MotorConfig>(defaults);
  const [isFeeding, setIsFeeding] = useState(false);

  const updateConfig = useCallback((partial: Partial<MotorConfig>) => {
    setConfig((prev) => ({ ...prev, ...partial }));
  }, []);

  const getFeedCommand = useCallback(
    () => ({
      command: "start_feed",
      payload: {
        auger_speed: Math.round(config.augerSpeed * 10.23),
        impeller_speed: Math.round(config.impellerSpeed * 10.23),
        duration: config.feedDuration,
        pre_spin: config.preSpin,
        post_spin: config.postSpin,
      },
    }),
    [config]
  );

  return { config, updateConfig, isFeeding, setIsFeeding, getFeedCommand };
}
