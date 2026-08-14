/**
 * PermissionService — BLE permission management for Android.
 *
 * iOS BLE permissions are handled automatically by the OS when
 * CBCentralManager / CBPeripheralManager are created. The system
 * shows its own dialog using NSBluetoothAlwaysUsageDescription.
 *
 * Android requires explicit runtime permission requests:
 *   - Android 12+ (API 31+): BLUETOOTH_SCAN, BLUETOOTH_CONNECT, BLUETOOTH_ADVERTISE
 *   - Android 6–11:          ACCESS_FINE_LOCATION (required for BLE scan)
 */
import { Platform, PermissionsAndroid } from 'react-native';

export type PermissionStatus = 'granted' | 'denied' | 'unavailable';

/**
 * Request all Bluetooth permissions required for BLE scanning and advertising.
 *
 * @returns 'granted'     — all required permissions granted, BLE can proceed
 * @returns 'denied'      — one or more permissions denied by the user
 * @returns 'unavailable' — not Android, no runtime permissions needed
 */
export async function requestBlePermissions(): Promise<PermissionStatus> {
  if (Platform.OS !== 'android') {
    // iOS: permissions requested automatically by CBCentralManager/CBPeripheralManager
    return 'unavailable';
  }

  const apiLevel =
    typeof Platform.Version === 'number'
      ? Platform.Version
      : parseInt(Platform.Version as string, 10);

  if (apiLevel >= 31) {
    // Android 12+ (API 31+): New granular BLE permissions
    // BLUETOOTH_SCAN: required to scan for BLE devices
    // BLUETOOTH_CONNECT: required to establish connections (and read device info)
    // BLUETOOTH_ADVERTISE: required to advertise as a BLE peripheral
    //
    // NOTE: BLUETOOTH_SCAN with neverForLocation means location data is NOT
    // used even if location permission is absent. Required on API 31+.
    const results = await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADVERTISE,
    ]);

    const allGranted = Object.values(results).every(
      (r) => r === PermissionsAndroid.RESULTS.GRANTED
    );

    return allGranted ? 'granted' : 'denied';
  } else {
    // Android 6–11: Location permission required for BLE scanning
    const result = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      {
        title: 'Location Permission Required',
        message:
          'LIFELINE needs Location permission to discover nearby emergency ' +
          'devices over Bluetooth. Your location is never uploaded — this ' +
          'permission is only used for local Bluetooth scanning.',
        buttonPositive: 'Grant',
        buttonNegative: 'Deny',
        buttonNeutral: 'Ask Me Later',
      }
    );

    return result === PermissionsAndroid.RESULTS.GRANTED ? 'granted' : 'denied';
  }
}

/**
 * Check whether BLE permissions are currently granted (without prompting).
 * Useful for displaying permission status in the UI before attempting to start BLE.
 */
export async function checkBlePermissions(): Promise<PermissionStatus> {
  if (Platform.OS !== 'android') return 'unavailable';

  const apiLevel =
    typeof Platform.Version === 'number'
      ? Platform.Version
      : parseInt(Platform.Version as string, 10);

  if (apiLevel >= 31) {
    const [scan, connect, advertise] = await Promise.all([
      PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN),
      PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT),
      PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADVERTISE),
    ]);
    return scan && connect && advertise ? 'granted' : 'denied';
  } else {
    const location = await PermissionsAndroid.check(
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
    );
    return location ? 'granted' : 'denied';
  }
}
