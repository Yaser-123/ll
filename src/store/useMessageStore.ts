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
}

export const useMessageStore = create<MessageState>((set, get) => ({
  messages: [],
  isLoaded: false,

  loadMessages: async () => {
    const stored = await StorageService.get<Message[]>(STORAGE_KEY);
    set({ messages: stored ?? [], isLoaded: true });
  },

  addMessage: async (message: Message) => {
    if (get().messages.some((m) => m.id === message.id)) return;
    const messages = [message, ...get().messages].slice(0, MAX_MESSAGES);
    set({ messages });
    await StorageService.set(STORAGE_KEY, messages);
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
}));
