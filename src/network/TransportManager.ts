/**
 * TransportManager — aggregates multiple ITransport instances.
 *
 * The rest of the app talks to TransportManager, not to individual transports.
 * When Bluetooth or Wi-Fi Direct modules are ready, register them here.
 *
 * Module 2: BleTransport is registered in app/_layout.tsx after identity init.
 */

import type { ITransport, TransportEvents, TransportState } from './ITransport';
import type { Message } from '../domain/Message';
import type { Location } from '../domain/Location';
import type { SosEvent } from '../domain/SosEvent';
import { useMeshQueue } from '../store/useMeshQueue';


export interface NetworkStatus {
  isAnyTransportActive: boolean;
  activeTransports: Array<{ label: string; state: TransportState }>;
  totalConnectedPeers: number;
}

class TransportManager {
  private transports: ITransport[] = [];
  private events: TransportEvents | null = null;

  constructor() {
    // No default transport — transports are registered explicitly.
    // BleTransport is registered in app/_layout.tsx after identity initialisation.
    this.transports = [];
  }

  /**
   * Register a new transport adapter.
   * Call this before start() or at any time — manager will auto-start it.
   */
  registerTransport(transport: ITransport): void {
    if (!this.transports.some((t) => t.id === transport.id)) {
      this.transports.push(transport);
    }
    if (this.events) {
      // Already running — start the new transport immediately
      transport.start(this.events).catch(console.error);
    }
  }

  /**
   * Start all registered transports. Pass event handlers to receive
   * incoming peers, messages, SOS alerts and location beacons.
   */
  async start(events: TransportEvents): Promise<void> {
    this.events = events;
    await Promise.allSettled(
      this.transports.map((t) => t.start(events).catch(console.error))
    );
  }

  /** Stop all transports cleanly */
  async stop(): Promise<void> {
    await Promise.allSettled(this.transports.map((t) => t.stop()));
    this.events = null;
  }

  /** Send a message via all active transports */
  async sendMessage(message: Message, recipientId?: string): Promise<void> {
    // Persist locally generated messages to the mesh queue so they survive app reloads
    // while waiting for a peer to come online.
    await useMeshQueue.getState().enqueue(message);

    await Promise.allSettled(
      this.transports.map((t) => t.sendMessage(message, recipientId))
    );
  }

  /** Broadcast location to all peers via all transports */
  async broadcastLocation(location: Location): Promise<void> {
    await Promise.allSettled(
      this.transports.map((t) => t.broadcastLocation(location))
    );
  }

  /** Broadcast SOS to all peers via all transports */
  async broadcastSos(sos: SosEvent): Promise<void> {
    await Promise.allSettled(
      this.transports.map((t) => t.broadcastSos(sos))
    );
  }

  /** Aggregate connection status across all transports */
  getNetworkStatus(): NetworkStatus {
    const activeTransports = this.transports.map((t) => ({
      label: t.label,
      state: t.state,
    }));
    const totalConnectedPeers = this.transports
      .flatMap((t) => t.getConnectedPeerIds())
      .filter((id, i, arr) => arr.indexOf(id) === i).length; // deduplicate

    return {
      isAnyTransportActive: this.transports.some(
        (t) => t.state === 'scanning' || t.state === 'connected'
      ),
      activeTransports,
      totalConnectedPeers,
    };
  }
}

// Singleton — import this instance throughout the app
export const transportManager = new TransportManager();
