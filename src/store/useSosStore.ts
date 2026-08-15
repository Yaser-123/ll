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
  cancelledSosIds: string[];

  loadEvents: () => Promise<void>;
  addEvent: (event: SosEvent) => Promise<void>;
  updateStatus: (id: string, status: SosStatus) => Promise<void>;
  getActiveEvents: () => SosEvent[];
  getLocalEvents: () => SosEvent[];
}

export const useSosStore = create<SosState>((set, get) => ({
  events: [],
  isLoaded: false,
  cancelledSosIds: [],

  loadEvents: async () => {
    const stored = await StorageService.get<SosEvent[]>(STORAGE_KEY);
    const storedCancelled = await StorageService.get<string[]>('cancelled_sos_ids');
    set({ events: stored ?? [], cancelledSosIds: storedCancelled ?? [], isLoaded: true });
  },

  addEvent: async (event: SosEvent) => {
    if (get().cancelledSosIds.includes(event.id)) {
      console.log(`[useSosStore] Ignoring SOS ${event.id} because it was already cancelled.`);
      return;
    }
    
    // Deduplicate internally just in case
    const existing = get().events.find(e => e.id === event.id);
    if (existing) return;

    const events = [event, ...get().events];
    set({ events });
    await StorageService.set(STORAGE_KEY, events);
  },

  updateStatus: async (id: string, status: SosStatus) => {
    const isCancelled = status === 'resolved' || status === 'expired';
    const events = get().events.map((e) =>
      e.id === id ? { ...e, status, updatedAt: new Date().toISOString(), resolvedAt: isCancelled ? new Date().toISOString() : e.resolvedAt } : e
    );
    
    let cancelledSosIds = get().cancelledSosIds;
    if (isCancelled && !cancelledSosIds.includes(id)) {
      cancelledSosIds = [...cancelledSosIds, id];
      await StorageService.set('cancelled_sos_ids', cancelledSosIds);
    }
    
    set({ events, cancelledSosIds });
    await StorageService.set(STORAGE_KEY, events);
  },

  getActiveEvents: () =>
    get().events.filter((e) => e.status === 'active'),

  getLocalEvents: () =>
    get().events.filter((e) => e.isLocal),
}));
