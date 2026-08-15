/**
 * SOS Screen — emergency alert creation and management.
 *
 * FUNCTIONAL: Create, view, and resolve SOS events locally.
 * STUB: SOS broadcast to mesh peers (requires real transport module).
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import * as turf from '@turf/distance';
import { point } from '@turf/helpers';

import { Colors, Typography, Spacing, Radius, Shadow } from '../src/theme';
import { useDeviceStore } from '../src/store/useDeviceStore';
import { useSosStore } from '../src/store/useSosStore';
import { useLocationStore } from '../src/store/useLocationStore';
import { SosButton } from '../src/components/SosButton';
import { NetworkStatusBar } from '../src/components/NetworkStatusBar';
import { createSosEvent, type SosSeverity, type SosEvent } from '../src/domain/SosEvent';
import { transportManager } from '../src/network/TransportManager';

const SEVERITY_CONFIG: Record<SosSeverity, { label: string; color: string; bg: string }> = {
  low: { label: 'LOW', color: Colors.info, bg: Colors.infoMuted },
  medium: { label: 'MEDIUM', color: Colors.warning, bg: Colors.warningMuted },
  high: { label: 'HIGH', color: Colors.danger, bg: Colors.dangerMuted },
  critical: { label: 'CRITICAL', color: '#FF0000', bg: '#3D0000' },
};

export default function SosScreen() {
  const { deviceId, displayName, networkStatus } = useDeviceStore();
  const { events, addEvent, updateStatus, getActiveEvents } = useSosStore();
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedSeverity, setSelectedSeverity] = useState<SosSeverity>('high');
  const [description, setDescription] = useState('');

  const activeEvents = getActiveEvents();

  async function handleSosActivate() {
    setModalVisible(true);
  }

  async function handleConfirmSos() {
    if (!deviceId) return;

    // Pull instant background GPS location from store instead of waiting
    const myLoc = useLocationStore.getState().getSelfLocation(deviceId);
    let locationData;
    if (myLoc) {
      locationData = {
        latitude: myLoc.latitude,
        longitude: myLoc.longitude,
        accuracy: undefined
      };
    } else {
      console.warn('No location available in store for SOS');
    }

    const event = createSosEvent(deviceId, displayName, selectedSeverity, description.trim() || undefined);
    if (locationData) {
      event.location = locationData;
    }
    
    await addEvent(event);

    await transportManager.broadcastSos(event);

    setModalVisible(false);
    setDescription('');
    setSelectedSeverity('high');
  }

  async function handleResolve(event: SosEvent) {
    Alert.alert(
      'Resolve SOS',
      `Mark "${event.severity.toUpperCase()}" alert as resolved?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Resolve',
          style: 'destructive',
          onPress: async () => {
            await updateStatus(event.id, 'resolved');
            if (deviceId) {
              await transportManager.broadcastSosCancel(event.id, deviceId);
            }
          },
        },
      ]
    );
  }

  const hasActive = activeEvents.length > 0;

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <NetworkStatusBar status={networkStatus} />

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {/* SOS Button */}
        <View style={styles.buttonSection}>
          <SosButton onActivate={handleSosActivate} isActive={hasActive} />
          <Text style={styles.holdHint}>Hold 1.5 seconds to trigger emergency alert</Text>
        </View>

        {/* Mesh Status */}
        <View style={styles.stubCard}>
          <Text style={styles.stubTitle}>MESH STATUS</Text>
          <Text style={styles.stubText}>
            Your SOS will be immediately broadcast to all reachable peers via Bluetooth. If no peers are nearby, it will be securely held in the store-and-forward queue and automatically transmitted the moment a peer is discovered.
          </Text>
        </View>

        {/* Active alerts */}
        <SectionHeader title="ACTIVE ALERTS" count={activeEvents.length} />
        {activeEvents.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No active SOS alerts</Text>
          </View>
        ) : (
          activeEvents.map((e) => (
            <SosEventCard key={e.id} event={e} onResolve={handleResolve} />
          ))
        )}

        {/* Historical events */}
        {events.filter((e) => e.status !== 'active').length > 0 && (
          <>
            <SectionHeader title="HISTORY" />
            {events
              .filter((e) => e.status !== 'active')
              .slice(0, 10)
              .map((e) => (
                <SosEventCard key={e.id} event={e} />
              ))}
          </>
        )}
      </ScrollView>

      {/* SOS confirmation modal */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setModalVisible(false)}
      >
        <KeyboardAvoidingView 
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}
        >
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>⚠ CONFIRM SOS ALERT</Text>
            <Text style={styles.modalSub}>
              This will create a local emergency alert and attempt to broadcast to all reachable peers.
            </Text>

            <Text style={styles.fieldLabel}>SEVERITY</Text>
            <View style={styles.severityRow}>
              {(['low', 'medium', 'high', 'critical'] as SosSeverity[]).map((s) => (
                <TouchableOpacity
                  key={s}
                  style={[
                    styles.severityBtn,
                    { borderColor: SEVERITY_CONFIG[s].color },
                    selectedSeverity === s && { backgroundColor: SEVERITY_CONFIG[s].bg },
                  ]}
                  onPress={() => setSelectedSeverity(s)}
                >
                  <Text style={[styles.severityLabel, { color: SEVERITY_CONFIG[s].color }]}>
                    {SEVERITY_CONFIG[s].label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.fieldLabel}>DESCRIPTION (OPTIONAL)</Text>
            <TextInput
              style={styles.descInput}
              value={description}
              onChangeText={setDescription}
              placeholder="Describe the emergency…"
              placeholderTextColor={Colors.textTertiary}
              multiline
              maxLength={200}
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setModalVisible(false)}
              >
                <Text style={styles.cancelBtnText}>CANCEL</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.confirmBtn} onPress={handleConfirmSos}>
                <Text style={styles.confirmBtnText}>SEND SOS</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

function SosEventCard({
  event,
  onResolve,
}: {
  event: SosEvent;
  onResolve?: (e: SosEvent) => void;
}) {
  const cfg = SEVERITY_CONFIG[event.severity];
  const isActive = event.status === 'active';
  
  const deviceId = useDeviceStore((s) => s.deviceId);
  const myLoc = useLocationStore((s) => s.getSelfLocation(deviceId));
  let distanceStr = '';
  if (myLoc && event.location && !event.isLocal) {
    const from = point([myLoc.longitude, myLoc.latitude]);
    const to = point([event.location.longitude, event.location.latitude]);
    const dist = turf.default(from, to, { units: 'kilometers' });
    distanceStr = dist < 1 ? `${Math.round(dist * 1000)} m away` : `${dist.toFixed(1)} km away`;
  }

  return (
    <View style={[styles.eventCard, isActive && { borderColor: cfg.color }]}>
      <View style={styles.eventHeader}>
        <View style={[styles.severityPill, { backgroundColor: cfg.bg }]}>
          <Text style={[styles.severityPillText, { color: cfg.color }]}>{cfg.label}</Text>
        </View>
        <Text style={[styles.eventStatus, isActive && { color: cfg.color }]}>
          {event.status.toUpperCase()}
        </Text>
      </View>
      <Text style={styles.eventOriginator}>
        {event.isLocal ? 'YOU' : event.originatorName} · {event.hopCount} hops
      </Text>
      {event.description ? (
        <Text style={styles.eventDesc}>{event.description}</Text>
      ) : null}
      {event.location ? (
        <View style={styles.locationRow}>
          <Text style={styles.eventLocation}>
            📍 {event.location.latitude.toFixed(5)}, {event.location.longitude.toFixed(5)}
          </Text>
          {!!distanceStr && <Text style={styles.distanceText}> • {distanceStr}</Text>}
        </View>
      ) : null}
      <Text style={styles.eventTime}>
        {new Date(event.createdAt).toLocaleString()}
      </Text>
      
      <View style={styles.actionRow}>
        {event.location && (
          <TouchableOpacity
            style={styles.mapBtn}
            onPress={() => router.push(`/map?lat=${event.location!.latitude}&lng=${event.location!.longitude}&sosId=${event.id}`)}
          >
            <Text style={styles.mapBtnText}>VIEW ON MAP</Text>
          </TouchableOpacity>
        )}
        
        {isActive && onResolve && event.isLocal && (
          <TouchableOpacity
            style={styles.resolveBtn}
            onPress={() => onResolve(event)}
          >
            <Text style={styles.resolveBtnText}>MARK RESOLVED</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

function SectionHeader({ title, count }: { title: string; count?: number }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {count !== undefined && count > 0 && (
        <View style={styles.countBadge}>
          <Text style={styles.countText}>{count}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  scroll: { flex: 1 },
  content: { padding: Spacing.lg, paddingBottom: Spacing.xxxl },

  buttonSection: {
    alignItems: 'center',
    paddingVertical: Spacing.xxl,
    marginBottom: Spacing.lg,
  },
  holdHint: {
    marginTop: Spacing.xl,
    fontSize: Typography.size.xs,
    color: Colors.textTertiary,
    letterSpacing: 0.5,
  },

  stubCard: {
    backgroundColor: Colors.warningMuted,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.warning,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  stubTitle: {
    fontSize: Typography.size.xs,
    fontWeight: Typography.weight.bold,
    color: Colors.warning,
    letterSpacing: 2,
    marginBottom: Spacing.sm,
  },
  stubText: {
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
    lineHeight: 20,
  },

  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
    marginTop: Spacing.md,
  },
  sectionTitle: {
    fontSize: Typography.size.xs,
    fontWeight: Typography.weight.bold,
    color: Colors.textTertiary,
    letterSpacing: 2,
  },
  countBadge: {
    backgroundColor: Colors.danger,
    borderRadius: Radius.full,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  countText: {
    fontSize: Typography.size.xs,
    fontWeight: Typography.weight.bold,
    color: '#fff',
  },

  empty: {
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    borderStyle: 'dashed',
    padding: Spacing.xl,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: Typography.size.sm,
    color: Colors.textTertiary,
  },

  eventCard: {
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    padding: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  eventHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  severityPill: {
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
  },
  severityPillText: {
    fontSize: Typography.size.xs,
    fontWeight: Typography.weight.bold,
    letterSpacing: 1,
  },
  eventStatus: {
    fontSize: Typography.size.xs,
    fontWeight: Typography.weight.semibold,
    color: Colors.textTertiary,
    letterSpacing: 1,
  },
  eventOriginator: {
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
    fontWeight: Typography.weight.medium,
    marginBottom: Spacing.xs,
  },
  eventDesc: {
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
    marginBottom: Spacing.sm,
  },
  eventLocation: {
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
    marginBottom: Spacing.xs,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginBottom: Spacing.xs,
  },
  distanceText: {
    fontSize: Typography.size.sm,
    color: Colors.primary,
    fontWeight: Typography.weight.bold,
  },
  eventTime: {
    fontSize: Typography.size.xs,
    color: Colors.textTertiary,
  },
  actionRow: {
    flexDirection: 'row',
    marginTop: Spacing.md,
    gap: Spacing.md,
  },
  resolveBtn: {
    flex: 1,
    paddingVertical: Spacing.sm,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: Radius.sm,
    alignItems: 'center',
  },
  resolveBtnText: {
    color: Colors.textPrimary,
    fontSize: Typography.size.sm,
    fontWeight: Typography.weight.bold,
  },
  mapBtn: {
    flex: 1,
    paddingVertical: Spacing.sm,
    backgroundColor: 'rgba(0,150,255,0.15)',
    borderRadius: Radius.sm,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0,150,255,0.3)',
  },
  mapBtnText: {
    color: '#0096FF',
    fontSize: Typography.size.sm,
    fontWeight: Typography.weight.bold,
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: Colors.overlay,
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    borderTopWidth: 2,
    borderTopColor: Colors.danger,
    padding: Spacing.xl,
    paddingBottom: Spacing.xxxl,
  },
  modalTitle: {
    fontSize: Typography.size.xl,
    fontWeight: Typography.weight.heavy,
    color: Colors.danger,
    letterSpacing: 2,
    marginBottom: Spacing.sm,
  },
  modalSub: {
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
    marginBottom: Spacing.xl,
    lineHeight: 20,
  },
  fieldLabel: {
    fontSize: Typography.size.xs,
    fontWeight: Typography.weight.bold,
    color: Colors.textTertiary,
    letterSpacing: 2,
    marginBottom: Spacing.sm,
  },
  severityRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.xl,
    flexWrap: 'wrap',
  },
  severityBtn: {
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  severityLabel: {
    fontSize: Typography.size.xs,
    fontWeight: Typography.weight.bold,
    letterSpacing: 1,
  },
  descInput: {
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    color: Colors.textPrimary,
    padding: Spacing.md,
    fontSize: Typography.size.md,
    minHeight: 80,
    textAlignVertical: 'top',
    marginBottom: Spacing.xl,
  },
  modalActions: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    alignItems: 'center',
  },
  cancelBtnText: {
    fontSize: Typography.size.sm,
    fontWeight: Typography.weight.bold,
    color: Colors.textSecondary,
    letterSpacing: 1,
  },
  confirmBtn: {
    flex: 1,
    paddingVertical: Spacing.md,
    borderRadius: Radius.md,
    backgroundColor: Colors.danger,
    alignItems: 'center',
    ...Shadow.danger,
  },
  confirmBtnText: {
    fontSize: Typography.size.sm,
    fontWeight: Typography.weight.bold,
    color: '#fff',
    letterSpacing: 2,
  },
});
