/**
 * useLocationStore — GPS location beacons for self and peers.
 *
 * Actual GPS acquisition will be added as a separate module.
 * For now this stores manually provided or mock locations.
 */

import { create } from 'zustand';
import type { Location } from '../domain/Location';
import { StorageService } from '../services/StorageService';

const STORAGE_KEY = 'locations';

interface LocationState {
  locations: Record<string, Location>; // keyed by deviceId
  isLoaded: boolean;

  loadLocations: () => Promise<void>;
  upsertLocation: (location: Location) => Promise<void>;
  getSelfLocation: (selfDeviceId: string) => Location | undefined;
  getAllLocations: () => Location[];
}

export const useLocationStore = create<LocationState>((set, get) => ({
  locations: {},
  isLoaded: false,

  loadLocations: async () => {
    const stored = await StorageService.get<Record<string, Location>>(STORAGE_KEY);
    set({ locations: stored ?? {}, isLoaded: true });
  },

  upsertLocation: async (location: Location) => {
    const locations = { ...get().locations, [location.deviceId]: location };
    set({ locations });
    await StorageService.set(STORAGE_KEY, locations);
  },

  getSelfLocation: (selfDeviceId: string) => get().locations[selfDeviceId],

  getAllLocations: () => Object.values(get().locations),
}));
