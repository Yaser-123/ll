import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as FileSystem from 'expo-file-system';

import { Colors, Typography, Spacing, Radius, Shadow } from '../src/theme';
import { useAiStore } from '../src/store/useAiStore';
import { aiService, type AiMessage } from '../src/services/AiService';
import uuid from 'react-native-uuid';

const MODEL_URL =
  'https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf';
const MODEL_FILE_NAME = 'qwen2.5-1.5b-instruct-q4_k_m.gguf';
// @ts-ignore
const MODEL_PATH = (FileSystem.documentDirectory || 'file:///') + MODEL_FILE_NAME;

export default function AiScreen() {
  const [modelExists, setModelExists] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);

  const [input, setInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const {
    conversations,
    activeConversationId,
    createConversation,
    setActiveConversation,
    addMessage,
    updateMessage,
    getActiveConversation,
    deleteConversation,
    isLoaded
  } = useAiStore();

  const activeConversation = getActiveConversation();
  const messages = activeConversation?.messages || [];
  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    checkModel();
  }, []);

  async function checkModel() {
    try {
      const info = await FileSystem.getInfoAsync(MODEL_PATH);
      if (info.exists && info.size && info.size > 100 * 1024 * 1024) { // > 100MB
        setModelExists(true);
        initAi();
      }
    } catch (e) {
      console.warn('Error checking model file', e);
    }
  }

  async function downloadModel() {
    if (isDownloading) return;
    setIsDownloading(true);
    setDownloadProgress(0);

    try {
      const downloadResumable = FileSystem.createDownloadResumable(
        MODEL_URL,
        MODEL_PATH,
        {},
        (downloadProgress) => {
          const progress =
            downloadProgress.totalBytesWritten /
            downloadProgress.totalBytesExpectedToWrite;
          setDownloadProgress(progress);
        }
      );

      const result = await downloadResumable.downloadAsync();
      if (result && result.status === 200) {
        setModelExists(true);
        initAi();
      } else {
        alert('Download failed.');
      }
    } catch (e) {
      console.error(e);
      alert('Error downloading model.');
    } finally {
      setIsDownloading(false);
    }
  }

  async function initAi() {
    if (aiService.isReady() || isInitializing) return;
    setIsInitializing(true);
    try {
      await aiService.initialize(MODEL_PATH);
      
      // Ensure there's an active conversation
      if (!activeConversationId && isLoaded) {
        createConversation();
      }
    } catch (e) {
      console.error(e);
      alert('Failed to initialize AI context. The model may be corrupted or device RAM is too low.');
    } finally {
      setIsInitializing(false);
    }
  }

  async function handleSend() {
    const text = input.trim();
    if (!text || isGenerating) return;

    let convId = activeConversationId;
    if (!convId) {
      convId = createConversation();
    }

    setInput('');
    setIsGenerating(true);

    // Add user message
    await addMessage(convId, { role: 'user', text });

    // Add empty assistant message to stream into
    const assistantMsgId = uuid.v4() as string;
    await addMessage(convId, { role: 'assistant', text: '...', id: assistantMsgId } as any);

    try {
      // Build conversation history for context
      const history = useAiStore.getState().getActiveConversation()?.messages.slice(0, -1) || [];
      const systemPrompt: AiMessage = {
        id: 'system',
        role: 'system',
        text: 'You are LifeLine AI, an offline emergency medical triage and survival assistant. Keep responses concise, clear, and conversational.',
      };

      const aiMessages = [systemPrompt, ...history];

      // Generate response and stream updates
      let fullResponse = '';
      await aiService.generateResponse(aiMessages, async (token) => {
        fullResponse += token;
        // Throttle state updates if necessary, but Zustand handles fast updates reasonably well
        await updateMessage(convId!, assistantMsgId, (msg) => ({ ...msg, text: fullResponse }));
      });
      
      if (!fullResponse) {
        await updateMessage(convId!, assistantMsgId, (msg) => ({ ...msg, text: "I'm sorry, I encountered an error." }));
      }
    } catch (error) {
      console.error(error);
      await updateMessage(convId!, assistantMsgId, (msg) => ({ ...msg, text: "Error generating response." }));
    } finally {
      setIsGenerating(false);
    }
  }

  function renderHistoryModal() {
    return (
      <Modal visible={showHistory} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowHistory(false)}>
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Chat History</Text>
            <TouchableOpacity onPress={() => setShowHistory(false)}>
              <Text style={styles.closeBtn}>Close</Text>
            </TouchableOpacity>
          </View>
          
          <TouchableOpacity style={styles.newChatBtn} onPress={() => {
            createConversation();
            setShowHistory(false);
          }}>
            <Text style={styles.newChatText}>+ NEW CONVERSATION</Text>
          </TouchableOpacity>

          <FlatList
            data={conversations}
            keyExtractor={item => item.id}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[styles.historyItem, activeConversationId === item.id && styles.historyItemActive]}
                onPress={() => {
                  setActiveConversation(item.id);
                  setShowHistory(false);
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.historyItemTitle} numberOfLines={1}>{item.title}</Text>
                  <Text style={styles.historyItemDate}>{new Date(item.updatedAt).toLocaleString()}</Text>
                </View>
                <TouchableOpacity onPress={() => deleteConversation(item.id)} style={{ padding: 8 }}>
                  <Text style={{ color: Colors.danger, fontSize: 18 }}>×</Text>
                </TouchableOpacity>
              </TouchableOpacity>
            )}
            ListEmptyComponent={<Text style={styles.emptyHistory}>No previous conversations</Text>}
          />
        </View>
      </Modal>
    );
  }

  if (!modelExists) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <View style={styles.hero}>
          <Text style={styles.heroIcon}>🧠</Text>
          <Text style={styles.heroTitle}>DOWNLOAD AI</Text>
          <Text style={styles.heroSub}>
            Qwen2.5-1.5B (1GB) is required for offline intelligence.
          </Text>
        </View>

        <View style={styles.downloadSection}>
          {!isDownloading ? (
            <TouchableOpacity style={styles.downloadBtn} onPress={downloadModel}>
              <Text style={styles.downloadBtnText}>DOWNLOAD MODEL (1 GB)</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.progressContainer}>
              <Text style={styles.progressText}>
                Downloading: {(downloadProgress * 100).toFixed(1)}%
              </Text>
              <View style={styles.progressBarBg}>
                <View style={[styles.progressBarFill, { width: `${downloadProgress * 100}%` }]} />
              </View>
              <Text style={styles.progressWarning}>Please stay on this screen.</Text>
            </View>
          )}
        </View>
      </SafeAreaView>
    );
  }

  if (isInitializing) {
    return (
      <SafeAreaView style={[styles.safe, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={{ color: Colors.textSecondary, marginTop: Spacing.md }}>
          Waking up AI engine...
        </Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.offlineBadge}>
          <Text style={styles.offlineBadgeDot}>●</Text>
          <Text style={styles.offlineBadgeText}>100% ON-DEVICE OFFLINE</Text>
        </View>
        <TouchableOpacity onPress={() => setShowHistory(true)} style={styles.historyBtn}>
          <Text style={styles.historyBtnText}>HISTORY ☰</Text>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.chatContent}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
          renderItem={({ item }) => {
            const isUser = item.role === 'user';
            return (
              <View style={[styles.messageRow, isUser ? styles.messageRowUser : styles.messageRowAi]}>
                {!isUser && <Text style={styles.avatarAi}>⬡</Text>}
                <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAi]}>
                  <Text style={[styles.messageText, isUser ? styles.messageTextUser : styles.messageTextAi]}>
                    {item.text}
                  </Text>
                </View>
              </View>
            );
          }}
          ListEmptyComponent={
            <View style={styles.emptyChat}>
              <Text style={styles.emptyChatTitle}>LIFELINE AI IS READY</Text>
              <Text style={styles.emptyChatSub}>
                I can provide emergency first-aid advice, survival instructions, and situation assessment completely offline. How can I help?
              </Text>
            </View>
          }
        />

        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            placeholder="Describe the emergency..."
            placeholderTextColor={Colors.textTertiary}
            value={input}
            onChangeText={setInput}
            multiline
            maxLength={1000}
            editable={!isGenerating}
          />
          <TouchableOpacity
            style={[styles.sendBtn, (!input.trim() || isGenerating) && { opacity: 0.5 }]}
            onPress={handleSend}
            disabled={!input.trim() || isGenerating}
          >
            {isGenerating ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.sendBtnText}>➤</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {renderHistoryModal()}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  
  // Download Screen
  hero: { alignItems: 'center', paddingVertical: Spacing.xxl },
  heroIcon: { fontSize: 56, marginBottom: Spacing.md },
  heroTitle: { fontSize: Typography.size.xl, fontWeight: Typography.weight.heavy, color: Colors.textPrimary, letterSpacing: 4 },
  heroSub: { fontSize: Typography.size.sm, color: Colors.textSecondary, marginTop: Spacing.sm, textAlign: 'center', paddingHorizontal: Spacing.xl },
  downloadSection: { padding: Spacing.xl, alignItems: 'center' },
  downloadBtn: { backgroundColor: Colors.primary, paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md, borderRadius: Radius.full },
  downloadBtnText: { color: '#000', fontWeight: Typography.weight.bold, letterSpacing: 1 },
  progressContainer: { width: '100%', alignItems: 'center' },
  progressText: { color: Colors.primary, marginBottom: Spacing.sm, fontWeight: 'bold' },
  progressBarBg: { width: '100%', height: 12, backgroundColor: Colors.surfaceBorder, borderRadius: 6, overflow: 'hidden' },
  progressBarFill: { height: '100%', backgroundColor: Colors.primary },
  progressWarning: { color: Colors.warning, fontSize: Typography.size.xs, marginTop: Spacing.md },

  // Chat Interface
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBorder,
    backgroundColor: Colors.surface,
  },
  offlineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,255,0,0.1)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: 'rgba(0,255,0,0.3)',
  },
  offlineBadgeDot: { color: '#00FF00', fontSize: 10, marginRight: 6 },
  offlineBadgeText: { color: '#00FF00', fontSize: 10, fontWeight: 'bold', letterSpacing: 1 },
  historyBtn: { padding: Spacing.xs },
  historyBtnText: { color: Colors.textSecondary, fontSize: 12, fontWeight: 'bold' },

  chatContent: { padding: Spacing.md, paddingBottom: Spacing.xl },
  emptyChat: { alignItems: 'center', justifyContent: 'center', paddingVertical: 100 },
  emptyChatTitle: { color: Colors.textSecondary, fontSize: Typography.size.md, fontWeight: 'bold', letterSpacing: 2, marginBottom: Spacing.sm },
  emptyChatSub: { color: Colors.textTertiary, textAlign: 'center', paddingHorizontal: Spacing.xl, lineHeight: 20 },

  messageRow: { flexDirection: 'row', marginBottom: Spacing.lg, alignItems: 'flex-end' },
  messageRowUser: { justifyContent: 'flex-end' },
  messageRowAi: { justifyContent: 'flex-start' },
  avatarAi: { color: Colors.primary, fontSize: 20, marginRight: Spacing.sm, marginBottom: 4 },
  
  bubble: { maxWidth: '80%', padding: Spacing.md, borderRadius: Radius.lg },
  bubbleUser: { backgroundColor: Colors.primary, borderBottomRightRadius: 4 },
  bubbleAi: { backgroundColor: Colors.surfaceElevated, borderWidth: 1, borderColor: Colors.surfaceBorder, borderBottomLeftRadius: 4 },
  
  messageText: { fontSize: Typography.size.md, lineHeight: 22 },
  messageTextUser: { color: '#000', fontWeight: '500' },
  messageTextAi: { color: Colors.textPrimary },

  inputContainer: {
    flexDirection: 'row',
    padding: Spacing.md,
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderTopColor: Colors.surfaceBorder,
    alignItems: 'flex-end',
  },
  input: {
    flex: 1,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    borderRadius: Radius.md,
    color: Colors.textPrimary,
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    minHeight: 48,
    maxHeight: 120,
    fontSize: Typography.size.md,
  },
  sendBtn: {
    backgroundColor: Colors.primary,
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: Spacing.sm,
    ...Shadow.md,
  },
  sendBtnText: { color: '#000', fontSize: 18, paddingLeft: 2 },

  // History Modal
  modalContainer: { flex: 1, backgroundColor: Colors.background },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', padding: Spacing.lg, borderBottomWidth: 1, borderColor: Colors.surfaceBorder },
  modalTitle: { color: Colors.textPrimary, fontSize: Typography.size.lg, fontWeight: 'bold' },
  closeBtn: { color: Colors.primary, fontSize: Typography.size.md },
  newChatBtn: { margin: Spacing.lg, backgroundColor: Colors.surfaceElevated, padding: Spacing.md, borderRadius: Radius.md, alignItems: 'center', borderWidth: 1, borderColor: Colors.primary },
  newChatText: { color: Colors.primary, fontWeight: 'bold', letterSpacing: 1 },
  historyItem: { padding: Spacing.md, borderBottomWidth: 1, borderColor: Colors.surfaceBorder, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  historyItemActive: { backgroundColor: 'rgba(255,255,255,0.05)' },
  historyItemTitle: { color: Colors.textPrimary, fontSize: Typography.size.md, fontWeight: '500', marginBottom: 4 },
  historyItemDate: { color: Colors.textTertiary, fontSize: Typography.size.xs },
  emptyHistory: { color: Colors.textTertiary, textAlign: 'center', marginTop: Spacing.xl },
});
