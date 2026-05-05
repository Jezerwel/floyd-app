import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { router } from "expo-router";
import React, { useCallback } from "react";
import {
	ActivityIndicator,
	StyleSheet,
	Text,
	TouchableOpacity,
	View,
} from "react-native";
import { useESP32 } from "../hooks/useESP32Context";
import { IconSymbol } from "./ui/IconSymbol";
import { StatCard } from "./ui/StatCard";

const ESP32Connection: React.FC = () => {
	const {
		isConnected,
		isConnecting,
		error,
		connectionAttempts,
		chipId,
		connectionMode,
		setConnectionMode,
		connect,
		disconnect,
		resetConnection,
		publishCommand,
		setChipId,
	} = useESP32();

	const colorScheme = useColorScheme();
	const colors = Colors[colorScheme === "dark" ? "dark" : "light"];

	const handleConnect = () => {
		connect();
	};

	const handleDisconnect = () => {
		disconnect();
	};

	const handleProvision = () => {
		router.push("/provision");
	};

	const handleReconfigure = useCallback(() => {
		publishCommand("restart_provisioning");
		setChipId(null);
		router.push("/provision");
	}, [publishCommand, setChipId]);

	const currentApName = chipId ? `FloydFeeder-${chipId}` : "FloydFeeder-XXXX";

	return (
		<View style={styles.container}>
			{/* Connection mode toggle — always visible */}
			<View style={[styles.modeToggle, { backgroundColor: colors.card }]}>
				<TouchableOpacity
					style={[
						styles.modeOption,
						connectionMode === "auto" && {
							backgroundColor: colors.primary,
						},
					]}
					onPress={() => setConnectionMode("auto")}
				>
					<IconSymbol
						name="wifi"
						size={14}
						color={connectionMode === "auto" ? "white" : colors.muted}
					/>
					<Text
						style={[
							styles.modeOptionText,
							{
								color: connectionMode === "auto" ? "white" : colors.muted,
							},
						]}
					>
						Home WiFi
					</Text>
				</TouchableOpacity>
				<TouchableOpacity
					style={[
						styles.modeOption,
						connectionMode === "direct-ap" && {
							backgroundColor: colors.primary,
						},
					]}
					onPress={() => setConnectionMode("direct-ap")}
				>
					<IconSymbol
						name="antenna.radiowaves.left.and.right"
						size={14}
						color={connectionMode === "direct-ap" ? "white" : colors.muted}
					/>
					<Text
						style={[
							styles.modeOptionText,
							{
								color: connectionMode === "direct-ap" ? "white" : colors.muted,
							},
						]}
					>
						Direct AP
					</Text>
				</TouchableOpacity>
			</View>

			{!chipId && (
				<StatCard
					title="Feeder Connection"
					icon="antenna.radiowaves.left.and.right"
					color={colors.primary}
				>
					<View style={styles.formContainer}>
						<View style={styles.cloudInfoContainer}>
							<View
								style={[
									styles.cloudIconContainer,
									{ backgroundColor: colors.primary + "15" },
								]}
							>
								<IconSymbol
									name="antenna.radiowaves.left.and.right"
									size={32}
									color={colors.primary}
								/>
							</View>
							<Text style={[styles.cloudTitle, { color: colors.text }]}>
								No Feeder Configured
							</Text>
							<Text style={[styles.cloudSubtitle, { color: colors.muted }]}>
								Set up a Floyd Feeder to get started.
							</Text>
						</View>

						<TouchableOpacity
							style={[
								styles.connectButton,
								{ backgroundColor: colors.success },
							]}
							onPress={handleProvision}
							accessibilityRole="button"
							accessibilityLabel="Open feeder provisioning"
						>
							<IconSymbol name="link" size={18} color="white" />
							<Text style={styles.connectButtonText}>Set Up Feeder</Text>
						</TouchableOpacity>
					</View>
				</StatCard>
			)}

			{chipId && !isConnected && (
				<StatCard
					title={
						connectionMode === "direct-ap"
							? "Connect via Direct AP"
							: "Searching..."
					}
					icon={
						connectionMode === "direct-ap"
							? "antenna.radiowaves.left.and.right"
							: "magnifyingglass"
					}
					color={colors.warning}
				>
					<View style={styles.formContainer}>
						{connectionMode === "direct-ap" ? (
							<>
								{/* Direct AP instructions */}
								<View style={styles.cloudInfoContainer}>
									<View
										style={[
											styles.cloudIconContainer,
											{ backgroundColor: colors.warning + "15" },
										]}
									>
										<IconSymbol
											name="antenna.radiowaves.left.and.right"
											size={32}
											color={colors.warning}
										/>
									</View>
									<Text style={[styles.cloudTitle, { color: colors.text }]}>
										Connect to Feeder WiFi
									</Text>
									<Text style={[styles.cloudSubtitle, { color: colors.muted }]}>
										Go to your phone&apos;s WiFi settings and connect to:
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
										Then come back and tap Connect below.
									</Text>
								</View>

								<TouchableOpacity
									style={[
										styles.connectButton,
										{
											backgroundColor: colors.primary,
										},
									]}
									onPress={handleConnect}
									disabled={isConnecting}
									accessibilityRole="button"
									accessibilityLabel="Connect to direct AP"
								>
									{isConnecting ? (
										<>
											<ActivityIndicator size="small" color="white" />
											<Text style={styles.connectButtonText}>
												Connecting...
											</Text>
										</>
									) : (
										<>
											<IconSymbol
												name="antenna.radiowaves.left.and.right"
												size={18}
												color="white"
											/>
											<Text style={styles.connectButtonText}>Connect</Text>
										</>
									)}
								</TouchableOpacity>
							</>
						) : (
							<>
								{/* Auto mode — existing MQTT/mDNS flow */}
								{error && (
									<View
										style={[
											styles.errorContainer,
											{ backgroundColor: colors.error + "20" },
										]}
									>
										<Text style={[styles.errorText, { color: colors.error }]}>
											{error}
										</Text>
										{connectionAttempts > 0 && (
											<Text
												style={[styles.errorSubtext, { color: colors.error }]}
											>
												Attempt {connectionAttempts}
											</Text>
										)}
										<View style={styles.troubleshootingContainer}>
											<Text
												style={[
													styles.troubleshootingTitle,
													{ color: colors.warning },
												]}
											>
												Troubleshooting Tips:
											</Text>
											<Text
												style={[
													styles.troubleshootingText,
													{ color: colors.muted },
												]}
											>
												• Make sure the feeder is plugged in{"\n"}• Confirm it
												is on the same WiFi network{"\n"}• Or switch to
												&quot;Direct AP&quot; mode above
											</Text>
										</View>
									</View>
								)}

								<View style={styles.cloudInfoContainer}>
									{isConnecting ? (
										<>
											<ActivityIndicator size="large" color={colors.primary} />
											<Text style={[styles.cloudTitle, { color: colors.text }]}>
												Looking for Floyd Feeder...
											</Text>
											<Text
												style={[styles.cloudSubtitle, { color: colors.muted }]}
											>
												Make sure it&apos;s plugged in and on the same network
											</Text>
										</>
									) : (
										<>
											<View
												style={[
													styles.cloudIconContainer,
													{ backgroundColor: colors.warning + "15" },
												]}
											>
												<IconSymbol
													name="wifi.slash"
													size={32}
													color={colors.warning}
												/>
											</View>
											<Text style={[styles.cloudTitle, { color: colors.text }]}>
												Feeder Not Found
											</Text>
											<Text
												style={[styles.cloudSubtitle, { color: colors.muted }]}
											>
												Device {chipId}
											</Text>
											<Text
												style={[styles.cloudSubtitle, { color: colors.muted }]}
											>
												Could not discover the feeder on this network.
											</Text>
										</>
									)}
								</View>

								<TouchableOpacity
									style={[
										styles.connectButton,
										{
											backgroundColor: colors.primary,
										},
									]}
									onPress={handleConnect}
									disabled={isConnecting}
									accessibilityRole="button"
									accessibilityLabel="Scan for feeder"
								>
									{isConnecting ? (
										<>
											<ActivityIndicator size="small" color="white" />
											<Text style={styles.connectButtonText}>Scanning...</Text>
										</>
									) : (
										<>
											<IconSymbol
												name="arrow.clockwise"
												size={18}
												color="white"
											/>
											<Text style={styles.connectButtonText}>Scan Again</Text>
										</>
									)}
								</TouchableOpacity>
							</>
						)}

						<TouchableOpacity
							style={[
								styles.connectButton,
								{ backgroundColor: colors.warning },
							]}
							onPress={handleReconfigure}
							accessibilityRole="button"
							accessibilityLabel="Reconfigure feeder"
						>
							<IconSymbol name="gear" size={18} color="white" />
							<Text style={styles.connectButtonText}>Reconfigure</Text>
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
							{connectionMode === "direct-ap"
								? "Connected via Direct AP (192.168.4.1)"
								: "Connected via local WiFi"}
						</Text>

						<View style={styles.actionsContainer}>
							<TouchableOpacity
								style={[styles.actionButton, { backgroundColor: colors.error }]}
								onPress={handleDisconnect}
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
							onPress={handleReconfigure}
							accessibilityRole="button"
							accessibilityLabel="Reconfigure feeder WiFi"
						>
							<IconSymbol name="gear" size={14} color={colors.muted} />
							<Text style={[styles.reconfigureText, { color: colors.muted }]}>
								Reconfigure Device
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
	modeToggle: {
		flexDirection: "row",
		borderRadius: 10,
		padding: 3,
		gap: 3,
	},
	modeOption: {
		flex: 1,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		paddingVertical: 10,
		paddingHorizontal: 12,
		borderRadius: 8,
		gap: 6,
	},
	modeOptionText: {
		fontSize: 13,
		fontWeight: "600",
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
	cloudIconContainer: {
		width: 64,
		height: 64,
		borderRadius: 32,
		alignItems: "center",
		justifyContent: "center",
		marginBottom: 8,
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
	troubleshootingContainer: {
		marginTop: 12,
		paddingTop: 12,
		borderTopWidth: 1,
		borderTopColor: "#ffffff20",
	},
	troubleshootingTitle: {
		fontSize: 13,
		fontWeight: "600",
		marginBottom: 6,
	},
	troubleshootingText: {
		fontSize: 12,
		lineHeight: 18,
	},
});

export default ESP32Connection;
