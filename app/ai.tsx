/**
 * AI Screen — placeholder for the local LLM / offline AI assistant module.
 *
 * STUB: No AI model runs here. The UI shell is ready.
 * Wire in a local LLM (e.g., llama.rn, whisper.rn) as a separate module.
 */

import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors, Typography, Spacing, Radius } from '../src/theme';
import { useDeviceStore } from '../src/store/useDeviceStore';
import { NetworkStatusBar } from '../src/components/NetworkStatusBar';

export default function AiScreen() {
  const { networkStatus } = useDeviceStore();

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <NetworkStatusBar status={networkStatus} />

      <ScrollView contentContainerStyle={styles.content}>
        {/* Hero */}
        <View style={styles.hero}>
          <Text style={styles.heroIcon}>⬡</Text>
          <Text style={styles.heroTitle}>AI ASSISTANT</Text>
          <Text style={styles.heroSub}>Offline — no cloud required</Text>
        </View>

        {/* Stub notice */}
        <View style={styles.stubCard}>
          <Text style={styles.stubTitle}>MODULE NOT YET LOADED</Text>
          <Text style={styles.stubText}>
            The AI assistant will run entirely on-device using a compressed language model.
            No data leaves the phone. No internet connection required.
          </Text>
        </View>

        {/* Planned capabilities */}
        <Text style={styles.sectionTitle}>PLANNED CAPABILITIES</Text>

        <CapabilityCard
          icon="💬"
          title="Emergency guidance"
          detail="First aid, triage, evacuation procedures sourced from offline knowledge base"
        />
        <CapabilityCard
          icon="🗺"
          title="Location context"
          detail="Analyse peer positions and suggest safe routes or rendezvous points"
        />
        <CapabilityCard
          icon="📡"
          title="Mesh diagnostics"
          detail="Reason about network topology, lost nodes, and routing decisions"
        />
        <CapabilityCard
          icon="🔤"
          title="Message translation"
          detail="Multilingual support for cross-language emergency coordination"
        />
        <CapabilityCard
          icon="🎙"
          title="Voice input"
          detail="Whisper-based offline speech recognition for hands-free operation"
        />

        {/* Tech stack */}
        <Text style={[styles.sectionTitle, { marginTop: Spacing.xl }]}>IMPLEMENTATION PLAN</Text>
        <View style={styles.techCard}>
          <TechRow label="Inference" value="llama.rn / MLC LLM" />
          <TechRow label="Model size" value="~1–4 GB (Q4 quantised)" />
          <TechRow label="Speech" value="whisper.rn" />
          <TechRow label="Knowledge base" value="SQLite FTS5 (offline)" />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function CapabilityCard({ icon, title, detail }: { icon: string; title: string; detail: string }) {
  return (
    <View style={styles.capCard}>
      <Text style={styles.capIcon}>{icon}</Text>
      <View style={{ flex: 1 }}>
        <Text style={styles.capTitle}>{title}</Text>
        <Text style={styles.capDetail}>{detail}</Text>
      </View>
    </View>
  );
}

function TechRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.techRow}>
      <Text style={styles.techLabel}>{label}</Text>
      <Text style={styles.techValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.lg, paddingBottom: Spacing.xxxl },

  hero: {
    alignItems: 'center',
    paddingVertical: Spacing.xxl,
  },
  heroIcon: {
    fontSize: 56,
    color: Colors.info,
    marginBottom: Spacing.md,
  },
  heroTitle: {
    fontSize: Typography.size.xxl,
    fontWeight: Typography.weight.heavy,
    color: Colors.textPrimary,
    letterSpacing: 6,
  },
  heroSub: {
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
    marginTop: Spacing.sm,
  },

  stubCard: {
    backgroundColor: Colors.infoMuted,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.info,
    padding: Spacing.lg,
    marginBottom: Spacing.xl,
  },
  stubTitle: {
    fontSize: Typography.size.xs,
    fontWeight: Typography.weight.bold,
    color: Colors.info,
    letterSpacing: 2,
    marginBottom: Spacing.sm,
  },
  stubText: {
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
    lineHeight: 20,
  },

  sectionTitle: {
    fontSize: Typography.size.xs,
    fontWeight: Typography.weight.bold,
    color: Colors.textTertiary,
    letterSpacing: 2,
    marginBottom: Spacing.md,
  },

  capCard: {
    flexDirection: 'row',
    gap: Spacing.md,
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    padding: Spacing.lg,
    marginBottom: Spacing.sm,
    alignItems: 'flex-start',
  },
  capIcon: { fontSize: 24 },
  capTitle: {
    fontSize: Typography.size.md,
    fontWeight: Typography.weight.semibold,
    color: Colors.textPrimary,
    marginBottom: Spacing.xs,
  },
  capDetail: {
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
    lineHeight: 18,
  },

  techCard: {
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    padding: Spacing.lg,
  },
  techRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  techLabel: {
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
    fontWeight: Typography.weight.medium,
  },
  techValue: {
    fontSize: Typography.size.sm,
    color: Colors.primary,
    fontWeight: Typography.weight.semibold,
  },
});
