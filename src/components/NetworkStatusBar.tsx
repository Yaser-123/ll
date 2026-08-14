/**
 * NetworkStatusBar — thin strip at top of screen showing connectivity state.
 * Shows which transports are active and how many peers are reachable.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, Typography, Spacing } from '../theme';
import type { NetworkStatus } from '../network/TransportManager';

interface Props {
  status: NetworkStatus;
}

export function NetworkStatusBar({ status }: Props) {
  const { isAnyTransportActive, totalConnectedPeers } = status;

  const color = isAnyTransportActive
    ? totalConnectedPeers > 0
      ? Colors.online
      : Colors.warning
    : Colors.offline;

  const label = isAnyTransportActive
    ? totalConnectedPeers > 0
      ? `${totalConnectedPeers} peer${totalConnectedPeers !== 1 ? 's' : ''} reachable`
      : 'Scanning — no peers'
    : 'All transports offline';

  return (
    <View style={[styles.container, { borderBottomColor: color }]}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={[styles.label, { color }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.xs,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    gap: Spacing.sm,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  label: {
    fontSize: Typography.size.xs,
    fontWeight: Typography.weight.medium,
    letterSpacing: 0.3,
  },
});
