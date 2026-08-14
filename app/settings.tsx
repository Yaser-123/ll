/**
 * Settings Screen — device identity, display name, and app info.
 *
 * FUNCTIONAL: Display name change persists across restarts via AsyncStorage.
 * FUNCTIONAL: Device ID shown (generated on first launch, stored in SecureStore).
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors, Typography, Spacing, Radius } from '../src/theme';
import { useDeviceStore } from '../src/store/useDeviceStore';
import { StorageService } from '../src/services/StorageService';
import { NetworkStatusBar } from '../src/components/NetworkStatusBar';

export default function SettingsScreen() {
  const { deviceId, displayName, setDisplayName, networkStatus } = useDeviceStore();
  const [editName, setEditName] = useState(displayName);
  const [saving, setSaving] = useState(false);

  async function handleSaveName() {
    if (!editName.trim()) return;
    setSaving(true);
    await setDisplayName(editName.trim());
    setSaving(false);
    Alert.alert('Saved', 'Your call sign has been updated.');
  }

  async function handleClearData() {
    Alert.alert(
      'Clear All Data',
      'This will erase all stored messages, peers, and SOS events. Your device identity will be preserved.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            await StorageService.clearAll();
            Alert.alert('Cleared', 'All app data has been erased. Restart the app to continue.');
          },
        },
      ]
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <NetworkStatusBar status={networkStatus} />

      <ScrollView contentContainerStyle={styles.content}>
        {/* Identity */}
        <SectionLabel text="DEVICE IDENTITY" />
        <View style={styles.card}>
          <InfoRow label="Device ID" value={deviceId} mono />
          <InfoRow label="Call Sign" value={displayName} />
        </View>

        {/* Edit name */}
        <SectionLabel text="EDIT CALL SIGN" />
        <View style={styles.card}>
          <TextInput
            style={styles.nameInput}
            value={editName}
            onChangeText={setEditName}
            placeholder="Enter call sign…"
            placeholderTextColor={Colors.textTertiary}
            maxLength={32}
            autoCorrect={false}
          />
          <TouchableOpacity
            style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
            onPress={handleSaveName}
            disabled={saving || !editName.trim() || editName.trim() === displayName}
          >
            <Text style={styles.saveBtnText}>{saving ? 'SAVING…' : 'SAVE CALL SIGN'}</Text>
          </TouchableOpacity>
        </View>

        {/* Transport status */}
        <SectionLabel text="TRANSPORT STATUS" />
        <View style={styles.card}>
          {networkStatus.activeTransports.map((t) => (
            <View key={t.label} style={styles.transportRow}>
              <Text style={styles.transportLabel}>{t.label}</Text>
              <Text
                style={[
                  styles.transportState,
                  t.state === 'scanning' && { color: Colors.warning },
                  t.state === 'connected' && { color: Colors.online },
                ]}
              >
                {t.state.toUpperCase()}
              </Text>
            </View>
          ))}
          <Text style={styles.transportNote}>
            Only MockTransport registered. Add Bluetooth or Wi-Fi adapters to TransportManager.
          </Text>
        </View>

        {/* App info */}
        <SectionLabel text="ABOUT" />
        <View style={styles.card}>
          <InfoRow label="App" value="LIFELINE" />
          <InfoRow label="Version" value="0.1.0 — Foundation" />
          <InfoRow label="Mode" value="Offline-first" />
          <InfoRow label="Cloud dependency" value="None" />
        </View>

        {/* Danger zone */}
        <SectionLabel text="DANGER ZONE" />
        <TouchableOpacity style={styles.dangerBtn} onPress={handleClearData}>
          <Text style={styles.dangerBtnText}>CLEAR ALL LOCAL DATA</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

function SectionLabel({ text }: { text: string }) {
  return <Text style={styles.sectionLabel}>{text}</Text>;
}

function InfoRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={[styles.infoValue, mono && styles.infoMono]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.lg, paddingBottom: Spacing.xxxl },

  sectionLabel: {
    fontSize: Typography.size.xs,
    fontWeight: Typography.weight.bold,
    color: Colors.textTertiary,
    letterSpacing: 2,
    marginTop: Spacing.xl,
    marginBottom: Spacing.sm,
  },

  card: {
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    padding: Spacing.lg,
    gap: Spacing.md,
  },

  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  infoLabel: {
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
    fontWeight: Typography.weight.medium,
  },
  infoValue: {
    fontSize: Typography.size.sm,
    color: Colors.textPrimary,
    fontWeight: Typography.weight.semibold,
    maxWidth: '55%',
    textAlign: 'right',
  },
  infoMono: {
    fontSize: Typography.size.xs,
    color: Colors.primary,
    letterSpacing: 0.5,
  },

  nameInput: {
    backgroundColor: Colors.background,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    color: Colors.textPrimary,
    fontSize: Typography.size.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  saveBtn: {
    backgroundColor: Colors.primaryMuted,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.primary,
    paddingVertical: Spacing.md,
    alignItems: 'center',
  },
  saveBtnDisabled: {
    opacity: 0.4,
  },
  saveBtnText: {
    fontSize: Typography.size.sm,
    fontWeight: Typography.weight.bold,
    color: Colors.primary,
    letterSpacing: 2,
  },

  transportRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  transportLabel: {
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
    fontWeight: Typography.weight.medium,
  },
  transportState: {
    fontSize: Typography.size.xs,
    fontWeight: Typography.weight.bold,
    color: Colors.textTertiary,
    letterSpacing: 1,
  },
  transportNote: {
    fontSize: Typography.size.xs,
    color: Colors.textTertiary,
    lineHeight: 18,
    borderTopWidth: 1,
    borderTopColor: Colors.surfaceBorder,
    paddingTop: Spacing.sm,
  },

  dangerBtn: {
    backgroundColor: Colors.dangerMuted,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.danger,
    paddingVertical: Spacing.md,
    alignItems: 'center',
  },
  dangerBtnText: {
    fontSize: Typography.size.sm,
    fontWeight: Typography.weight.bold,
    color: Colors.danger,
    letterSpacing: 2,
  },
});
