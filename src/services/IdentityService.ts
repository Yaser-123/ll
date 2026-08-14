/**
 * IdentityService — manages the persistent device identity.
 *
 * The device UUID is generated once at first launch and stored in
 * expo-secure-store (hardware-backed keychain where available).
 * The display name is stored in AsyncStorage (user-editable).
 *
 * GENUINE FUNCTIONALITY: UUID persists across app restarts via SecureStore.
 */

import * as SecureStore from 'expo-secure-store';
import { StorageService } from './StorageService';

const SECURE_KEY_DEVICE_ID = 'device_id';
const STORAGE_KEY_DEVICE_NAME = 'device_name';

function generateUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function generateDefaultName(): string {
  const adjectives = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Golf', 'Hotel'];
  const suffix = Math.floor(Math.random() * 9000) + 1000;
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  return `${adj}-${suffix}`;
}

export const IdentityService = {
  /**
   * Returns the stable device UUID.
   * Creates and persists a new one on first call.
   */
  async getDeviceId(): Promise<string> {
    try {
      const existing = await SecureStore.getItemAsync(SECURE_KEY_DEVICE_ID);
      if (existing) return existing;

      const newId = generateUUID();
      await SecureStore.setItemAsync(SECURE_KEY_DEVICE_ID, newId);
      return newId;
    } catch (err) {
      // SecureStore unavailable (simulator, web) — fall back to AsyncStorage
      console.warn('[IdentityService] SecureStore unavailable, using AsyncStorage fallback', err);
      const fallback = await StorageService.get<string>('device_id_fallback');
      if (fallback) return fallback;
      const newId = generateUUID();
      await StorageService.set('device_id_fallback', newId);
      return newId;
    }
  },

  /**
   * Returns the user's chosen display name.
   * Creates a random call-sign name on first launch.
   */
  async getDisplayName(): Promise<string> {
    const stored = await StorageService.get<string>(STORAGE_KEY_DEVICE_NAME);
    if (stored) return stored;

    const name = generateDefaultName();
    await StorageService.set(STORAGE_KEY_DEVICE_NAME, name);
    return name;
  },

  /**
   * Persist a new user-chosen display name.
   */
  async setDisplayName(name: string): Promise<void> {
    await StorageService.set(STORAGE_KEY_DEVICE_NAME, name.trim());
  },
};
