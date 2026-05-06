import { Colors } from "@/constants/Colors";
import { rssiToBars } from "@/hooks/bleConstants";
import { useColorScheme } from "@/hooks/useColorScheme";
import React, { useCallback, useEffect } from "react";
import {
	ActivityIndicator,
	Alert,
	LayoutAnimation,
	Platform,
	StyleSheet,
	Text,
	TouchableOpacity,
	UIManager,
	View,
} from "react-native";
import type { DiscoveredFeederBle } from "../hooks/transportTypes";
import { useESP32 } from "../hooks/useESP32Context";
import { IconSymbol } from "./ui/IconSymbol";
import { StatCard } from "./ui/StatCard";

if (
	Platform.OS === "android" &&
	UIManager.setLayoutAnimationEnabledExperimental
) {
	UIManager.setLayoutAnimationEnabledExperimental(true);
}

// ── signal bars component ──────────────────────────────────────────────────

function SignalBars({
	bars,
	color,
	muted,
}: {
	bars: number;
	color: string;
	muted: string;
}) {
	return (
		<View style={signalStyles.container}>
			{[1, 2, 3, 4].map((level) => (
				<View
					key={level}
					style={[
						signalStyles.bar,
						{
							height: level * 4 + 4,
							backgroundColor: level <= bars ? color : muted,
						},
					]}
				/>
			))}
		</View>
	);
}

const signalStyles = StyleSheet.create({
	container: {
		flexDirection: "row",
		alignItems: "flex-end",
		gap: 2,
	},
	bar: {
		width: 3,
		borderRadius: 1.5,
	},
});

// ── connection elapsed helper ──────────────────────────────────────────────

function getElapsedMessage(elapsedMs: number): string | null {
	if (elapsedMs < 8000) return null;
	if (elapsedMs < 20000)
		return "Still searching… Make sure it's powered on and nearby.";
	return null; // >20s handled by timeout → error transition
}

// ── main component ─────────────────────────────────────────────────────────

