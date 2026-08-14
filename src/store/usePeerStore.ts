/**
 * usePeerStore — known mesh peers, persisted to AsyncStorage.
 *
 * Peers are added/updated by the transport layer when real BLE/Wi-Fi
 * modules are connected. For now the list starts empty.
 */

import { create } from 'zustand';
import type { Peer } from '../domain/Peer';
import { StorageService } from '../services/StorageService';

const STORAGE_KEY = 'peers';

interface PeerState {
  peers: Record<string, Peer>;
  isLoaded: boolean;

  loadPeers: () => Promise<void>;
  upsertPeer: (peer: Peer) => Promise<void>;
  removePeer: (peerId: string) => Promise<void>;
  markOffline: (peerId: string) => Promise<void>;
  getPeerById: (peerId: string) => Peer | undefined;
  getPeerList: () => Peer[];
}

export const usePeerStore = create<PeerState>((set, get) => ({
  peers: {},
  isLoaded: false,

  loadPeers: async () => {
    const stored = await StorageService.get<Record<string, Peer>>(STORAGE_KEY);
    // On load, mark all peers as offline until transport confirms otherwise
    const peers: Record<string, Peer> = {};
    if (stored) {
      for (const id of Object.keys(stored)) {
        peers[id] = { ...stored[id], status: 'offline' };
      }
    }
    set({ peers, isLoaded: true });
  },

  upsertPeer: async (peer: Peer) => {
    const peers = { ...get().peers, [peer.id]: peer };
    set({ peers });
    await StorageService.set(STORAGE_KEY, peers);
  },

  removePeer: async (peerId: string) => {
    const peers = { ...get().peers };
    delete peers[peerId];
    set({ peers });
    await StorageService.set(STORAGE_KEY, peers);
  },

  markOffline: async (peerId: string) => {
    const peer = get().peers[peerId];
    if (!peer) return;
    const updated = { ...peer, status: 'offline' as const, lastSeen: new Date().toISOString() };
    const peers = { ...get().peers, [peerId]: updated };
    set({ peers });
    await StorageService.set(STORAGE_KEY, peers);
  },

  getPeerById: (peerId: string) => get().peers[peerId],

  getPeerList: () => Object.values(get().peers),
}));
