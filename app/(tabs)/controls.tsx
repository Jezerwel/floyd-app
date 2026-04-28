import { useState, useCallback } from "react";
import { Surface } from "@/components/ui/Surface";
import { ControlPanel } from "@/components/sections/ControlPanel";
import { SliderSheet } from "@/components/sections/SliderSheet";
import { useESP8266 } from "@/hooks/useESP8266Context";

export default function ControlsScreen() {
  const [showSettings, setShowSettings] = useState(false);
  const [augerSpeed, setAugerSpeed] = useState(75);
  const [impellerSpeed, setImpellerSpeed] = useState(100);
  const [feedDuration, setFeedDuration] = useState(3);
  const [preSpin, setPreSpin] = useState(1.5);
  const [postSpin, setPostSpin] = useState(1.5);

  const {
    isConnected,
    deviceData,
    esp8266Status,
    startFeed,
    stopFeed,
    clearJam,
  } = useESP8266();

  const motorState = deviceData.motorState ?? "idle";
  const isHardwareOnline = esp8266Status === "connected";

  const handleFeed = useCallback(() => {
    startFeed({
      augerSpeed: Math.round(augerSpeed * 10.23),
      impellerSpeed: Math.round(impellerSpeed * 10.23),
      preSpinMs: Math.round(preSpin * 1000),
      feedMs: Math.round(feedDuration * 1000),
      postSpinMs: Math.round(postSpin * 1000),
    });
  }, [augerSpeed, impellerSpeed, feedDuration, preSpin, postSpin, startFeed]);

  const handleStop = useCallback(() => {
    stopFeed();
  }, [stopFeed]);

  const handleClearJam = useCallback(() => {
    clearJam();
  }, [clearJam]);

  return (
    <Surface safeTop>
      <ControlPanel
        motorState={motorState as "idle" | "pre_spin" | "feeding" | "post_spin" | "jam_clear"}
        isConnected={isConnected}
        isHardwareOnline={isHardwareOnline}
        onFeed={handleFeed}
        onStop={handleStop}
        onClearJam={handleClearJam}
        onOpenSettings={() => setShowSettings(true)}
      />

      <SliderSheet
        visible={showSettings}
        onClose={() => setShowSettings(false)}
        augerSpeed={augerSpeed}
        impellerSpeed={impellerSpeed}
        feedDuration={feedDuration}
        preSpin={preSpin}
        postSpin={postSpin}
        onAugerChange={setAugerSpeed}
        onImpellerChange={setImpellerSpeed}
        onDurationChange={setFeedDuration}
        onPreSpinChange={setPreSpin}
        onPostSpinChange={setPostSpin}
      />
    </Surface>
  );
}
