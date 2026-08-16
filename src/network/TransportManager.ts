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
import { useKeyStore } from '../store/useKeyStore';
import { CryptoService } from '../services/CryptoService';
import { IdentityService } from '../services/IdentityService';


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
  async sendMessage(msg: Message, recipientId?: string): Promise<void> {
    
    // Clone to prevent mutating UI state when encrypting or signing
    const message = { ...msg };

    // 1. Encrypt E2E DMs
    if (message.type === 'text' && message.recipientId !== 'broadcast' && !message.encrypted && message.text) {
      const peerKeys = useKeyStore.getState().getKeys(message.recipientId);
      if (!peerKeys) {
        // We do not have the key yet. Queue it as plaintext for later retries.
        await useMeshQueue.getState().enqueue(message);
        console.log(`[TransportManager] Queued DM for ${message.recipientId}, awaiting public key.`);
        return;
      }
      
      try {
        const myEncKeys = await IdentityService.getEncryptionKeyPair();
        message.text = CryptoService.encryptDM(message.text, peerKeys.encryptionPublicKey, myEncKeys.secretKey);
        message.encrypted = true;
      } catch (err) {
        console.error('[TransportManager] Failed to encrypt message', err);
        return;
      }
    }

    // 2. Sign for Integrity
    if (!message.signature) {
      try {
        const mySignKeys = await IdentityService.getSigningKeyPair();
        const payloadToSign = CryptoService.canonicalizeMessage(message);
        message.signature = CryptoService.signPayload(payloadToSign, mySignKeys.secretKey);
      } catch (err) {
        console.error('[TransportManager] Failed to sign message', err);
        return;
      }
    }

    // 3. Persist network-ready packet to mesh queue
    await useMeshQueue.getState().enqueue(message);

    // 4. Dispatch to hardware
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

  /** Broadcast SOS to all peers via all transports by wrapping it in the mesh Message protocol */
  async broadcastSos(sos: SosEvent): Promise<void> {
    const message: Message = {
      id: sos.id, // Bind Message ID to SOS ID for perfect mesh deduplication
      senderId: sos.originatorId,
      recipientId: 'broadcast',
      conversationId: 'broadcast',
      type: 'sos_relay',
      text: JSON.stringify(sos),
      status: 'pending',
      hopCount: sos.hopCount,
      maxHops: 5, // High priority mesh flood
      createdAt: sos.createdAt,
      updatedAt: sos.updatedAt,
    };
    await this.sendMessage(message);
  }

  /** Broadcast SOS cancellation to all peers */
  async broadcastSosCancel(sosId: string, senderId: string): Promise<void> {
    const now = new Date().toISOString();
    const message: Message = {
      id: `${sosId}-cancel`, 
      senderId: senderId,
      recipientId: 'broadcast',
      conversationId: 'broadcast',
      type: 'sos_cancel',
      text: JSON.stringify({ sosId }),
      status: 'pending',
      hopCount: 0,
      maxHops: 5,
      createdAt: now,
      updatedAt: now,
    };
    await this.sendMessage(message);
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
