import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import React, { useCallback } from "react";
import {
	ActivityIndicator,
	FlatList,
	StyleSheet,
	Text,
	TouchableOpacity,
	View,
} from "react-native";
import { useESP32 } from "../hooks/useESP32Context";
import type { DiscoveredFeederBle } from "../hooks/transportTypes";
import { IconSymbol } from "./ui/IconSymbol";
import { StatCard } from "./ui/StatCard";

const ESP32Connection: React.FC = () => {
	const {
		isConnected,
		isConnecting,
		error,
		connectionAttempts,
		chipId,
		activeTransport,
		feederLinkPhase,
		disconnect,
		resetConnection,
		setChipId,
		bleDevices,
		isBleScanning,
		bleDiscoveryError,
		bleRssi,
		startBleScan,
		connectBleDevice,
		beginApWifiFallback,
		connectMqttToSoftAp,
	} = useESP32();

	const colorScheme = useColorScheme();
	const colors = Colors[colorScheme === "dark" ? "dark" : "light"];

	const currentApName = chipId ? `FloydFeeder-${chipId}` : "FloydFeeder-XXXX";

	const handleScanAgain = useCallback(() => {
		void startBleScan();
	}, [startBleScan]);

	const handleSelectFeeder = useCallback(
		(item: DiscoveredFeederBle) => {
			connectBleDevice(item.deviceId, item.chipId);
		},
		[connectBleDevice],
	);

	const handleForgetFeeder = useCallback(() => {
		setChipId(null);
	}, [setChipId]);

	const handleWifiFallback = useCallback(async () => {
		await beginApWifiFallback();
	}, [beginApWifiFallback]);

	return (
		<View style={styles.container}>
			{feederLinkPhase === "ble" && !chipId && (
				<StatCard
					title="Set Up Feeder"
					icon="antenna.radiowaves.left.and.right"
					color={colors.primary}
				>
					<View style={styles.formContainer}>
						<Text style={[styles.cloudSubtitle, { color: colors.muted }]}>
							Power on your Floyd Feeder, enable Bluetooth, then choose it from
							the list below.
						</Text>
						{(bleDiscoveryError || error) && (
							<View
								style={[
									styles.errorContainer,
									{ backgroundColor: colors.error + "20" },
								]}
							>
								<Text style={[styles.errorText, { color: colors.error }]}>
									{bleDiscoveryError || error}
								</Text>
							</View>
						)}
						{isBleScanning ? (
							<View style={styles.cloudInfoContainer}>
								<ActivityIndicator size="large" color={colors.primary} />
								<Text style={[styles.cloudTitle, { color: colors.text }]}>
									Scanning for feeders…
								</Text>
							</View>
						) : null}
						<FlatList
							data={bleDevices}
							keyExtractor={(i) => i.deviceId}
							style={styles.deviceList}
							ListEmptyComponent={
								!isBleScanning ? (
									<Text
										style={[styles.cloudSubtitle, { color: colors.muted }]}
									>
										No feeders found yet. Tap Scan to try again.
									</Text>
								) : null
							}
							renderItem={({ item }) => (
								<TouchableOpacity
									style={[
										styles.deviceRow,
										{ backgroundColor: colors.card, borderColor: colors.border },
									]}
									onPress={() => handleSelectFeeder(item)}
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
										<Text style={[styles.rssiText, { color: colors.muted }]}>
											RSSI {item.rssi} dBm
										</Text>
									</View>
									<IconSymbol
										name="chevron.right"
										size={16}
										color={colors.muted}
									/>
								</TouchableOpacity>
							)}
						/>
						<TouchableOpacity
							style={[
								styles.connectButton,
								{ backgroundColor: colors.primary },
							]}
							onPress={handleScanAgain}
							accessibilityRole="button"
							accessibilityLabel="Scan for feeders"
						>
							<IconSymbol name="arrow.clockwise" size={18} color="white" />
							<Text style={styles.connectButtonText}>
								{isBleScanning ? "Scanning…" : "Scan again"}
							</Text>
						</TouchableOpacity>
					</View>
				</StatCard>
			)}

			{feederLinkPhase === "ble" && chipId && !isConnected && (
				<StatCard
					title="Connecting via Bluetooth"
					icon="antenna.radiowaves.left.and.right"
					color={colors.warning}
				>
					<View style={styles.formContainer}>
						{(error || bleDiscoveryError) && (
							<View
								style={[
									styles.errorContainer,
									{ backgroundColor: colors.error + "20" },
								]}
							>
								<Text style={[styles.errorText, { color: colors.error }]}>
									{error || bleDiscoveryError}
								</Text>
								{connectionAttempts > 0 && (
									<Text
										style={[styles.errorSubtext, { color: colors.error }]}
									>
										Attempt {connectionAttempts}
									</Text>
								)}
							</View>
						)}
						<ActivityIndicator size="large" color={colors.primary} />
						<Text style={[styles.cloudTitle, { color: colors.text }]}>
							{isConnecting
								? `Connecting to ${currentApName}…`
								: `Looking for ${currentApName}…`}
						</Text>
						<Text style={[styles.cloudSubtitle, { color: colors.muted }]}>
							Keep the feeder powered and nearby. You can also use direct Wi‑Fi
							below if Bluetooth keeps failing.
						</Text>
						<TouchableOpacity
							style={[
								styles.connectButton,
								{ backgroundColor: colors.primary },
							]}
							onPress={handleScanAgain}
						>
							<Text style={styles.connectButtonText}>Scan again</Text>
						</TouchableOpacity>
					</View>
				</StatCard>
			)}

			{(feederLinkPhase === "wifi_instructions" ||
				feederLinkPhase === "wifi_mqtt") &&
				!isConnected && (
					<StatCard
						title="Connect via Direct Wi‑Fi"
						icon="antenna.radiowaves.left.and.right"
						color={colors.warning}
					>
						<View style={styles.formContainer}>
							<View style={styles.cloudInfoContainer}>
								<Text style={[styles.cloudSubtitle, { color: colors.muted }]}>
									On your phone, open Settings → Wi‑Fi and join:
								</Text>
								<View
									style={[
										styles.apNameBadge,
										{ backgroundColor: colors.primary + "20" },
									]}
								>
									<Text style={[styles.apNameText, { color: colors.text }]}>
										{currentApName}
									</Text>
								</View>
								<Text style={[styles.cloudSubtitle, { color: colors.muted }]}>
									Return here and tap Connect. MQTT will use
									192.168.4.1:1883.
								</Text>
							</View>
							{error ? (
								<Text style={[styles.errorText, { color: colors.error }]}>
									{error}
								</Text>
							) : null}
							<TouchableOpacity
								style={[
									styles.connectButton,
									{ backgroundColor: colors.primary },
								]}
								onPress={connectMqttToSoftAp}
								disabled={isConnecting}
							>
								{isConnecting ? (
									<>
										<ActivityIndicator size="small" color="white" />
										<Text style={styles.connectButtonText}>Connecting…</Text>
									</>
								) : (
									<Text style={styles.connectButtonText}>Connect</Text>
								)}
							</TouchableOpacity>
							<TouchableOpacity
								style={[
									styles.connectButton,
									{ backgroundColor: colors.muted },
								]}
								onPress={disconnect}
							>
								<Text style={styles.connectButtonText}>Back to Bluetooth</Text>
							</TouchableOpacity>
						</View>
					</StatCard>
				)}

			{isConnected && (
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
								Online{chipId ? ` · ${chipId}` : ""}
							</Text>
						</View>
						<Text style={[styles.serverUrl, { color: colors.muted }]}>
							{activeTransport === "mqtt"
								? "Connected via direct Wi‑Fi (MQTT)"
								: `Connected via Bluetooth${
										bleRssi != null ? ` · RSSI ${bleRssi} dBm` : ""
									}`}
						</Text>

						{activeTransport === "ble" && (
							<TouchableOpacity onPress={() => void handleWifiFallback()}>
								<Text style={[styles.linkText, { color: colors.primary }]}>
									Connect via Wi‑Fi instead
								</Text>
							</TouchableOpacity>
						)}

						<View style={styles.actionsContainer}>
							<TouchableOpacity
								style={[styles.actionButton, { backgroundColor: colors.error }]}
								onPress={disconnect}
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
								onPress={resetConnection}
								accessibilityRole="button"
								accessibilityLabel="Reconnect"
							>
								<IconSymbol name="arrow.clockwise" size={16} color="white" />
								<Text style={styles.actionButtonText}>Reconnect</Text>
							</TouchableOpacity>
						</View>

						<TouchableOpacity
							style={[styles.reconfigureButton, { borderColor: colors.muted }]}
							onPress={handleForgetFeeder}
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
			)}
		</View>
	);
};

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
	errorSubtext: {
		fontSize: 12,
		marginTop: 4,
	},
	formContainer: {
		gap: 16,
	},
	cloudInfoContainer: {
		alignItems: "center",
		paddingVertical: 16,
		gap: 8,
	},
	cloudTitle: {
		fontSize: 18,
		fontWeight: "700",
	},
	cloudSubtitle: {
		fontSize: 14,
		textAlign: "center",
	},
	apNameBadge: {
		paddingVertical: 10,
		paddingHorizontal: 20,
		borderRadius: 8,
	},
	apNameText: {
		fontSize: 16,
		fontWeight: "700",
		fontFamily: "monospace",
	},
	serverUrl: {
		fontSize: 12,
		fontFamily: "monospace",
		marginTop: 4,
		textAlign: "center",
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
		maxHeight: 220,
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
	rssiText: {
		fontSize: 12,
		marginTop: 2,
	},
	linkText: {
		fontSize: 14,
		fontWeight: "600",
		marginTop: 4,
	},
});

export default ESP32Connection;
