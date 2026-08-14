/**
 * useSosStore — SOS events (local and received), persisted to AsyncStorage.
 *
 * Local creation is functional. Transmission to peers is a stub until
 * the real transport module is connected.
 */

import { create } from 'zustand';
import type { SosEvent, SosStatus } from '../domain/SosEvent';
import { StorageService } from '../services/StorageService';

const STORAGE_KEY = 'sos_events';

interface SosState {
  events: SosEvent[];
  isLoaded: boolean;

  loadEvents: () => Promise<void>;
  addEvent: (event: SosEvent) => Promise<void>;
  updateStatus: (id: string, status: SosStatus) => Promise<void>;
  getActiveEvents: () => SosEvent[];
  getLocalEvents: () => SosEvent[];
}

export const useSosStore = create<SosState>((set, get) => ({
  events: [],
  isLoaded: false,

  loadEvents: async () => {
    const stored = await StorageService.get<SosEvent[]>(STORAGE_KEY);
    set({ events: stored ?? [], isLoaded: true });
  },

  addEvent: async (event: SosEvent) => {
    const events = [event, ...get().events];
    set({ events });
    await StorageService.set(STORAGE_KEY, events);
  },

  updateStatus: async (id: string, status: SosStatus) => {
    const events = get().events.map((e) =>
      e.id === id ? { ...e, status, updatedAt: new Date().toISOString() } : e
    );
    set({ events });
    await StorageService.set(STORAGE_KEY, events);
  },

  getActiveEvents: () =>
    get().events.filter((e) => e.status === 'active'),

  getLocalEvents: () =>
    get().events.filter((e) => e.isLocal),
}));
