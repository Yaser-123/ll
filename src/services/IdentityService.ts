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
  /**
   * Returns the stable device UUID AND derives the 12-char shortId used
   * as the primary identity throughout the JS layer.
   */
  async getDeviceId(): Promise<string> {
    try {
      const existing = await SecureStore.getItemAsync(SECURE_KEY_DEVICE_ID);
      if (existing) return existing;

      const newId = generateUUID();
      await SecureStore.setItemAsync(SECURE_KEY_DEVICE_ID, newId);
      return newId;
    } catch (err) {
      console.warn('[IdentityService] SecureStore unavailable, using AsyncStorage fallback', err);
      const fallback = await StorageService.get<string>('device_id_fallback');
      if (fallback) return fallback;
      const newId = generateUUID();
      await StorageService.set('device_id_fallback', newId);
      return newId;
    }
  },

  /**
   * Derives the 12-character short ID from the full UUID.
   * This is the identifier used throughout the JS layer (peer store keys,
   * conversation IDs, senderId in messages).
   * e.g. "e267410a-a081-4621-b7e7-460cb004ed07" → "E267410AA081"
   */
  makeShortId(uuid: string): string {
    return uuid.replace(/-/g, '').slice(0, 12).toUpperCase();
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
