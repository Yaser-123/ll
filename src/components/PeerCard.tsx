/**
 * PeerCard — displays a single discovered peer.
 */

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { Colors, Typography, Spacing, Radius } from '../theme';
import type { Peer } from '../domain/Peer';

interface Props {
  peer: Peer;
}

const STATUS_COLOR: Record<string, string> = {
  online: Colors.online,
  offline: Colors.offline,
  idle: Colors.warning,
  unknown: Colors.unknown,
};

const TRANSPORT_ICON: Record<string, string> = {
  bluetooth: '⬡',
  wifi_direct: '⊕',
  local_wifi: '⊙',
  unknown: '○',
};

export function PeerCard({ peer }: Props) {
  const statusColor = STATUS_COLOR[peer.status] ?? Colors.unknown;
  const icon = TRANSPORT_ICON[peer.transport] ?? '○';

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => router.push(`/dm/${peer.id}` as any)}
      accessibilityRole="button"
    >
      <View style={styles.left}>
        <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
        <Text style={styles.icon}>{icon}</Text>
        <View>
          <Text style={styles.name}>{peer.displayName}</Text>
          <Text style={styles.sub}>
            {peer.transport.replace('_', ' ')}
            {peer.rssi !== null ? `  ·  ${peer.rssi} dBm` : ''}
          </Text>
        </View>
      </View>
      <Text style={[styles.status, { color: statusColor }]}>{peer.status}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    marginBottom: Spacing.sm,
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  icon: {
    fontSize: 18,
    color: Colors.textSecondary,
  },
  name: {
    fontSize: Typography.size.md,
    fontWeight: Typography.weight.semibold,
    color: Colors.textPrimary,
  },
  sub: {
    fontSize: Typography.size.xs,
    color: Colors.textSecondary,
    marginTop: 2,
    textTransform: 'capitalize',
  },
  status: {
    fontSize: Typography.size.xs,
    fontWeight: Typography.weight.medium,
    textTransform: 'capitalize',
  },
});
