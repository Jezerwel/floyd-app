import React, { useState } from "react";
import {
  Alert,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { IconSymbol } from "./IconSymbol";

interface TimerControlProps {
  onStartTimer: (totalSeconds: number) => void;
  onStopTimer: () => void;
  isTimerActive: boolean;
  remainingTime: number;
  totalTime: number;
  disabled?: boolean;
  colors: {
    primary: string;
    secondary: string;
    success: string;
    error: string;
    warning: string;
    text: string;
    muted: string;
    card: string;
    border: string;
  };
}

export const TimerControl: React.FC<TimerControlProps> = ({
  onStartTimer,
  onStopTimer,
  isTimerActive,
  remainingTime,
  totalTime,
  disabled = false,
  colors,
}) => {
  const [minutes, setMinutes] = useState("0");
  const [seconds, setSeconds] = useState("30");

  const handleMinutesChange = (text: string) => {
    const numValue = parseInt(text) || 0;
    if (numValue >= 0 && numValue <= 59) {
      setMinutes(text);
    }
  };

  const handleSecondsChange = (text: string) => {
    const numValue = parseInt(text) || 0;
    if (numValue >= 0 && numValue <= 59) {
      setSeconds(text);
    }
  };

  const handleStartTimer = () => {
    const totalSeconds =
      (parseInt(minutes) || 0) * 60 + (parseInt(seconds) || 0);

    if (totalSeconds <= 0) {
      Alert.alert("Invalid Timer", "Please set a time greater than 0 seconds");
      return;
    }

    if (totalSeconds > 3600) {
      // 1 hour max
      Alert.alert("Timer Too Long", "Maximum timer duration is 1 hour");
      return;
    }

    onStartTimer(totalSeconds);
  };

  const formatTime = (timeInSeconds: number): string => {
    const mins = Math.floor(timeInSeconds / 60);
    const secs = timeInSeconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs
      .toString()
      .padStart(2, "0")}`;
  };

  if (isTimerActive) {
    return (
      <View style={styles.cardContent}>
        <View style={styles.timeDisplayContainer}>
          <Text style={[styles.timeRemaining, { color: colors.text }]}>
            {formatTime(remainingTime)}
          </Text>
          <Text style={[styles.timeLabel, { color: colors.muted }]}>
            remaining
          </Text>
        </View>

        <View style={styles.progressIndicator}>
          <View
            style={[
              styles.progressBar,
              { backgroundColor: colors.muted + "30" },
            ]}
          >
            <View
              style={[
                styles.progressFill,
                {
                  backgroundColor: colors.primary,
                  width: `${
                    totalTime > 0
                      ? ((totalTime - remainingTime) / totalTime) * 100
                      : 0
                  }%`,
                },
              ]}
            />
          </View>
          <Text style={[styles.progressText, { color: colors.muted }]}>
            {totalTime > 0
              ? Math.round(((totalTime - remainingTime) / totalTime) * 100)
              : 0}
            % complete
          </Text>
        </View>

        <View style={styles.timerInfo}>
          <Text style={[styles.totalTimeText, { color: colors.muted }]}>
            Total Duration: {formatTime(totalTime)}
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.stopButton, { backgroundColor: colors.error }]}
          onPress={onStopTimer}
          disabled={disabled}
        >
          <IconSymbol name="xmark" size={20} color="white" />
          <Text style={styles.stopButtonText}>Stop Feeding</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.cardContent}>
      <View style={styles.timeInputContainer}>
        <View style={styles.timeInputGroup}>
          <Text style={[styles.timeInputLabel, { color: colors.text }]}>
            Minutes
          </Text>
          <TextInput
            style={[
              styles.timeInput,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
                color: colors.text,
              },
            ]}
            value={minutes}
            onChangeText={handleMinutesChange}
            keyboardType="numeric"
            maxLength={2}
            placeholder="0"
            placeholderTextColor={colors.muted}
          />
        </View>

        <Text style={[styles.timeSeparator, { color: colors.muted }]}>:</Text>

        <View style={styles.timeInputGroup}>
          <Text style={[styles.timeInputLabel, { color: colors.text }]}>
            Seconds
          </Text>
          <TextInput
            style={[
              styles.timeInput,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
                color: colors.text,
              },
            ]}
            value={seconds}
            onChangeText={handleSecondsChange}
            keyboardType="numeric"
            maxLength={2}
            placeholder="0"
            placeholderTextColor={colors.muted}
          />
        </View>
      </View>

      <View style={styles.durationPreviewContainer}>
        <Text style={[styles.durationPreview, { color: colors.muted }]}>
          Duration:{" "}
          {formatTime((parseInt(minutes) || 0) * 60 + (parseInt(seconds) || 0))}
        </Text>
      </View>

      <TouchableOpacity
        style={[
          styles.startButton,
          {
            backgroundColor: disabled ? colors.muted : colors.success,
            opacity: disabled ? 0.5 : 1,
          },
        ]}
        onPress={handleStartTimer}
        disabled={disabled}
      >
        <IconSymbol name="circle" size={20} color="white" />
        <Text style={styles.startButtonText}>Start Timed Feeding</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  statCard: {
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },

  cardContent: {
    gap: 16,
  },
  timeDisplayContainer: {
    alignItems: "center",
    gap: 4,
  },
  timeInputContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
  },
  timeInputGroup: {
    alignItems: "center",
    gap: 8,
  },
  timeInputLabel: {
    fontSize: 14,
    fontWeight: "500",
  },
  timeInput: {
    width: 60,
    height: 50,
    textAlign: "center",
    fontSize: 18,
    fontWeight: "600",
    borderWidth: 2,
    borderRadius: 8,
    paddingHorizontal: 8,
  },
  timeSeparator: {
    fontSize: 24,
    fontWeight: "bold",
    marginTop: 20,
  },
  startButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
    borderRadius: 12,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  startButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
  },
  durationPreviewContainer: {
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "rgba(0,0,0,0.1)",
    alignItems: "center",
  },
  durationPreview: {
    fontSize: 14,
    textAlign: "center",
    fontWeight: "500",
  },
  activeTimerContainer: {
    gap: 20,
    alignItems: "center",
  },
  timerCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
    gap: 16,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  clockContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
  },
  clockIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  timeDisplay: {
    alignItems: "center",
    flex: 1,
  },
  timeRemaining: {
    fontSize: 28,
    fontWeight: "bold",
    textAlign: "center",
  },
  timeLabel: {
    fontSize: 14,
    fontWeight: "500",
    textAlign: "center",
  },
  progressIndicator: {
    gap: 8,
    alignItems: "center",
  },
  progressBar: {
    width: "100%",
    height: 8,
    borderRadius: 4,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 4,
  },
  progressText: {
    fontSize: 12,
    fontWeight: "500",
  },
  timerInfo: {
    alignItems: "center",
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "rgba(0,0,0,0.1)",
  },
  stopButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  stopButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
  },
  totalTimeText: {
    fontSize: 14,
    fontWeight: "500",
  },
});
