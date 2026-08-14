/**
 * useDeviceStore — device identity, settings, and network status.
 *
 * Persisted to AsyncStorage. Initialised once at app start via initDevice().
 */

import { create } from 'zustand';
import { IdentityService } from '../services/IdentityService';
import type { NetworkStatus } from '../network/TransportManager';

interface DeviceState {
  deviceId: string;
  displayName: string;
  isInitialised: boolean;
  networkStatus: NetworkStatus;

  // Actions
  initDevice: () => Promise<void>;
  setDisplayName: (name: string) => Promise<void>;
  updateNetworkStatus: (status: NetworkStatus) => void;
}

const defaultNetworkStatus: NetworkStatus = {
  isAnyTransportActive: false,
  activeTransports: [],
  totalConnectedPeers: 0,
};

export const useDeviceStore = create<DeviceState>((set) => ({
  deviceId: '',
  displayName: '',
  isInitialised: false,
  networkStatus: defaultNetworkStatus,

  initDevice: async () => {
    const [deviceId, displayName] = await Promise.all([
      IdentityService.getDeviceId(),
      IdentityService.getDisplayName(),
    ]);
    set({ deviceId, displayName, isInitialised: true });
  },

  setDisplayName: async (name: string) => {
    await IdentityService.setDisplayName(name);
    set({ displayName: name });
  },

  updateNetworkStatus: (status: NetworkStatus) => {
    set({ networkStatus: status });
  },
}));
