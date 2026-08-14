/**
 * Domain model: Peer
 * Represents another Lifeline device discovered on the mesh network.
 */

export type TransportType = 'bluetooth' | 'wifi_direct' | 'local_wifi' | 'unknown';

export type PeerStatus = 'online' | 'offline' | 'idle' | 'unknown';

export interface Peer {
  /** Stable device UUID generated at first launch */
  id: string;

  /** Human-readable device name chosen by the user */
  displayName: string;

  /** Which transport this peer was discovered via */
  transport: TransportType;

  /** Connection status */
  status: PeerStatus;

  /** Signal strength -100 (weakest) to 0 (strongest), null if unknown */
  rssi: number | null;

  /** ISO timestamp of last observed activity */
  lastSeen: string;

  /** ISO timestamp of first discovery */
  firstSeen: string;

  /** Approximate GPS location if the peer is broadcasting it */
  location?: {
    latitude: number;
    longitude: number;
    accuracy?: number;
  };
}

export function createPeer(partial: Pick<Peer, 'id' | 'displayName' | 'transport'>): Peer {
  const now = new Date().toISOString();
  return {
    ...partial,
    status: 'unknown',
    rssi: null,
    lastSeen: now,
    firstSeen: now,
  };
}
