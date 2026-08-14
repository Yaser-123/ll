/**
 * Home Dashboard — first screen the user sees.
 *
 * Shows: device identity, network status, peer list, active SOS count.
 * All data is real and persisted; peer list is empty until BLE/Wi-Fi module connects.
 */

import React from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import { Colors, Typography, Spacing, Radius, Shadow } from '../src/theme';
import { useDeviceStore } from '../src/store/useDeviceStore';
import { usePeerStore } from '../src/store/usePeerStore';
import { useSosStore } from '../src/store/useSosStore';
import { useMessageStore } from '../src/store/useMessageStore';
import { NetworkStatusBar } from '../src/components/NetworkStatusBar';
import { PeerCard } from '../src/components/PeerCard';

export default function HomeScreen() {
  const { deviceId, displayName, networkStatus } = useDeviceStore();
  const { getPeerList } = usePeerStore();
  const { getActiveEvents } = useSosStore();
  const { messages } = useMessageStore();

  const peers = getPeerList();
  const activeAlerts = getActiveEvents();
  const recentMessages = messages.slice(0, 3);

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <NetworkStatusBar status={networkStatus} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={false} tintColor={Colors.primary} />
        }
      >
        {/* Identity card */}
        <View style={styles.identityCard}>
          <View style={styles.identityRow}>
            <Text style={styles.callsign}>{displayName}</Text>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>YOU</Text>
            </View>
          </View>
          <Text style={styles.deviceId} numberOfLines={1}>
            ID: {deviceId.slice(0, 8).toUpperCase()}…
          </Text>
        </View>

        {/* Active SOS alert */}
        {activeAlerts.length > 0 && (
          <TouchableOpacity
            style={styles.alertBanner}
            onPress={() => router.push('/sos')}
            accessibilityRole="button"
          >
            <Text style={styles.alertIcon}>🆘</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.alertTitle}>
                {activeAlerts.length} ACTIVE ALERT{activeAlerts.length !== 1 ? 'S' : ''}
              </Text>
              <Text style={styles.alertSub}>Tap to view SOS events</Text>
            </View>
            <Text style={styles.alertArrow}>›</Text>
          </TouchableOpacity>
        )}

        {/* Stats row */}
        <View style={styles.statsRow}>
          <StatCard
            value={peers.length}
            label="Peers Known"
            onPress={() => {}}
          />
          <StatCard
            value={networkStatus.totalConnectedPeers}
            label="Reachable"
            highlight
          />
          <StatCard
            value={activeAlerts.length}
            label="Active SOS"
            danger={activeAlerts.length > 0}
            onPress={() => router.push('/sos')}
          />
        </View>

        {/* Network transports */}
        <SectionHeader title="TRANSPORTS" />
        {networkStatus.activeTransports.length === 0 ? (
          <EmptyState text="No transports registered" />
        ) : (
          networkStatus.activeTransports.map((t) => (
            <View key={t.label} style={styles.transportRow}>
              <Text style={styles.transportLabel}>{t.label}</Text>
              <Text
                style={[
                  styles.transportState,
                  t.state === 'scanning' && { color: Colors.warning },
                  t.state === 'connected' && { color: Colors.online },
                  t.state === 'error' && { color: Colors.danger },
                ]}
              >
                {t.state.toUpperCase()}
              </Text>
            </View>
          ))
        )}

        {/* Peer list */}
        <SectionHeader title="PEERS" />
        {peers.length === 0 ? (
          <EmptyState text="No peers discovered yet — waiting for Bluetooth / Wi-Fi module" />
        ) : (
          peers.map((p) => <PeerCard key={p.id} peer={p} />)
        )}

        {/* Recent messages */}
        <SectionHeader title="RECENT MESSAGES" action="VIEW ALL" onAction={() => router.push('/chat')} />
        {recentMessages.length === 0 ? (
          <EmptyState text="No messages yet" />
        ) : (
          recentMessages.map((m) => (
            <View key={m.id} style={styles.msgPreview}>
              <Text style={styles.msgText} numberOfLines={1}>{m.text}</Text>
              <Text style={styles.msgTime}>
                {new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </Text>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function StatCard({
  value,
  label,
  highlight = false,
  danger = false,
  onPress,
}: {
  value: number;
  label: string;
  highlight?: boolean;
  danger?: boolean;
  onPress?: () => void;
}) {
  return (
    <TouchableOpacity
      style={[
        styles.statCard,
        highlight && styles.statCardHighlight,
        danger && value > 0 && styles.statCardDanger,
      ]}
      onPress={onPress}
      disabled={!onPress}
    >
      <Text style={[styles.statValue, danger && value > 0 && { color: Colors.danger }]}>
        {value}
      </Text>
      <Text style={styles.statLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

function SectionHeader({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {action && (
        <TouchableOpacity onPress={onAction}>
          <Text style={styles.sectionAction}>{action}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <View style={styles.emptyState}>
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  scroll: { flex: 1 },
  content: { padding: Spacing.lg, paddingBottom: Spacing.xxxl },

  identityCard: {
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.primary,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
    ...Shadow.primary,
  },
  identityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginBottom: Spacing.xs,
  },
  callsign: {
    fontSize: Typography.size.xxl,
    fontWeight: Typography.weight.bold,
    color: Colors.primary,
    letterSpacing: 1,
  },
  badge: {
    backgroundColor: Colors.primaryMuted,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
  },
  badgeText: {
    fontSize: Typography.size.xs,
    fontWeight: Typography.weight.bold,
    color: Colors.primary,
    letterSpacing: 1,
  },
  deviceId: {
    fontSize: Typography.size.xs,
    color: Colors.textTertiary,
    fontFamily: undefined, // system mono
    letterSpacing: 0.5,
  },

  alertBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.dangerMuted,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.danger,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
    gap: Spacing.md,
    ...Shadow.danger,
  },
  alertIcon: { fontSize: 28 },
  alertTitle: {
    fontSize: Typography.size.md,
    fontWeight: Typography.weight.bold,
    color: Colors.danger,
    letterSpacing: 1,
  },
  alertSub: {
    fontSize: Typography.size.xs,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  alertArrow: {
    fontSize: 24,
    color: Colors.danger,
  },

  statsRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  statCard: {
    flex: 1,
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    padding: Spacing.md,
    alignItems: 'center',
  },
  statCardHighlight: {
    borderColor: Colors.primary,
  },
  statCardDanger: {
    borderColor: Colors.danger,
    backgroundColor: Colors.dangerMuted,
  },
  statValue: {
    fontSize: Typography.size.xxl,
    fontWeight: Typography.weight.bold,
    color: Colors.textPrimary,
  },
  statLabel: {
    fontSize: Typography.size.xs,
    color: Colors.textSecondary,
    marginTop: 2,
    textAlign: 'center',
  },

  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
    marginTop: Spacing.lg,
  },
  sectionTitle: {
    fontSize: Typography.size.xs,
    fontWeight: Typography.weight.bold,
    color: Colors.textTertiary,
    letterSpacing: 2,
  },
  sectionAction: {
    fontSize: Typography.size.xs,
    color: Colors.primary,
    fontWeight: Typography.weight.semibold,
    letterSpacing: 1,
  },

  transportRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    marginBottom: Spacing.sm,
  },
  transportLabel: {
    fontSize: Typography.size.sm,
    color: Colors.textPrimary,
    fontWeight: Typography.weight.medium,
  },
  transportState: {
    fontSize: Typography.size.xs,
    fontWeight: Typography.weight.bold,
    color: Colors.textTertiary,
    letterSpacing: 1,
  },

  emptyState: {
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    borderStyle: 'dashed',
    padding: Spacing.xl,
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  emptyText: {
    fontSize: Typography.size.sm,
    color: Colors.textTertiary,
    textAlign: 'center',
    lineHeight: 20,
  },

  msgPreview: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    marginBottom: Spacing.sm,
  },
  msgText: {
    flex: 1,
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
  },
  msgTime: {
    fontSize: Typography.size.xs,
    color: Colors.textTertiary,
    marginLeft: Spacing.sm,
  },
});
