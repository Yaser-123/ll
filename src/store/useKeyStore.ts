import { create } from 'zustand';
import { StorageService } from '../services/StorageService';

const STORAGE_KEY = 'peer_keys';

interface PeerKeys {
  encryptionPublicKey: string;
  signingPublicKey: string;
}

interface KeyStoreState {
  keys: Record<string, PeerKeys>;
  isLoaded: boolean;
  loadKeys: () => Promise<void>;
  saveKeys: (peerId: string, keys: PeerKeys) => Promise<void>;
  getKeys: (peerId: string) => PeerKeys | undefined;
}

export const useKeyStore = create<KeyStoreState>((set, get) => ({
  keys: {},
  isLoaded: false,

  loadKeys: async () => {
    const stored = await StorageService.get<Record<string, PeerKeys>>(STORAGE_KEY);
    if (stored) {
      set({ keys: stored, isLoaded: true });
    } else {
      set({ isLoaded: true });
    }
  },

  saveKeys: async (peerId: string, newKeys: PeerKeys) => {
    const currentKeys = get().keys;
    const updated = { ...currentKeys, [peerId]: newKeys };
    set({ keys: updated });
    await StorageService.set(STORAGE_KEY, updated);
  },

  getKeys: (peerId: string) => {
    return get().keys[peerId];
  },
}));
