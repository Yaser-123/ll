/**
 * ITransport — the contract every transport adapter must implement.
 *
 * Concrete implementations (Bluetooth, Wi-Fi Direct, local Wi-Fi, etc.)
 * will live in separate modules and register themselves with TransportManager.
 *
 * NOTHING in this file assumes a specific transport technology.
 */

import type { Message } from '../domain/Message';
import type { Peer, TransportType } from '../domain/Peer';
import type { SosEvent } from '../domain/SosEvent';
import type { Location } from '../domain/Location';

/** Events emitted by a transport to the rest of the app */
export interface TransportEvents {
  onPeerDiscovered: (peer: Peer) => void;
  onPeerLost: (peerId: string) => void;
  onMessageReceived: (message: Message) => void;
  onMessageDelivered?: (messageId: string) => void;
  onSosReceived: (sos: SosEvent) => void;
  onLocationReceived: (location: Location) => void;
  onError: (error: Error) => void;
}

/** Lifecycle and capability state of a transport */
export type TransportState =
  | 'idle'               // Not started
  | 'starting'           // Initialising hardware / permissions
  | 'scanning'           // Actively discovering peers
  | 'connected'          // At least one peer connected
  | 'error'              // Fatal error, requires restart
  | 'unsupported'        // Hardware not available on this device
  | 'permission_denied'  // Runtime permissions refused by the user
  | 'unavailable';       // Native module not present (e.g. running in Expo Go)

export interface ITransport {
  /** Unique ID for this transport instance */
  readonly id: string;

  /** Stable identifier for this transport type */
  readonly type: TransportType;

  /** Human-readable label shown in the UI */
  readonly label: string;

  /** Current operational state */
  readonly state: TransportState;

  /**
   * Start the transport: request permissions, initialise hardware,
   * begin peer discovery.
   */
  start(events: TransportEvents): Promise<void>;

  /**
   * Stop the transport cleanly: disconnect all peers, release hardware.
   */
  stop(): Promise<void>;

  /**
   * Send a message to a specific peer or broadcast to all reachable peers.
   * Throws if the transport is not in 'scanning' or 'connected' state.
   */
  sendMessage(message: Message, recipientId?: string): Promise<void>;

  /**
   * Broadcast a location beacon to all reachable peers.
   */
  broadcastLocation(location: Location): Promise<void>;

  /**
   * Broadcast an SOS event to all reachable peers.
   */
  broadcastSos(sos: SosEvent): Promise<void>;

  /**
   * Returns a list of currently reachable peer IDs (may be empty).
   */
  getConnectedPeerIds(): string[];
}
