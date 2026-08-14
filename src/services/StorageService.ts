/**
 * StorageService — typed AsyncStorage wrappers.
 *
 * Provides simple get/set/remove helpers with JSON serialisation.
 * All keys are namespaced under 'lifeline:' to avoid collisions.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const PREFIX = 'lifeline:';

function key(name: string): string {
  return `${PREFIX}${name}`;
}

export const StorageService = {
  async get<T>(name: string): Promise<T | null> {
    try {
      const raw = await AsyncStorage.getItem(key(name));
      if (raw === null) return null;
      return JSON.parse(raw) as T;
    } catch (err) {
      console.error(`[StorageService] get("${name}") failed`, err);
      return null;
    }
  },

  async set<T>(name: string, value: T): Promise<void> {
    try {
      await AsyncStorage.setItem(key(name), JSON.stringify(value));
    } catch (err) {
      console.error(`[StorageService] set("${name}") failed`, err);
    }
  },

  async remove(name: string): Promise<void> {
    try {
      await AsyncStorage.removeItem(key(name));
    } catch (err) {
      console.error(`[StorageService] remove("${name}") failed`, err);
    }
  },

  async clearAll(): Promise<void> {
    try {
      const allKeys = await AsyncStorage.getAllKeys();
      const lifelineKeys = allKeys.filter((k) => k.startsWith(PREFIX));
      await AsyncStorage.multiRemove(lifelineKeys);
    } catch (err) {
      console.error('[StorageService] clearAll() failed', err);
    }
  },
};
