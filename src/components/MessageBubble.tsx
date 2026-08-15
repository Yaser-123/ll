/**
 * MessageBubble — renders a single chat message.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, Typography, Spacing, Radius } from '../theme';
import type { Message } from '../domain/Message';

interface Props {
  message: Message;
  isSelf: boolean;
}

const STATUS_INDICATOR: Record<string, string> = {
  pending: '○',
  sent: '◎',
  delivered: '●',
  failed: '✕',
};

export function MessageBubble({ message, isSelf }: Props) {
  const statusIcon = STATUS_INDICATOR[message.status] ?? '○';
  const time = new Date(message.createdAt).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  let hopLabel = '';
  if (message.hopCount > 0) {
    hopLabel = `${message.hopCount}-hop`;
  } else {
    hopLabel = 'Direct';
  }

  return (
    <View style={[styles.row, isSelf ? styles.rowSelf : styles.rowOther]}>
      <View style={[styles.bubble, isSelf ? styles.bubbleSelf : styles.bubbleOther]}>
        {message.type === 'sos_relay' && (
          <Text style={styles.sosTag}>🆘 SOS RELAY</Text>
        )}
        {message.type === 'system' && (
          <Text style={styles.systemTag}>SYSTEM</Text>
        )}
        <Text style={[styles.text, isSelf ? styles.textSelf : styles.textOther]}>
          {message.text ?? ''}
        </Text>
        <View style={styles.meta}>
          <Text style={styles.meshTag}>{hopLabel}</Text>
          <View style={styles.timeStatusWrapper}>
            <Text style={styles.time}>{time}</Text>
            {isSelf && (
              <Text style={[styles.status, message.status === 'failed' ? styles.statusFailed : null]}>
                {statusIcon}
              </Text>
            )}
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    marginVertical: Spacing.xs,
    marginHorizontal: Spacing.lg,
  },
  rowSelf: {
    alignItems: 'flex-end',
  },
  rowOther: {
    alignItems: 'flex-start',
  },
  bubble: {
    maxWidth: '78%',
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  bubbleSelf: {
    backgroundColor: Colors.primaryMuted,
    borderWidth: 1,
    borderColor: Colors.primary,
    borderBottomRightRadius: Radius.sm,
  },
  bubbleOther: {
    backgroundColor: Colors.surfaceElevated,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    borderBottomLeftRadius: Radius.sm,
  },
  text: {
    fontSize: Typography.size.md,
    lineHeight: Typography.size.md * 1.5,
  },
  textSelf: {
    color: Colors.textPrimary,
  },
  textOther: {
    color: Colors.textPrimary,
  },
  meta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Spacing.xs,
    gap: Spacing.lg,
  },
  timeStatusWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  meshTag: {
    fontSize: Typography.size.xs - 2,
    color: Colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  time: {
    fontSize: Typography.size.xs,
    color: Colors.textTertiary,
  },
  status: {
    fontSize: Typography.size.xs,
    color: Colors.primary,
  },
  statusFailed: {
    color: Colors.danger,
  },
  sosTag: {
    fontSize: Typography.size.xs,
    fontWeight: Typography.weight.bold,
    color: Colors.danger,
    marginBottom: Spacing.xs,
  },
  systemTag: {
    fontSize: Typography.size.xs,
    fontWeight: Typography.weight.bold,
    color: Colors.info,
    marginBottom: Spacing.xs,
    letterSpacing: 1,
  },
});
