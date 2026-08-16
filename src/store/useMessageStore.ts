/**
 * useMessageStore — chat messages, persisted to AsyncStorage.
 *
 * Messages are stored locally. Actual transmission happens via TransportManager.
 * This store is the source of truth for the UI.
 */

import { create } from 'zustand';
import type { Message } from '../domain/Message';
import { StorageService } from '../services/StorageService';
import { CryptoService } from '../services/CryptoService';
import { IdentityService } from '../services/IdentityService';

const STORAGE_KEY = 'messages';
const MAX_MESSAGES = 500; // Keep the last 500 messages to limit storage

interface MessageState {
  messages: Message[];
  isLoaded: boolean;

  loadMessages: () => Promise<void>;
  addMessage: (message: Message) => Promise<void>;
  updateMessageStatus: (id: string, status: Message['status']) => Promise<void>;
  getConversation: (conversationId: string) => Message[];
  getAllConversations: () => string[];

  // Mesh loop prevention
  hasSeenMessage: (id: string) => boolean;
  markMessageSeen: (id: string) => Promise<void>;
  _persistMessages: (messages: Message[]) => Promise<void>;
  clearConversation: (conversationId: string) => Promise<void>;
}

const SEEN_MESSAGES_KEY = 'seen_messages';
const MAX_SEEN = 5000;

export const useMessageStore = create<MessageState>((set, get) => ({
  messages: [],
  isLoaded: false,
  _seen: new Set<string>(),

  loadMessages: async () => {
    const [stored, seen, encKeyPair] = await Promise.all([
      StorageService.get<Message[]>(STORAGE_KEY),
      StorageService.get<string[]>(SEEN_MESSAGES_KEY),
      IdentityService.getEncryptionKeyPair()
    ]);
    
    let messages = stored ?? [];
    const seenArray = seen ?? [];
    
    // Decrypt messages at rest
    messages = messages.map(m => {
      if (m.type === 'text' && m.recipientId !== 'broadcast' && m.encrypted && m.text) {
        // At rest, DMs are encrypted with the local device's public key
        const decrypted = CryptoService.decryptDM(m.text, encKeyPair.publicKey, encKeyPair.secretKey);
        if (decrypted) {
          return { ...m, text: decrypted, encrypted: false };
        }
      }
      return m;
    });

    // Deduplicate any corrupted data from older buggy versions
    const uniqueMessages = Array.from(new Map(messages.map((m) => [m.id, m])).values());
    
    // Initialize seen set with stored seen + IDs of all stored messages
    const uniqueSeen = new Set([...seenArray, ...uniqueMessages.map(m => m.id)]);
    
    set({ 
      messages: uniqueMessages, 
      isLoaded: true,
      _seen: uniqueSeen 
    } as Partial<MessageState>);

    // Auto-heal local storage
    if (uniqueMessages.length !== messages.length) {
      get()._persistMessages(uniqueMessages);
    }
  },

  _persistMessages: async (messagesToSave: Message[]) => {
    const encKeyPair = await IdentityService.getEncryptionKeyPair();
    const encryptedMessages = messagesToSave.map(m => {
      if (m.type === 'text' && m.recipientId !== 'broadcast' && m.text && !m.encrypted) {
        // Encrypt using our own keypair so only this device can decrypt the local database
        const cipher = CryptoService.encryptDM(m.text, encKeyPair.publicKey, encKeyPair.secretKey);
        return { ...m, text: cipher, encrypted: true };
      }
      return m;
    });
    await StorageService.set(STORAGE_KEY, encryptedMessages);
  },

  addMessage: async (message: Message) => {
    const messages = [message, ...get().messages].slice(0, MAX_MESSAGES);
    set({ messages });
    await (get() as any)._persistMessages(messages);
    await get().markMessageSeen(message.id);
  },

  updateMessageStatus: async (id: string, status: Message['status']) => {
    const messages = get().messages.map((m) =>
      m.id === id ? { ...m, status, updatedAt: new Date().toISOString() } : m
    );
    set({ messages });
    await (get() as any)._persistMessages(messages);
  },

  getConversation: (conversationId: string) =>
    get()
      .messages.filter((m) => m.conversationId === conversationId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),

  getAllConversations: () => {
    const ids = new Set(get().messages.map((m) => m.conversationId));
    return Array.from(ids);
  },

  hasSeenMessage: (id: string) => {
    return (get() as any)._seen.has(id);
  },

  markMessageSeen: async (id: string) => {
    const state = get() as any;
    if (state._seen.has(id)) return;
    
    const newSeen = new Set(state._seen);
    newSeen.add(id);
    set({ _seen: newSeen } as Partial<MessageState>);

    // Only persist periodically or limit size
    if (newSeen.size % 10 === 0) {
      await StorageService.set(SEEN_MESSAGES_KEY, Array.from(newSeen).slice(-MAX_SEEN));
    }
  },

  clearConversation: async (conversationId: string) => {
    const messages = get().messages.filter(m => m.conversationId !== conversationId);
    set({ messages });
    await (get() as any)._persistMessages(messages);
  },
}));
