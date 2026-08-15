/**
 * useMessageStore — chat messages, persisted to AsyncStorage.
 *
 * Messages are stored locally. Actual transmission happens via TransportManager.
 * This store is the source of truth for the UI.
 */

import { create } from 'zustand';
import type { Message } from '../domain/Message';
import { StorageService } from '../services/StorageService';

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
}

const SEEN_MESSAGES_KEY = 'seen_messages';
const MAX_SEEN = 5000;

export const useMessageStore = create<MessageState>((set, get) => ({
  messages: [],
  isLoaded: false,
  _seen: new Set<string>(),

  loadMessages: async () => {
    const [stored, seen] = await Promise.all([
      StorageService.get<Message[]>(STORAGE_KEY),
      StorageService.get<string[]>(SEEN_MESSAGES_KEY),
    ]);
    
    const messages = stored ?? [];
    const seenArray = seen ?? [];
    
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
      await StorageService.set(STORAGE_KEY, uniqueMessages);
    }
  },

  addMessage: async (message: Message) => {
    const messages = [message, ...get().messages].slice(0, MAX_MESSAGES);
    set({ messages });
    await StorageService.set(STORAGE_KEY, messages);
    await get().markMessageSeen(message.id);
  },

  updateMessageStatus: async (id: string, status: Message['status']) => {
    const messages = get().messages.map((m) =>
      m.id === id ? { ...m, status, updatedAt: new Date().toISOString() } : m
    );
    set({ messages });
    await StorageService.set(STORAGE_KEY, messages);
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
}));
