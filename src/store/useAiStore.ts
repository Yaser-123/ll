import { create } from 'zustand';
import { StorageService } from '../services/StorageService';
import type { Conversation, AiMessage } from '../services/AiService';
import uuid from 'react-native-uuid';

const STORAGE_KEY = 'ai_conversations';

interface AiState {
  conversations: Conversation[];
  activeConversationId: string | null;
  isLoaded: boolean;

  loadConversations: () => Promise<void>;
  createConversation: () => string;
  setActiveConversation: (id: string | null) => void;
  addMessage: (conversationId: string, message: Omit<AiMessage, 'id'>) => Promise<void>;
  updateMessage: (conversationId: string, messageId: string, updater: (msg: AiMessage) => AiMessage) => Promise<void>;
  deleteConversation: (id: string) => Promise<void>;
  getActiveConversation: () => Conversation | undefined;
}

export const useAiStore = create<AiState>((set, get) => ({
  conversations: [],
  activeConversationId: null,
  isLoaded: false,

  loadConversations: async () => {
    const stored = await StorageService.get<Conversation[]>(STORAGE_KEY);
    const conversations = stored ?? [];
    set({
      conversations,
      isLoaded: true,
      activeConversationId: conversations.length > 0 ? conversations[0].id : null,
    });
  },

  createConversation: () => {
    const id = uuid.v4() as string;
    const newConv: Conversation = {
      id,
      title: 'New Conversation',
      updatedAt: new Date().toISOString(),
      messages: [],
    };
    
    set((state) => {
      const conversations = [newConv, ...state.conversations];
      StorageService.set(STORAGE_KEY, conversations);
      return { conversations, activeConversationId: id };
    });
    
    return id;
  },

  setActiveConversation: (id: string | null) => {
    set({ activeConversationId: id });
  },

  addMessage: async (conversationId: string, messageData: Omit<AiMessage, 'id'>) => {
    const message: AiMessage = { ...messageData, id: uuid.v4() as string };
    
    set((state) => {
      const conversations = state.conversations.map((conv) => {
        if (conv.id === conversationId) {
          // If this is the first user message, generate a title
          let title = conv.title;
          if (conv.messages.length === 0 && message.role === 'user') {
            title = message.text.substring(0, 30) + (message.text.length > 30 ? '...' : '');
          }
          
          return {
            ...conv,
            title,
            updatedAt: new Date().toISOString(),
            messages: [...conv.messages, message],
          };
        }
        return conv;
      });
      
      // Sort so most recent is at the top
      conversations.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      
      StorageService.set(STORAGE_KEY, conversations);
      return { conversations };
    });
  },

  updateMessage: async (conversationId: string, messageId: string, updater: (msg: AiMessage) => AiMessage) => {
    set((state) => {
      const conversations = state.conversations.map((conv) => {
        if (conv.id === conversationId) {
          return {
            ...conv,
            messages: conv.messages.map((m) => (m.id === messageId ? updater(m) : m)),
          };
        }
        return conv;
      });
      StorageService.set(STORAGE_KEY, conversations);
      return { conversations };
    });
  },

  deleteConversation: async (id: string) => {
    set((state) => {
      const conversations = state.conversations.filter(c => c.id !== id);
      let activeId = state.activeConversationId;
      if (activeId === id) {
        activeId = conversations.length > 0 ? conversations[0].id : null;
      }
      StorageService.set(STORAGE_KEY, conversations);
      return { conversations, activeConversationId: activeId };
    });
  },

  getActiveConversation: () => {
    const state = get();
    return state.conversations.find((c) => c.id === state.activeConversationId);
  },
}));
