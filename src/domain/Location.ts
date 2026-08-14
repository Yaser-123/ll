/**
 * Domain model: Location
 * A GPS location beacon broadcast by a peer or the local device.
 */

export interface Location {
  /** UUID of the device that produced this beacon */
  deviceId: string;

  latitude: number;
  longitude: number;

  /** Accuracy in metres */
  accuracy?: number;

  /** Altitude in metres */
  altitude?: number;

  /** Heading in degrees (0–360) */
  heading?: number;

  /** Speed in m/s */
  speed?: number;

  /** ISO timestamp of the GPS fix */
  timestamp: string;

  /** Whether this is the local device's own location */
  isSelf: boolean;
}

export function createLocation(
  deviceId: string,
  coords: Pick<Location, 'latitude' | 'longitude' | 'accuracy' | 'altitude' | 'heading' | 'speed'>,
  isSelf: boolean = false
): Location {
  return {
    deviceId,
    ...coords,
    timestamp: new Date().toISOString(),
    isSelf,
  };
}
