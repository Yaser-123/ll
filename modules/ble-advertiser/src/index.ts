/**
 * lifeline-ble-advertiser — TypeScript interface for the native BLE advertiser module.
 *
 * On Android: wraps BluetoothLeAdvertiser (API 21+).
 * On iOS: wraps CBPeripheralManager.
 *
 * This module is a LOCAL Expo native module (not published to npm).
 * It is discovered by expo-modules-core auto-linking during `expo prebuild`.
 *
 * Usage:
 *   import * as BleAdvertiser from 'lifeline-ble-advertiser';
 *   await BleAdvertiser.startAdvertising(SERVICE_UUID, localName);
 *   // ... app running ...
 *   await BleAdvertiser.stopAdvertising();
 */

import { requireNativeModule, EventEmitter } from 'expo-modules-core';

// The native module registered under the name 'BleAdvertiser' in both
// BleAdvertiserModule.kt and BleAdvertiserModule.swift.
const NativeModule = (() => {
  try {
    return requireNativeModule('BleAdvertiser');
  } catch {
    // Module not available (e.g., in Expo Go or during JS-only tests)
    return null;
  }
})();

const emitter = NativeModule ? new EventEmitter(NativeModule) : null;

/**
 * Start BLE advertising with the given service UUID and local name.
 *
 * The local name appears in the BLE scan response and is how other
 * Lifeline devices identify this device. Format: LF:<shortId>:<displayName>
 *
 * @param serviceUuid  128-bit UUID string in canonical format (8-4-4-4-12).
 *                     Other Lifeline devices scan for this UUID.
 * @param localName    The Lifeline-encoded local name for identity.
 *                     On Android this temporarily sets the BT adapter name
 *                     (restored on stopAdvertising). On iOS it sets the
 *                     CBAdvertisementDataLocalNameKey without side effects.
 *
 * @throws If BLE is not available or powered off.
 * @throws If BLUETOOTH_ADVERTISE permission is denied (Android 12+).
 */
export async function startAdvertising(
  serviceUuid: string,
  localName: string
): Promise<void> {
  if (!NativeModule) {
    console.warn(
      '[BleAdvertiser] Native module not available. ' +
        'Run expo prebuild and build a development build to use BLE advertising.'
    );
    return;
  }
  return NativeModule.startAdvertising(serviceUuid, localName);
}

/**
 * Stop BLE advertising and restore the system Bluetooth device name (Android).
 * Safe to call even if startAdvertising was never called.
 */
export async function stopAdvertising(): Promise<void> {
  if (!NativeModule) return;
  return NativeModule.stopAdvertising();
}

/**
 * Returns true if the native module is available (i.e., running in a
 * development build, not Expo Go).
 */
export function isAvailable(): boolean {
  return NativeModule !== null;
}

/**
 * Add a listener for incoming messages from connected peers.
 */
export function addMessageListener(
  listener: (event: { payload: string }) => void
) {
  if (!emitter) return { remove: () => {} };
  return emitter.addListener('onMessageReceived', listener);
}