const ESP32Connection: React.FC = () => {
	const {
		chipId,
		connectionState,
		connectionError,
		connectionElapsedMs,
		bleDevices,
		bleDiscoveryError,
		bleRssi,
		startConnection,
		connectToDevice,
		retryConnection,
		forgetFeeder,
		disconnectBle,
	} = useESP32();

	const colorScheme = useColorScheme();
	const colors = Colors[colorScheme === "dark" ? "dark" : "light"];

	const currentFeederName = chipId ? `FloydFeeder-${chipId}` : "FloydFeeder";

	// Animate on state changes
	useEffect(() => {
		LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
	}, [connectionState]);

	// ── forget confirmation ───────────────────────────────────────────
	const handleForget = useCallback(() => {
		Alert.alert(
			"Forget Feeder",
			"Are you sure? You'll need to pair again next time.",
			[
				{ text: "Cancel", style: "cancel" },
				{
					text: "Forget",
					style: "destructive",
					onPress: () => forgetFeeder(),
				},
			],
		);
	}, [forgetFeeder]);

	// ── device list item ──────────────────────────────────────────────
	const renderDeviceRow = useCallback(
		(item: DiscoveredFeederBle) => {
			const bars = rssiToBars(item.rssi);
			return (
				<TouchableOpacity
					key={item.deviceId}
					style={[
						styles.deviceRow,
						{ backgroundColor: colors.card, borderColor: colors.border },
					]}
					onPress={() => connectToDevice(item.deviceId, item.chipId)}
					accessibilityRole="button"
					accessibilityLabel={`Connect to ${item.deviceName}`}
				>
					<IconSymbol
						name="antenna.radiowaves.left.and.right"
						size={20}
						color={colors.primary}
					/>
					<View style={styles.deviceRowText}>
						<Text style={[styles.deviceName, { color: colors.text }]}>
							{item.deviceName}
						</Text>
						<View style={styles.signalRow}>
							<SignalBars
								bars={bars}
								color={colors.primary}
								muted={colors.muted}
							/>
							<Text style={[styles.distanceText, { color: colors.muted }]}>
								~{item.estimatedDistanceM}m away
							</Text>
						</View>
					</View>
					<IconSymbol name="chevron.right" size={16} color={colors.muted} />
				</TouchableOpacity>
			);
		},
		[colors, connectToDevice],
	);

	// ── other feeders (when looking for stored chipId) ─────────────────
	const otherFeeders = chipId
		? bleDevices.filter((d) => d.chipId.toUpperCase() !== chipId.toUpperCase())
		: [];

	// ── render by state ───────────────────────────────────────────────

	switch (connectionState) {
		// ── IDLE ───────────────────────────────────────────────────────
		case "idle":
			return (
				<StatCard
					title="Welcome to Floyd"
					icon="fish.fill"
					color={colors.primary}
				>
					<View style={styles.formContainer}>
						<Text style={[styles.cloudSubtitle, { color: colors.muted }]}>
							Power on your Floyd Feeder and make sure Bluetooth is enabled on
							your phone.
						</Text>
						<View
							style={[
								styles.calloutBox,
								{ backgroundColor: colors.primary + "15" },
							]}
						>
							<IconSymbol name="info.circle" size={16} color={colors.primary} />
							<Text style={[styles.calloutText, { color: colors.text }]}>
								Floyd uses Bluetooth Low Energy to communicate. Your phone will
								ask for Bluetooth permission when you tap below.
							</Text>
						</View>
						<TouchableOpacity
							style={[
								styles.connectButton,
								{ backgroundColor: colors.primary },
							]}
							onPress={startConnection}
							accessibilityRole="button"
							accessibilityLabel="Find my feeder"
						>
							<IconSymbol
								name="antenna.radiowaves.left.and.right"
								size={18}
								color="white"
							/>
							<Text style={styles.connectButtonText}>Find My Feeder</Text>
						</TouchableOpacity>
					</View>
				</StatCard>
			);

		// ── SCANNING ───────────────────────────────────────────────────
		case "scanning": {
			const hasChipId = !!chipId;
			const elapsedMsg = getElapsedMessage(connectionElapsedMs);

			return (
				<StatCard
					title={hasChipId ? "Looking for Your Feeder" : "Find Your Feeder"}
					icon="antenna.radiowaves.left.and.right"
					color={colors.warning}
				>
					<View style={styles.formContainer}>
						{bleDiscoveryError && (
							<View
								style={[
									styles.errorContainer,
									{ backgroundColor: colors.error + "20" },
								]}
							>
								<Text style={[styles.errorText, { color: colors.error }]}>
									{bleDiscoveryError}
								</Text>
							</View>
						)}

						<ActivityIndicator size="large" color={colors.primary} />

						{hasChipId && (
							<Text style={[styles.cloudTitle, { color: colors.text }]}>
								Searching for {currentFeederName}…
							</Text>
						)}

						{elapsedMsg && (
							<Text style={[styles.cloudSubtitle, { color: colors.warning }]}>
								{elapsedMsg}
							</Text>
						)}

						{/* Device list */}
						{bleDevices.length > 0 && (
							<View style={styles.deviceList}>
								{bleDevices.map(renderDeviceRow)}
							</View>
						)}

						{/* Other feeders when stored chipId not found */}
						{hasChipId &&
							bleDevices.length === 0 &&
							otherFeeders.length === 0 &&
							connectionElapsedMs > 3000 && (
								<Text style={[styles.cloudSubtitle, { color: colors.muted }]}>
									Your feeder isn't nearby. Is it powered on?
								</Text>
							)}

						{hasChipId && otherFeeders.length > 0 && (
							<View style={styles.otherFeedersSection}>
								<Text
									style={[styles.otherFeedersTitle, { color: colors.muted }]}
								>
									Your feeder isn't nearby, but we found:
								</Text>
								{otherFeeders.map(renderDeviceRow)}
							</View>
						)}

						<TouchableOpacity
							style={[styles.connectButton, { backgroundColor: colors.muted }]}
							onPress={disconnectBle}
						>
							<IconSymbol name="xmark" size={16} color="white" />
							<Text style={styles.connectButtonText}>Cancel</Text>
						</TouchableOpacity>
					</View>
				</StatCard>
			);
		}

		// ── CONNECTING ─────────────────────────────────────────────────
		case "connecting":
			return (
				<StatCard
					title="Connecting…"
					icon="bolt.horizontal"
					color={colors.warning}
				>
					<View style={styles.formContainer}>
						{connectionError && (
							<View
								style={[
									styles.errorContainer,
									{ backgroundColor: colors.error + "20" },
								]}
							>
								<Text style={[styles.errorText, { color: colors.error }]}>
									{connectionError.message}
								</Text>
							</View>
						)}

						<ActivityIndicator size="large" color={colors.primary} />

						<View
							style={[
								styles.apNameBadge,
								{ backgroundColor: colors.primary + "20" },
							]}
						>
							<Text style={[styles.apNameText, { color: colors.text }]}>
								{currentFeederName}
							</Text>
						</View>

						<Text style={[styles.cloudSubtitle, { color: colors.muted }]}>
							{connectionElapsedMs < 8000
								? "Establishing connection…"
								: connectionElapsedMs < 20000
									? "Still trying… Make sure it's powered on and nearby."
									: "Taking longer than expected. The feeder may be out of range."}
						</Text>

						<TouchableOpacity
							style={[styles.connectButton, { backgroundColor: colors.muted }]}
							onPress={disconnectBle}
						>
							<Text style={styles.connectButtonText}>Cancel</Text>
						</TouchableOpacity>
					</View>
				</StatCard>
			);

		// ── CONNECTED ──────────────────────────────────────────────────
		case "connected":
			return (
				<StatCard
					title="Connected"
					icon="checkmark.circle.fill"
					color={colors.success}
				>
					<View style={styles.connectedContainer}>
						<View style={styles.statusRow}>
							<View
								style={[
									styles.statusIndicator,
									{ backgroundColor: colors.success },
								]}
							/>
							<Text style={[styles.statusText, { color: colors.text }]}>
								{chipId ?? "Unknown"}
							</Text>
						</View>

						{bleRssi != null && (
							<View style={styles.signalInfo}>
								<SignalBars
									bars={rssiToBars(bleRssi)}
									color={colors.primary}
									muted={colors.muted}
								/>
								<Text style={[styles.signalText, { color: colors.muted }]}>
									BLE {bleRssi} dBm
								</Text>
							</View>
						)}

						<View style={styles.actionsContainer}>
							<TouchableOpacity
								style={[styles.actionButton, { backgroundColor: colors.error }]}
								onPress={disconnectBle}
								accessibilityRole="button"
								accessibilityLabel="Disconnect"
							>
								<IconSymbol name="xmark" size={16} color="white" />
								<Text style={styles.actionButtonText}>Disconnect</Text>
							</TouchableOpacity>

							<TouchableOpacity
								style={[
									styles.actionButton,
									{ backgroundColor: colors.warning },
								]}
								onPress={retryConnection}
								accessibilityRole="button"
								accessibilityLabel="Reconnect"
							>
								<IconSymbol name="arrow.clockwise" size={16} color="white" />
								<Text style={styles.actionButtonText}>Reconnect</Text>
							</TouchableOpacity>
						</View>

						<TouchableOpacity
							style={[styles.reconfigureButton, { borderColor: colors.muted }]}
							onPress={handleForget}
							accessibilityRole="button"
							accessibilityLabel="Forget this feeder"
						>
							<IconSymbol name="trash" size={14} color={colors.muted} />
							<Text style={[styles.reconfigureText, { color: colors.muted }]}>
								Forget feeder
							</Text>
						</TouchableOpacity>
					</View>
				</StatCard>
			);

		// ── ERROR ──────────────────────────────────────────────────────
		case "error": {
			const err = connectionError;
			const isConnectionLost = err?.kind === "connection_lost";

			return (
				<StatCard
					title={isConnectionLost ? "Connection Lost" : "Connection Error"}
					icon={
						isConnectionLost ? "wifi.slash" : "exclamationmark.triangle.fill"
					}
					color={colors.error}
				>
					<View style={styles.formContainer}>
						{err && (
							<View
								style={[
									styles.errorContainer,
									{ backgroundColor: colors.error + "15" },
								]}
							>
								<Text style={[styles.errorText, { color: colors.error }]}>
									{err.message}
								</Text>
							</View>
						)}

						{err?.kind === "no_devices" && (
							<View style={styles.troubleshootingList}>
								<Text
									style={[styles.troubleshootingTitle, { color: colors.text }]}
								>
									Troubleshooting:
								</Text>
								<Text
									style={[styles.troubleshootingItem, { color: colors.muted }]}
								>
									• Make sure the feeder is plugged in and powered on
								</Text>
								<Text
									style={[styles.troubleshootingItem, { color: colors.muted }]}
								>
									• Check that Bluetooth is turned on in your phone settings
								</Text>
								<Text
									style={[styles.troubleshootingItem, { color: colors.muted }]}
								>
									• Bring your phone closer to the feeder (within 5 meters)
								</Text>
								<Text
									style={[styles.troubleshootingItem, { color: colors.muted }]}
								>
									• Try restarting the feeder and your phone's Bluetooth
								</Text>
							</View>
						)}

						<TouchableOpacity
							style={[
								styles.connectButton,
								{ backgroundColor: colors.primary },
							]}
							onPress={retryConnection}
							accessibilityRole="button"
							accessibilityLabel="Try again"
						>
							<IconSymbol name="arrow.clockwise" size={18} color="white" />
							<Text style={styles.connectButtonText}>Try Again</Text>
						</TouchableOpacity>

						<TouchableOpacity
							style={[styles.connectButton, { backgroundColor: colors.muted }]}
							onPress={handleForget}
							accessibilityRole="button"
							accessibilityLabel="Forget this feeder"
						>
							<IconSymbol name="trash" size={16} color="white" />
							<Text style={styles.connectButtonText}>Forget This Feeder</Text>
						</TouchableOpacity>
					</View>
				</StatCard>
			);
		}

		default:
			return null;
	}
};

// ── styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
	container: {
		gap: 16,
	},
	errorContainer: {
		padding: 12,
		borderRadius: 8,
	},
	errorText: {
		fontSize: 14,
		fontWeight: "500",
	},
	formContainer: {
		gap: 16,
	},
	cloudTitle: {
		fontSize: 18,
		fontWeight: "700",
		textAlign: "center",
	},
	cloudSubtitle: {
		fontSize: 14,
		textAlign: "center",
	},
	apNameBadge: {
		paddingVertical: 10,
		paddingHorizontal: 20,
		borderRadius: 8,
		alignSelf: "center",
	},
	apNameText: {
		fontSize: 16,
		fontWeight: "700",
		fontFamily: "monospace",
	},
	connectButton: {
		flexDirection: "row",
		paddingVertical: 14,
		paddingHorizontal: 24,
		borderRadius: 12,
		alignItems: "center",
		justifyContent: "center",
		gap: 8,
	},
	connectButtonText: {
		color: "white",
		fontSize: 16,
		fontWeight: "600",
	},
	connectedContainer: {
		gap: 12,
		alignItems: "center",
	},
	statusRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
	},
	statusIndicator: {
		width: 10,
		height: 10,
		borderRadius: 5,
	},
	statusText: {
		fontSize: 16,
		fontWeight: "600",
	},
	signalInfo: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
	},
	signalText: {
		fontSize: 12,
	},
	signalRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		marginTop: 4,
	},
	distanceText: {
		fontSize: 12,
	},
	actionsContainer: {
		flexDirection: "row",
		gap: 12,
		marginTop: 8,
		width: "100%",
	},
	actionButton: {
		flex: 1,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		paddingVertical: 12,
		paddingHorizontal: 16,
		borderRadius: 8,
		gap: 6,
	},
	actionButtonText: {
		color: "white",
		fontSize: 14,
		fontWeight: "600",
	},
	reconfigureButton: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 6,
		paddingVertical: 8,
		paddingHorizontal: 16,
		borderRadius: 8,
		borderWidth: 1,
		marginTop: 4,
	},
	reconfigureText: {
		fontSize: 12,
		fontWeight: "500",
	},
	deviceList: {
		width: "100%",
	},
	deviceRow: {
		flexDirection: "row",
		alignItems: "center",
		padding: 12,
		borderRadius: 10,
		borderWidth: 1,
		marginBottom: 8,
		gap: 12,
	},
	deviceRowText: {
		flex: 1,
	},
	deviceName: {
		fontSize: 16,
		fontWeight: "600",
	},
	calloutBox: {
		flexDirection: "row",
		alignItems: "flex-start",
		gap: 10,
		padding: 14,
		borderRadius: 10,
	},
	calloutText: {
		flex: 1,
		fontSize: 13,
		lineHeight: 19,
	},
	otherFeedersSection: {
		gap: 8,
	},
	otherFeedersTitle: {
		fontSize: 13,
		fontWeight: "500",
		textAlign: "center",
		marginBottom: 4,
	},
	troubleshootingList: {
		gap: 6,
	},
	troubleshootingTitle: {
		fontSize: 14,
		fontWeight: "600",
		marginBottom: 2,
	},
	troubleshootingItem: {
		fontSize: 13,
		lineHeight: 20,
	},
});

export default ESP32Connection;
