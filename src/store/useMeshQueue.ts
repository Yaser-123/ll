/**
 * useMeshQueue — Store-and-Forward queue for mesh routing.
 *
 * Persists messages that need to be relayed to other peers.
 * Transport layers (like BleTransport) query this when peers connect.
 */

import { create } from 'zustand';
import type { Message } from '../domain/Message';
import { StorageService } from '../services/StorageService';

const MESH_QUEUE_KEY = 'mesh_queue';
const MAX_QUEUE_SIZE = 1000;

interface MeshQueueState {
  queue: Message[];
  isLoaded: boolean;
  
  loadQueue: () => Promise<void>;
  enqueue: (message: Message) => Promise<void>;
  dequeueForPeer: (peerId: string) => Message[];
  removeMessage: (messageId: string) => Promise<void>;
}

export const useMeshQueue = create<MeshQueueState>((set, get) => ({
  queue: [],
  isLoaded: false,

  loadQueue: async () => {
    const stored = await StorageService.get<Message[]>(MESH_QUEUE_KEY) ?? [];
    set({ queue: stored, isLoaded: true });
  },

  enqueue: async (message: Message) => {
    const { queue } = get();
    // Do not queue duplicates
    if (queue.some((m) => m.id === message.id)) return;
    
    // Add to queue, respecting max limit
    const newQueue = [...queue, message].slice(-MAX_QUEUE_SIZE);
    set({ queue: newQueue });
    await StorageService.set(MESH_QUEUE_KEY, newQueue);
  },

  dequeueForPeer: (peerId: string) => {
    // Return messages specifically for this peer OR broadcast messages.
    // Note: We don't remove them here. The transport layer will remove them
    // once it successfully hands them off (or it might keep them for multipath relay).
    return get().queue.filter(
      (m) => m.recipientId === peerId || m.recipientId === 'broadcast'
    );
  },

  removeMessage: async (messageId: string) => {
    const newQueue = get().queue.filter((m) => m.id !== messageId);
    set({ queue: newQueue });
    await StorageService.set(MESH_QUEUE_KEY, newQueue);
  },
}));
