/**
 * Chat Screen — local message composition and display.
 *
 * FUNCTIONAL: Messages are stored locally and displayed in real time.
 * STUB: Messages are NOT transmitted to peers (requires real transport module).
 */

import React, { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';

import { Colors, Typography, Spacing, Radius } from '../../src/theme';
import { useDeviceStore } from '../../src/store/useDeviceStore';
import { useMessageStore } from '../../src/store/useMessageStore';
import { usePeerStore } from '../../src/store/usePeerStore';
import { NetworkStatusBar } from '../../src/components/NetworkStatusBar';
import { MessageBubble } from '../../src/components/MessageBubble';
import { createMessage, makeConversationId } from '../../src/domain/Message';
import { transportManager } from '../../src/network/TransportManager';

// Broadcast conversation — messages sent to the whole mesh
const BROADCAST_ID = 'broadcast';

export default function ChatScreen() {
  const { deviceId, networkStatus } = useDeviceStore();
  const { addMessage, getConversation } = useMessageStore();
  const { getPeerList } = usePeerStore();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [text, setText] = useState('');
  const flatListRef = useRef<FlatList>(null);

  const targetPeerId = id;
  const conversationId = makeConversationId(deviceId, targetPeerId);
  const conversation = getConversation(conversationId);
  
  const selectedPeer = getPeerList().find((p: any) => p.id === id);
  const peerName = selectedPeer ? selectedPeer.displayName : 'Unknown Peer';

  const handleSend = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed || !deviceId) return;

    const message = createMessage({
      senderId: deviceId,
      recipientId: targetPeerId,
      type: 'text',
      text: trimmed,
    });

    setText('');
    
    // Add to local store immediately (shows as 'pending' in UI)
    await addMessage(message);

    // Give the transport manager the message to actually deliver.
    // The transport will handle queueing if the peer is temporarily offline.
    await transportManager.sendMessage(message, targetPeerId);

    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
  }, [text, deviceId, targetPeerId, addMessage]);

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <NetworkStatusBar status={networkStatus} />

      <View style={[styles.peerHeader, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}>
        <Text style={styles.peerHeaderText}>Private Chat with <Text style={{fontWeight: 'bold'}}>{peerName}</Text></Text>
        <TouchableOpacity onPress={() => useMessageStore.getState().clearConversation(conversationId)}>
          <Text style={{ color: Colors.danger, fontSize: 12 }}>Wipe Chat</Text>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView 
        style={{ flex: 1 }}
        behavior="padding"
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 90}
      >
        {conversation.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>◈</Text>
            <Text style={styles.emptyTitle}>No messages yet</Text>
            <Text style={styles.emptySubtitle}>
              Type a message below.{'\n'}
              It will be stored locally until a peer transport connects.
            </Text>
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={conversation}
            keyExtractor={(m) => m.id}
            renderItem={({ item }) => (
              <MessageBubble message={item} isSelf={item.senderId === deviceId} />
            )}
            contentContainerStyle={styles.messageList}
            onLayout={() => flatListRef.current?.scrollToEnd({ animated: false })}
          />
        )}

        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            value={text}
            onChangeText={setText}
            placeholder="Type a message…"
            placeholderTextColor={Colors.textTertiary}
            multiline
            maxLength={1000}
            onSubmitEditing={handleSend}
            returnKeyType="send"
            blurOnSubmit={false}
          />
          <TouchableOpacity
            style={[styles.sendBtn, !text.trim() && styles.sendBtnDisabled]}
            onPress={handleSend}
            disabled={!text.trim()}
            accessibilityRole="button"
            accessibilityLabel="Send message"
          >
            <Text style={styles.sendIcon}>▶</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },

  peerHeader: {
    backgroundColor: Colors.surfaceElevated,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBorder,
  },
  peerHeaderText: {
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
  },

  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xxl,
  },
  emptyIcon: {
    fontSize: 48,
    color: Colors.textTertiary,
    marginBottom: Spacing.lg,
  },
  emptyTitle: {
    fontSize: Typography.size.xl,
    fontWeight: Typography.weight.bold,
    color: Colors.textSecondary,
    marginBottom: Spacing.sm,
  },
  emptySubtitle: {
    fontSize: Typography.size.sm,
    color: Colors.textTertiary,
    textAlign: 'center',
    lineHeight: 20,
  },

  messageList: {
    paddingVertical: Spacing.md,
    paddingBottom: Spacing.lg,
  },

  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.sm,
    padding: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.surfaceBorder,
    backgroundColor: Colors.surface,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    color: Colors.textPrimary,
    fontSize: Typography.size.md,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: {
    backgroundColor: Colors.primaryMuted,
    opacity: 0.5,
  },
  sendIcon: {
    fontSize: 16,
    color: Colors.background,
    fontWeight: '700',
  },
});
