import { IconSymbol } from "@/components/ui/IconSymbol";
import { LOG_SENSOR_PREVIEW_LIMIT } from "@/constants/logs";
import { Colors } from "@/constants/Colors";
import useAlerts, { type Alert } from "@/hooks/useAlerts";
import { useColorScheme } from "@/hooks/useColorScheme";
import { useESP32, type SensorLogEntry } from "@/hooks/useESP32Context";
import { Stack, useLocalSearchParams } from "expo-router";
import React, { useMemo } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type LogSection = "sensor" | "alerts" | "feeds";

const SECTION_COPY: Record<
	LogSection,
	{ title: string; description: string }
> = {
	sensor: {
		title: "Sensor log",
		description: `All readings captured while connected (Logs preview shows the latest ${LOG_SENSOR_PREVIEW_LIMIT}).`,
	},
	alerts: {
		title: "Alert history",
		description: "Active alerts from the latest device readings.",
	},
	feeds: {
		title: "Feed history",
		description: "Recorded feed completions from the feeder.",
	},
};

function normalizeSection(raw: string | string[] | undefined): LogSection {
	const s = Array.isArray(raw) ? raw[0] : raw;
	if (s === "alerts" || s === "feeds") return s;
	return "sensor";
}

export default function LogsMoreScreen() {
	const { section: sectionParam } = useLocalSearchParams<{
		section?: string | string[];
	}>();
	const section = useMemo(
		() => normalizeSection(sectionParam),
		[sectionParam],
	);

	const colorScheme = useColorScheme();
	const colors = Colors[colorScheme as keyof typeof Colors];
	const { sensorLogs, feedLogs, clearSensorLogs } = useESP32();
	const { alerts } = useAlerts();

	const meta = SECTION_COPY[section];

	const formatTime = (date: Date) => date.toLocaleTimeString();
	const formatDate = (date: Date) => date.toLocaleDateString();

	const renderSensorLogItem = (item: SensorLogEntry) => (
		<View
			key={item.id}
			style={[
				styles.logItem,
				{ backgroundColor: colors.card, borderColor: colors.border },
			]}
		>
			<View style={styles.logHeader}>
				<Text style={[styles.logTime, { color: colors.text }]}>
					{formatTime(item.timestamp)}
				</Text>
				<Text style={[styles.logDate, { color: colors.muted }]}>
					{formatDate(item.timestamp)}
				</Text>
			</View>
			<View style={styles.logContent}>
				{item.temperature !== undefined && item.temperature !== null && (
					<Text style={[styles.logValue, { color: colors.text }]}>
						{item.temperature.toFixed(1)}°C
					</Text>
				)}
				{item.distance !== undefined && item.distance !== null && (
					<Text style={[styles.logValue, { color: colors.text }]}>
						{item.distance.toFixed(1)}cm
					</Text>
				)}
				{item.foodLevel !== undefined && item.foodLevel !== null && (
					<Text style={[styles.logValue, { color: colors.text }]}>
						{item.foodLevel.toFixed(1)}%
					</Text>
				)}
			</View>
			<View style={styles.sensorStatus}>
				<View
					style={[
						styles.statusDot,
						{
							backgroundColor: item.temperatureSensorConnected
								? colors.success
								: colors.error,
						},
					]}
				/>
				<Text style={[styles.statusText, { color: colors.muted }]}>Temp</Text>
				<View
					style={[
						styles.statusDot,
						{
							backgroundColor: item.ultrasonicSensorConnected
								? colors.success
								: colors.error,
						},
					]}
				/>
				<Text style={[styles.statusText, { color: colors.muted }]}>
					Distance
				</Text>
			</View>
		</View>
	);

	const renderAlertItem = (item: Alert) => (
		<View
			key={item.id}
			style={[
				styles.alertLogItem,
				{
					backgroundColor: colors.card,
					borderColor: colors.border,
					borderLeftColor:
						item.severity === "HIGH"
							? colors.error
							: item.severity === "MEDIUM"
								? colors.warning
								: colors.success,
					borderLeftWidth: 4,
				},
			]}
		>
			<View style={styles.alertHeader}>
				<Text style={[styles.alertType, { color: colors.text }]}>
					{item.type}
				</Text>
				<Text style={[styles.alertTime, { color: colors.muted }]}>
					{item.timestamp}
				</Text>
			</View>
			<Text style={[styles.alertMessage, { color: colors.muted }]}>
				{item.message}
			</Text>
		</View>
	);

	let body: React.ReactNode;
	if (section === "sensor") {
		body =
			sensorLogs.length > 0 ? (
				<View style={styles.logList}>{sensorLogs.map(renderSensorLogItem)}</View>
			) : (
				<View style={styles.emptyState}>
					<IconSymbol name="circle" size={32} color={colors.muted} />
					<Text style={[styles.emptyText, { color: colors.muted }]}>
						No sensor data logged yet
					</Text>
				</View>
			);
	} else if (section === "alerts") {
		body =
			alerts.length > 0 ? (
				<View style={styles.logList}>{alerts.map(renderAlertItem)}</View>
			) : (
				<View style={styles.emptyState}>
					<IconSymbol
						name="checkmark.circle.fill"
						size={32}
						color={colors.success}
					/>
					<Text style={[styles.emptyText, { color: colors.success }]}>
						No alerts recorded
					</Text>
				</View>
			);
	} else {
		body =
			feedLogs.length > 0 ? (
				feedLogs.map((log, logIndex) => (
					<View
						key={`${log.id}-${logIndex}`}
						style={[
							styles.logItem,
							{
								backgroundColor: colors.card,
								borderColor: colors.border,
							},
						]}
					>
						<View style={styles.logHeader}>
							<Text style={[styles.logTime, { color: colors.text }]}>
								{new Date(log.timestamp).toLocaleString()}
							</Text>
							<Text
								style={[
									styles.logTime,
									{
										color: log.success ? colors.success : colors.error,
									},
								]}
							>
								{log.success ? "OK" : "FAIL"}
							</Text>
						</View>
						<View style={styles.logContent}>
							<Text style={[styles.logValue, { color: colors.text }]}>
								{Math.round(log.feedMs / 1000)}s
							</Text>
							<Text style={[styles.logValue, { color: colors.muted }]}>
								Auger: {Math.round(log.augerSpeed / 10.23)}%
							</Text>
							<Text style={[styles.logValue, { color: colors.muted }]}>
								Impeller: {Math.round(log.impellerSpeed / 10.23)}%
							</Text>
						</View>
						{log.errorMessage && (
							<Text style={[styles.logValue, { color: colors.error }]}>
								{log.errorMessage}
							</Text>
						)}
					</View>
				))
			) : (
				<View style={styles.emptyState}>
					<IconSymbol name="clock.fill" size={32} color={colors.muted} />
					<Text style={[styles.emptyText, { color: colors.muted }]}>
						No feed history yet
					</Text>
				</View>
			);
	}

	return (
		<>
			<Stack.Screen
				options={{
					title: meta.title,
					headerRight:
						section === "sensor"
							? () => (
									<Pressable
										onPress={clearSensorLogs}
										hitSlop={8}
										style={{ paddingHorizontal: 12 }}
									>
										<Text
											style={{
												color: colors.error,
												fontSize: 16,
												fontWeight: "600",
											}}
										>
											Clear
										</Text>
									</Pressable>
								)
							: undefined,
				}}
			/>
			<SafeAreaView
				style={[styles.container, { backgroundColor: colors.background }]}
				edges={["bottom", "left", "right"]}
			>
				<ScrollView
					showsVerticalScrollIndicator={false}
					style={styles.scrollView}
					contentContainerStyle={styles.scrollContent}
				>
					<Text style={[styles.hint, { color: colors.muted }]}>
						{meta.description}
					</Text>
					{body}
				</ScrollView>
			</SafeAreaView>
		</>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
	},
	scrollView: {
		flex: 1,
	},
	scrollContent: {
		padding: 20,
		paddingBottom: 40,
	},
	hint: {
		fontSize: 14,
		lineHeight: 20,
		marginBottom: 16,
	},
	logList: {
		gap: 0,
	},
	logItem: {
		padding: 12,
		borderRadius: 8,
		borderWidth: 1,
		marginBottom: 8,
	},
	logHeader: {
		flexDirection: "row",
		justifyContent: "space-between",
		marginBottom: 8,
	},
	logTime: {
		fontSize: 14,
		fontWeight: "600",
	},
	logDate: {
		fontSize: 12,
	},
	logContent: {
		flexDirection: "row",
		flexWrap: "wrap",
		gap: 12,
		marginBottom: 8,
	},
	logValue: {
		fontSize: 14,
	},
	sensorStatus: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
	},
	statusDot: {
		width: 6,
		height: 6,
		borderRadius: 3,
	},
	statusText: {
		fontSize: 12,
	},
	alertLogItem: {
		padding: 12,
		borderRadius: 8,
		borderWidth: 1,
		marginBottom: 8,
	},
	alertHeader: {
		flexDirection: "row",
		justifyContent: "space-between",
		marginBottom: 4,
	},
	alertType: {
		fontSize: 14,
		fontWeight: "600",
	},
	alertTime: {
		fontSize: 12,
	},
	alertMessage: {
		fontSize: 14,
		lineHeight: 18,
	},
	emptyState: {
		alignItems: "center",
		paddingVertical: 32,
		gap: 8,
	},
	emptyText: {
		fontSize: 16,
		fontWeight: "600",
	},
});
