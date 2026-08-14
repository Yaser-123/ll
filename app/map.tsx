/**
 * Map Screen — placeholder for the GPS/location module.
 *
 * STUB: No real map is rendered. The location store and domain models
 * are in place and ready. Wire in react-native-maps + expo-location
 * as a separate module.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors, Typography, Spacing, Radius } from '../src/theme';
import { useLocationStore } from '../src/store/useLocationStore';
import { useDeviceStore } from '../src/store/useDeviceStore';
import { NetworkStatusBar } from '../src/components/NetworkStatusBar';

export default function MapScreen() {
  const { networkStatus } = useDeviceStore();
  const { getAllLocations } = useLocationStore();
  const locations = getAllLocations();

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <NetworkStatusBar status={networkStatus} />

      {/* Placeholder canvas */}
      <View style={styles.mapPlaceholder}>
        <Text style={styles.mapIcon}>◉</Text>
        <Text style={styles.mapTitle}>MAP MODULE</Text>
        <Text style={styles.mapSub}>Not yet implemented</Text>
      </View>

      {/* Module spec */}
      <View style={styles.specCard}>
        <Text style={styles.specTitle}>WHAT THIS MODULE WILL PROVIDE</Text>
        <SpecItem label="Real-time GPS" detail="expo-location" />
        <SpecItem label="Peer locations on map" detail="react-native-maps" />
        <SpecItem label="SOS pin overlay" detail="custom markers" />
        <SpecItem label="Mesh coverage heatmap" detail="signal strength data" />
        <SpecItem label="Offline map tiles" detail="cached tile provider" />
      </View>

      {/* Location store preview */}
      <View style={styles.storeCard}>
        <Text style={styles.storeTitle}>LOCATION STORE ({locations.length} entries)</Text>
        {locations.length === 0 ? (
          <Text style={styles.storeEmpty}>
            No location data yet. Populate via useLocationStore.upsertLocation().
          </Text>
        ) : (
          locations.map((l) => (
            <Text key={l.deviceId} style={styles.storeEntry}>
              {l.deviceId.slice(0, 8)}… · {l.latitude.toFixed(5)}, {l.longitude.toFixed(5)}
            </Text>
          ))
        )}
      </View>
    </SafeAreaView>
  );
}

function SpecItem({ label, detail }: { label: string; detail: string }) {
  return (
    <View style={styles.specRow}>
      <Text style={styles.specCheck}>○</Text>
      <Text style={styles.specLabel}>{label}</Text>
      <Text style={styles.specDetail}>{detail}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },

  mapPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBorder,
    backgroundColor: Colors.surface,
  },
  mapIcon: {
    fontSize: 64,
    color: Colors.primary,
    opacity: 0.3,
    marginBottom: Spacing.lg,
  },
  mapTitle: {
    fontSize: Typography.size.xl,
    fontWeight: Typography.weight.bold,
    color: Colors.textTertiary,
    letterSpacing: 4,
  },
  mapSub: {
    fontSize: Typography.size.sm,
    color: Colors.textTertiary,
    marginTop: Spacing.sm,
  },

  specCard: {
    margin: Spacing.lg,
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    padding: Spacing.lg,
  },
  specTitle: {
    fontSize: Typography.size.xs,
    fontWeight: Typography.weight.bold,
    color: Colors.textTertiary,
    letterSpacing: 2,
    marginBottom: Spacing.md,
  },
  specRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  specCheck: { color: Colors.textTertiary, fontSize: 14 },
  specLabel: {
    flex: 1,
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
    fontWeight: Typography.weight.medium,
  },
  specDetail: {
    fontSize: Typography.size.xs,
    color: Colors.textTertiary,
    fontStyle: 'italic',
  },

  storeCard: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.lg,
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    padding: Spacing.lg,
  },
  storeTitle: {
    fontSize: Typography.size.xs,
    fontWeight: Typography.weight.bold,
    color: Colors.textTertiary,
    letterSpacing: 2,
    marginBottom: Spacing.sm,
  },
  storeEmpty: {
    fontSize: Typography.size.sm,
    color: Colors.textTertiary,
    lineHeight: 20,
  },
  storeEntry: {
    fontSize: Typography.size.xs,
    color: Colors.primary,
    marginBottom: Spacing.xs,
  },
});
