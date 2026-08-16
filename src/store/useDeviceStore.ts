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
  bluetoothState: string;

  // Actions
  initDevice: () => Promise<void>;
  setDisplayName: (name: string) => Promise<void>;
  updateNetworkStatus: (status: NetworkStatus) => void;
  setBluetoothState: (state: string) => void;
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
  bluetoothState: 'Unknown',

  initDevice: async () => {
    const [uuid, displayName] = await Promise.all([
      IdentityService.getDeviceId(),
      IdentityService.getDisplayName(),
    ]);
    // Use the 12-char shortId as the primary deviceId throughout the JS layer
    // so that peer store keys, conversationIds, and message senderIds all match.
    const deviceId = IdentityService.makeShortId(uuid);
    set({ deviceId, displayName, isInitialised: true });
  },

  setDisplayName: async (name: string) => {
    await IdentityService.setDisplayName(name);
    set({ displayName: name });
  },

  updateNetworkStatus: (status: NetworkStatus) => set({ networkStatus: status }),

  setBluetoothState: (state: string) => set({ bluetoothState: state }),
}));
