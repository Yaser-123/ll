/**
 * BleTransport — Real Bluetooth Low Energy peer discovery for Lifeline.
 *
 * Implements ITransport using two native capabilities:
 *   SCANNING:    react-native-ble-plx (BLE Central role)
 *   ADVERTISING: lifeline-ble-advertiser custom module (BLE Peripheral role)
 *
 * Discovery is entirely passive — no BLE connection is required.
 * Peers are identified by parsing the BLE advertisement local name.
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * Advertisement protocol:
 *
 *   Advertisement packet  → Lifeline service UUID (scanner filter key)
 *   Scan response packet  → local name = "LF:<12hexChars>:<displayName>"
 *
 *   Example: "LF:6C6966656C69:Alpha-1337"
 *     - "LF:"          = 3-byte Lifeline prefix
 *     - "6C6966656C69" = first 12 hex chars of device UUID (48 bits unique)
 *     - "Alpha-1337"   = display name (up to 13 chars)
 *
 *   Total local name: ≤ 29 bytes — fits within BLE scan response (31 bytes)
 * ──────────────────────────────────────────────────────────────────────────────
 *
 * Lifecycle:
 *   start() → request permissions → wait for BT powered on
 *           → start advertising → start scanning → start stale-peer pruner
 *   stop()  → stop scanning → stop advertising → clear timers
 *           → emit onPeerLost for all active peers
 *
 * Battery management:
 *   - Scan mode: LOW_POWER on Android (duty cycle managed by OS)
 *   - Advertisement: LOW_POWER on Android
 *   - Scan session restarted every 3 minutes to avoid Android resource exhaustion
 *   - Stale peer check every 10 seconds (lightweight Map iteration)
 *
 * Limitations clearly stated:
 *   - iOS: advertising stops when app is backgrounded (Apple policy)
 *   - Requires a development build (not Expo Go)
 *   - BLE advertising not supported on some Android emulators / low-end devices
 *   - Message sending is NOT implemented in this module (discovery only)
 */

import { Platform } from 'react-native';
import { BleManager, State, type Device, type Subscription } from 'react-native-ble-plx';
import * as BleAdvertiser from 'lifeline-ble-advertiser';
import { Buffer } from 'buffer';
import { requestBlePermissions } from '../services/PermissionService';
import type { ITransport, TransportEvents, TransportState } from './ITransport';
import type { Peer, TransportType } from '../domain/Peer';
import type { Message } from '../domain/Message';
import { makeConversationId } from '../domain/Message';
import { useMeshQueue } from '../store/useMeshQueue';
import type { Location } from '../domain/Location';
import type { SosEvent } from '../domain/SosEvent';

// ────────────────────────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────────────────────────

/**
 * Custom 128-bit Lifeline service UUID.
 * "6C696665" = "life" in ASCII hex, "6C69" = "li", "6E65" = "ne"
 * This UUID is unique to Lifeline and is used to filter BLE scan results.
 */
const LIFELINE_SERVICE_UUID = '6C696665-6C69-6E65-0001-000000000001';

/** GATT Service UUID for Messaging */
const MESSAGING_SERVICE_UUID = '6C696665-6C69-6E65-0002-000000000001';

/** GATT Characteristic UUID for Writing Messages */
const WRITE_CHARACTERISTIC_UUID = '6C696665-6C69-6E65-0003-000000000001';

/** Prefix that all Lifeline BLE local names must start with. */
const LOCAL_NAME_PREFIX = 'LF:';

/** Number of hex characters from the device UUID used as the short peer ID. */
const SHORT_ID_LENGTH = 12;

/** Mark a peer offline if no advertisement received in this window. */
const PEER_TIMEOUT_MS = 30_000; // 30 seconds

/** How often to prune stale peers. */
const STALE_CHECK_INTERVAL_MS = 10_000; // 10 seconds

/**
 * Restart BLE scan session every N ms to prevent Android from silently
 * throttling or stopping a long-running scan (documented Android behaviour).
 */
const SCAN_RESTART_INTERVAL_MS = 180_000; // 3 minutes

// ────────────────────────────────────────────────────────────────────────────
// Identity encoding helpers
// ────────────────────────────────────────────────────────────────────────────

/**
 * Derive the 12-character short ID from a full Lifeline device UUID.
 * Removes dashes and takes the first 12 hex characters (48 bits of uniqueness).
 *
 * Input:  "6C696665-6C69-6E65-0001-000000000001"
 * Output: "6C6966656C69"
 */
function makeShortId(deviceId: string): string {
  return deviceId.replace(/-/g, '').slice(0, SHORT_ID_LENGTH).toUpperCase();
}

/**
 * Build the BLE local name string that encodes Lifeline peer identity.
 * This string is embedded in the BLE scan response packet.
 *
 * @param deviceId    Full Lifeline UUID from IdentityService
 * @param displayName User's display name from Settings
 * @returns e.g. "LF:6C6966656C69:Alpha-1337"
 */
function buildLocalName(deviceId: string, displayName: string): string {
  const shortId = makeShortId(deviceId);
  const shortName = displayName.slice(0, 13); // Max 13 chars
  return `${LOCAL_NAME_PREFIX}${shortId}:${shortName}`;
}

/**
 * Parse a BLE local name into a Lifeline peer identity.
 * Returns null if the name is not in Lifeline format.
 *
 * @param localName  e.g. "LF:6C6966656C69:Alpha-1337"
 * @returns { shortId, displayName } or null
 */
function parseLocalName(
  localName: string
): { shortId: string; displayName: string } | null {
  if (!localName.startsWith(LOCAL_NAME_PREFIX)) return null;

  const rest = localName.slice(LOCAL_NAME_PREFIX.length);
  const colonIdx = rest.indexOf(':');

  // Short ID must be exactly SHORT_ID_LENGTH hex characters
  if (colonIdx !== SHORT_ID_LENGTH) return null;

  const shortId = rest.slice(0, SHORT_ID_LENGTH);
  if (!/^[0-9A-Fa-f]{12}$/.test(shortId)) return null;

  const displayName = rest.slice(SHORT_ID_LENGTH + 1) || shortId;

  return { shortId: shortId.toUpperCase(), displayName };
}

// ────────────────────────────────────────────────────────────────────────────
// BleTransport
// ────────────────────────────────────────────────────────────────────────────

export class BleTransport implements ITransport {
  public readonly id = 'ble_transport_primary';
  public readonly type: TransportType = 'bluetooth';
  public readonly label = 'Bluetooth LE';

  private _state: TransportState = 'idle';
  private events: TransportEvents | null = null;

  /** This device's Lifeline identity (set at construction time) */
  private readonly selfDeviceId: string;
  private readonly selfDisplayName: string;
  private readonly selfShortId: string;

  /** BLE Central manager (react-native-ble-plx) */
  private bleManager: BleManager | null = null;

  /** Active BLE scan subscription */
  private scanSubscription: Subscription | null = null;

  /** Tracks peers currently visible: shortId → Peer */
  private activePeers = new Map<string, Peer>();

  /** Maps Lifeline shortId to BLE device ID (MAC on Android, UUID on iOS) */
  private peerDeviceMap = new Map<string, string>();

  /** Queue for messages to peers that are currently offline or busy */
  private outbox = new Map<string, Message[]>();

  /** Buffer for reassembling multi-part chunked BLE packets */
  private chunkBuffer = new Map<string, string[]>();

  /** Cache of recently seen message IDs to prevent duplicate processing */
  private seenMessageIds = new Set<string>();

  /** Maps Lifeline shortId to the most-recently-seen Device object */
  private peerDeviceObjectMap = new Map<string, Device>();

  /** Last advertisement timestamp per peer shortId */
  private peerLastSeen = new Map<string, number>();

  /** Stale peer pruning interval handle */
  private staleCheckTimer: ReturnType<typeof setInterval> | null = null;

  /** Scan session restart timer (mitigates Android scan throttling) */
  private scanRestartTimer: ReturnType<typeof setTimeout> | null = null;

  /** BLE state subscription */
  private bleStateSubscription: Subscription | null = null;
  
  /** Native message listener subscription */
  private nativeMessageSub: { remove: () => void } | null = null;

  /** Guards against concurrent GATT connection attempts */
  private isConnecting = false;

  constructor(deviceId: string, displayName: string) {
    this.selfDeviceId = deviceId;
    this.selfDisplayName = displayName;
    this.selfShortId = makeShortId(deviceId);
  }

  get state(): TransportState {
    return this._state;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // ITransport — lifecycle
  // ─────────────────────────────────────────────────────────────────────────

  async start(events: TransportEvents): Promise<void> {
    this.events = events;
    this._state = 'starting';

    // 1. Check that native module is available (fails gracefully in Expo Go)
    if (!BleAdvertiser.isAvailable()) {
      this._state = 'unavailable';
      events.onError(
        new Error(
          'BLE native module not available. ' +
            'This feature requires a development build (not Expo Go). ' +
            'Run: expo prebuild → npx react-native run-android'
        )
      );
      return;
    }

    // 2. Request Android BLE permissions
    const permResult = await requestBlePermissions();
    if (permResult === 'denied') {
      this._state = 'permission_denied';
      events.onError(
        new Error(
          'Bluetooth permissions denied. ' +
            'Grant Bluetooth permissions in Settings to enable peer discovery.'
        )
      );
      return;
    }

    try {
      // 3. Create BleManager and wait for Bluetooth to be powered on
      this.bleManager = new BleManager();
      
      this.bleStateSubscription = this.bleManager.onStateChange(async (state) => {
        if (state === State.PoweredOn && this._state === 'scanning') {
          console.log('[BleTransport] Bluetooth powered ON. Resuming mesh...');
          const localName = buildLocalName(this.selfDeviceId, this.selfDisplayName);
          await BleAdvertiser.startAdvertising(LIFELINE_SERVICE_UUID, localName).catch(console.warn);
          this.startScanSession();
        } else if (state === State.PoweredOff) {
          console.log('[BleTransport] Bluetooth powered OFF. Halting mesh...');
          this.stopScanSession();
          await BleAdvertiser.stopAdvertising().catch(console.warn);
          for (const [shortId] of this.activePeers) {
            this.events?.onPeerLost(shortId);
          }
          this.activePeers.clear();
          this.peerLastSeen.clear();
        }
      }, true);

      await this.waitForBlePoweredOn();

      // 4. Start advertising (so other devices can discover us)
      const localName = buildLocalName(this.selfDeviceId, this.selfDisplayName);
      await BleAdvertiser.startAdvertising(LIFELINE_SERVICE_UUID, localName);
      console.log(`[BleTransport] Advertising as: ${localName}`);

      // 5. Start scanning (so we can discover other devices)
      this.startScanSession();

      // 6. Listen for incoming messages on GATT Server
      this.nativeMessageSub = BleAdvertiser.addMessageListener((event) => {
        this.handleIncomingMessage(event.payload);
      });

      // 7. Start stale peer pruning
      this.staleCheckTimer = setInterval(
        () => this.pruneStale(),
        STALE_CHECK_INTERVAL_MS
      );

      this._state = 'scanning';
      console.log('[BleTransport] Started. Service UUID:', LIFELINE_SERVICE_UUID);
    } catch (err) {
      this._state = 'error';
      events.onError(err instanceof Error ? err : new Error(String(err)));
      await this.cleanup();
    }
  }

  async stop(): Promise<void> {
    // Mark all currently active peers as offline before stopping
    for (const [shortId] of this.activePeers) {
      this.events?.onPeerLost(shortId);
    }
    this.activePeers.clear();
    this.peerLastSeen.clear();

    await this.cleanup();
    this._state = 'idle';
    console.log('[BleTransport] Stopped.');
  }

  // ─────────────────────────────────────────────────────────────────────────
  // ITransport — messaging
  // ─────────────────────────────────────────────────────────────────────────

  async sendMessage(message: Message): Promise<void> {
    const targetId = message.recipientId;
    
    // Broadcast via GATT requires sending to all known peers individually
    if (targetId === 'broadcast') {
      console.log(`[BleTransport] Broadcasting message ${message.id} to ${this.activePeers.size} peers.`);
      for (const peerId of this.activePeers.keys()) {
        const currentQueue = this.outbox.get(peerId) ?? [];
        currentQueue.push(message);
        this.outbox.set(peerId, currentQueue);
        
        if (this.activePeers.get(peerId)?.status === 'online') {
          this.flushOutbox(peerId);
        }
      }
      return;
    }

    // Direct message queueing
    const currentQueue = this.outbox.get(targetId) ?? [];
    currentQueue.push(message);
    this.outbox.set(targetId, currentQueue);

    // If the peer is online, attempt delivery immediately
    if (this.activePeers.has(targetId) && this.activePeers.get(targetId)?.status === 'online') {
      this.flushOutbox(targetId);
    }
  }

  async broadcastLocation(_location: Location): Promise<void> {
    console.log('[BleTransport] broadcastLocation() — not implemented');
  }

  async broadcastSos(_sos: SosEvent): Promise<void> {
    console.log('[BleTransport] broadcastSos() — not implemented');
  }

  getConnectedPeerIds(): string[] {
    return Array.from(this.activePeers.keys());
  }

  // ─────────────────────────────────────────────────────────────────────────
  // BLE internals
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Wait until the BLE adapter is powered on.
   * On Android we can request enable; on iOS we must wait for user action.
   * Times out after 15 seconds.
   */
  private waitForBlePoweredOn(): Promise<void> {
    return new Promise((resolve, reject) => {
      const manager = this.bleManager!;
      let settled = false;

      const settle = (fn: () => void) => {
        if (!settled) {
          settled = true;
          sub?.remove();
          clearTimeout(timeout);
          fn();
        }
      };

      const timeout = setTimeout(() => {
        settle(() => reject(new Error('Bluetooth did not power on within 15 seconds')));
      }, 15_000);

      let sub: Subscription | null = null;

      // Check current state first to avoid race condition
      manager.state().then((currentState) => {
        if (currentState === State.PoweredOn) {
          settle(resolve);
          return;
        }

        // On Android, try to programmatically enable Bluetooth
        if (Platform.OS === 'android' && currentState === State.PoweredOff) {
          manager.enable().catch(() => {
            // enable() can throw if already in progress or permission denied
            // Continue and watch for state change
          });
        }

        // Subscribe to state changes
        sub = manager.onStateChange((newState) => {
          if (newState === State.PoweredOn) {
            settle(resolve);
          } else if (
            newState === State.Unsupported ||
            newState === State.Unauthorized
          ) {
            settle(() =>
              reject(
                new Error(
                  newState === State.Unsupported
                    ? 'Bluetooth LE is not supported on this device.'
                    : 'Bluetooth permission not granted.'
                )
              )
            );
          }
        }, true);
      });
    });
  }

  /**
   * Start a BLE scan session, filtering for devices that advertise the
   * Lifeline service UUID. Schedules a restart after SCAN_RESTART_INTERVAL_MS.
   */
  private startScanSession(): void {
    const manager = this.bleManager;
    if (!manager) return;

    // Stop any existing scan first
    this.stopScanSession();

    console.log('[BleTransport] Starting scan session...');

    manager.startDeviceScan(
      [LIFELINE_SERVICE_UUID],   // Only report devices advertising Lifeline UUID
      { allowDuplicates: true }, // Receive repeated events to track RSSI + last-seen
      (error, device) => {
        if (error) {
          // BLE errors during scan are usually transient; log and continue
          console.warn('[BleTransport] Scan error:', error.message);
          return;
        }
        if (device) {
          this.handleDiscoveredDevice(device);
        }
      }
    );

    // Schedule scan restart to prevent Android throttling
    this.scanRestartTimer = setTimeout(() => {
      if (this._state === 'scanning') {
        console.log('[BleTransport] Restarting scan session (anti-throttle).');
        this.startScanSession();
      }
    }, SCAN_RESTART_INTERVAL_MS);
  }

  /** Stop the current scan session without affecting the transport state. */
  private stopScanSession(): void {
    this.bleManager?.stopDeviceScan();
    if (this.scanRestartTimer !== null) {
      clearTimeout(this.scanRestartTimer);
      this.scanRestartTimer = null;
    }
  }

  /**
   * Handle a device advertisement received from the BLE scanner.
   * Parses the local name to extract Lifeline peer identity.
   * Calls onPeerDiscovered for new/returning peers.
   */
  private handleDiscoveredDevice(device: Device): void {
    // Prefer localName (from scan response) over name (system BT name)
    const rawName = device.localName ?? device.name;
    if (!rawName) return;

    const parsed = parseLocalName(rawName);
    if (!parsed) return; // Not a Lifeline device

    const { shortId, displayName } = parsed;

    // Ignore our own advertisement
    if (shortId === this.selfShortId) return;

    const now = Date.now();
    const wasAlreadyOnline =
      this.activePeers.has(shortId) &&
      this.activePeers.get(shortId)!.status === 'online';

    this.peerLastSeen.set(shortId, now);
    this.peerDeviceMap.set(shortId, device.id);
    this.peerDeviceObjectMap.set(shortId, device);  // Always keep the freshest Device ref

    const existingPeer = this.activePeers.get(shortId);

    const peer: Peer = {
      id: shortId,
      displayName,
      transport: 'bluetooth',
      status: 'online',
      rssi: device.rssi ?? null,
      lastSeen: new Date(now).toISOString(),
      firstSeen: existingPeer?.firstSeen ?? new Date(now).toISOString(),
    };

    this.activePeers.set(shortId, peer);

    // Only call onPeerDiscovered on first appearance or when coming back online
    this.events?.onPeerDiscovered(peer);

    if (!wasAlreadyOnline) {
      console.log(
        `[BleTransport] Peer discovered: ${displayName} (${shortId}) RSSI=${device.rssi}`
      );
      // Flush outbox in case we have queued messages, passing the fresh Device object
      this.flushOutbox(shortId, device);
    } else {
      // Already online — update device ref in case MAC rotated
      this.flushOutbox(shortId, device);
    }
  }

  /**
   * Remove peers whose last advertisement was too long ago.
   * Called every STALE_CHECK_INTERVAL_MS.
   */
  private pruneStale(): void {
    const now = Date.now();
    for (const [shortId, lastSeen] of this.peerLastSeen.entries()) {
      if (now - lastSeen > PEER_TIMEOUT_MS) {
        const peer = this.activePeers.get(shortId);
        if (peer) {
          this.activePeers.delete(shortId);
          this.peerLastSeen.delete(shortId);
          this.events?.onPeerLost(shortId);
          console.log(
            `[BleTransport] Peer timed out: ${peer.displayName} (${shortId})`
          );
        }
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Active Connection & Messaging
  // ─────────────────────────────────────────────────────────────────────────

  private async flushOutbox(shortId: string, freshDevice?: Device): Promise<void> {
    const memoryQueue = this.outbox.get(shortId) ?? [];
    
    // Pull any persistently queued messages for this peer or broadcasts
    const storeQueue = useMeshQueue.getState().dequeueForPeer(shortId);
    
    // Merge, deduplicate by ID, and prepare queue
    const allMessages = [...memoryQueue, ...storeQueue];
    const uniqueMessages = Array.from(new Map(allMessages.map(m => [m.id, m])).values());
    
    if (uniqueMessages.length === 0) return;

    // Use the freshest Device reference, fallback to map, fallback to instantiating
    const device = freshDevice ?? this.peerDeviceObjectMap.get(shortId);
    if (!device) {
      console.warn(`[BleTransport] No device object for ${shortId}, cannot flush.`);
      return;
    }

    if (!this.bleManager) return;

    // ── Concurrency Lock ───────────────────────────────────────────────────
    // Only one outbound connection at a time on this device. If we are already
    // in the middle of connecting to someone else, defer — we'll retry on the
    // next scan advertisement (allowDuplicates means this is every few seconds).
    if (this.isConnecting) {
      console.log(`[BleTransport] Already connecting, will retry ${shortId} on next scan.`);
      return;
    }
    this.isConnecting = true;

    console.log(`[BleTransport] Flushing outbox for ${shortId} (${uniqueMessages.length} messages)...`);

    try {
      // Stop scanning — Android cannot scan while holding a GATT connection
      this.stopScanSession();
      // Small delay to let Android fully release the scanning radio
      await new Promise(resolve => setTimeout(resolve, 300));

      const connectedDevice = await device.connect({ timeout: 10000 });

      console.log(`[BleTransport] Connected to ${shortId}. Waiting for GATT to settle...`);
      // Android GATT requires a small delay after connecting before discovery is stable
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Maximize MTU on Android BEFORE discovering services (more stable on some OS versions)
      if (Platform.OS === 'android') {
        try {
          console.log(`[BleTransport] Requesting MTU...`);
          await connectedDevice.requestMTU(512);
        } catch (e) {
          console.warn(`[BleTransport] Failed to request MTU:`, e);
        }
      }

      console.log(`[BleTransport] Discovering services...`);
      const discoveredDevice = await connectedDevice.discoverAllServicesAndCharacteristics();
      const mtu = (discoveredDevice as any).mtu ?? (connectedDevice as any).mtu ?? 'unknown';
      console.log(`[BleTransport] Services discovered. Negotiated MTU=${mtu}.`);

      // Send all queued messages
      while (uniqueMessages.length > 0) {
        const msg = uniqueMessages[0];
        
        // Format for offline packet: Plaintext JSON (E2EE omitted per Module 3 guidelines)
        // Use selfShortId (not the full UUID) so the receiver can match it directly
        // against the peer store keys without UUID-to-shortId conversion.
        const parsedPayload = (msg.type === 'sos_relay' || msg.type === 'sos_cancel' || msg.type === 'location_beacon') && msg.text
          ? JSON.parse(msg.text)
          : msg.text;

        const packet = JSON.stringify({
          protocol: 'lifeline/1.0',
          type: msg.type,
          messageId: msg.id,
          senderId: this.selfShortId,
          recipientId: msg.recipientId,
          timestamp: msg.createdAt,
          payload: parsedPayload,
          hopCount: msg.hopCount,
          maxHops: msg.maxHops,
          encrypted: msg.encrypted,
          signature: msg.signature,
        });

        const CHUNK_SIZE = 300; // Safe payload size to fit inside 512-byte MTU limits
        if (packet.length <= CHUNK_SIZE) {
          const base64Payload = Buffer.from(packet, 'utf8').toString('base64');
          console.log(`[BleTransport] Writing ${packet.length} byte payload (${base64Payload.length} b64 chars)...`);
          await connectedDevice.writeCharacteristicWithResponseForService(
            MESSAGING_SERVICE_UUID,
            WRITE_CHARACTERISTIC_UUID,
            base64Payload
          );
        } else {
          // Manually chunk the packet to avoid Android Long Write negotiation timeouts
          const totalChunks = Math.ceil(packet.length / CHUNK_SIZE);
          console.log(`[BleTransport] Splitting ${packet.length} byte payload into ${totalChunks} chunks...`);
          
          for (let i = 0; i < totalChunks; i++) {
            const chunkData = packet.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
            const chunkStr = `C:${msg.id}:${i}:${totalChunks}:${chunkData}`;
            const base64Chunk = Buffer.from(chunkStr, 'utf8').toString('base64');
            
            console.log(`[BleTransport] Writing chunk ${i+1}/${totalChunks} (${base64Chunk.length} b64 chars)...`);
            await connectedDevice.writeCharacteristicWithResponseForService(
              MESSAGING_SERVICE_UUID,
              WRITE_CHARACTERISTIC_UUID,
              base64Chunk
            );
            
            // Add a tiny delay between chunks to let the remote GATT server process it
            await new Promise(resolve => setTimeout(resolve, 50));
          }
        }

        console.log(`[BleTransport] Successfully sent msg ${msg.id} to ${shortId}`);
        uniqueMessages.shift(); // Remove from processing list

        // Notify app layer of delivery success (we only reliably know the first hop succeeded)
        if (msg.status === 'pending') {
          this.events?.onMessageDelivered?.(msg.id);
        }
        await useMeshQueue.getState().removeMessage(msg.id);
        const currentMemoryQueue = this.outbox.get(shortId);
        if (currentMemoryQueue) {
          this.outbox.set(shortId, currentMemoryQueue.filter(m => m.id !== msg.id));
        }
      }

      await connectedDevice.cancelConnection();
      console.log(`[BleTransport] Outbox flushed, disconnected from ${shortId}`);

    } catch (err: any) {
      const errMsg: string = err?.message ?? String(err);
      console.error(`[BleTransport] Failed to flush outbox for ${shortId}:`, errMsg);

      // If two phones tried to connect simultaneously (race), back off with
      // random jitter so they don't collide again on the next retry.
      const isCollision = errMsg.includes('already connected') ||
                          errMsg.includes('disconnected') ||
                          errMsg.includes('cancelled');
      if (isCollision) {
        const jitter = 500 + Math.random() * 2000; // 0.5–2.5 s random delay
        console.log(`[BleTransport] Collision detected — backing off ${Math.round(jitter)}ms before retry.`);
        await new Promise(resolve => setTimeout(resolve, jitter));
      }

      // Clean up any half-open connection
      try { await device.cancelConnection(); } catch (e) {}
    } finally {
      this.isConnecting = false;
      // Resume scanning
      this.startScanSession();
    }
  }

  private handleIncomingMessage(rawPayload: string): void {
    if (rawPayload.startsWith('C:')) {
      const parts = rawPayload.split(':');
      if (parts.length >= 5) {
        // C:<msgId>:<index>:<total>:<data...>
        const msgId = parts[1];
        const idx = parseInt(parts[2], 10);
        const total = parseInt(parts[3], 10);
        const chunkData = parts.slice(4).join(':'); // Re-join any colons in the actual data
        
        if (!this.chunkBuffer.has(msgId)) {
          this.chunkBuffer.set(msgId, new Array(total).fill(null));
        }
        
        const chunks = this.chunkBuffer.get(msgId)!;
        chunks[idx] = chunkData;
        console.log(`[BleTransport] Received chunk ${idx+1}/${total} for ${msgId}`);

        // Check if fully assembled
        if (chunks.every(c => c !== null)) {
          console.log(`[BleTransport] Packet fully assembled! Processing...`);
          this.chunkBuffer.delete(msgId);
          this.handleIncomingMessage(chunks.join(''));
        }
        return;
      }
    }

    try {
      const parsed = JSON.parse(rawPayload);
      if (parsed.protocol !== 'lifeline/1.0') {
        console.warn('[BleTransport] Received unknown protocol packet:', rawPayload);
        return;
      }
      
      const allowedTypes = ['text', 'sos_relay', 'sos_cancel', 'location_beacon', 'system', 'key_exchange'];
      if (!allowedTypes.includes(parsed.type)) {
        console.warn(`[BleTransport] Received unsupported packet type '${parsed.type}':`, rawPayload);
        return;
      }

      // Robustly handle senderId: it might be a full UUID (from an older client session)
      // or a shortId (from a newer client). We always normalize it to a shortId.
      const rawSenderId: string = parsed.senderId ?? '';
      const senderShortId = rawSenderId.replace(/-/g, '').slice(0, 12).toUpperCase();
      
      const recipientId = parsed.recipientId ?? 'broadcast';
      const conversationId = makeConversationId(senderShortId, recipientId === 'broadcast' ? 'broadcast' : this.selfShortId);

      const msg: Message = {
        id: parsed.messageId,
        senderId: senderShortId,
        recipientId,
        conversationId,
        type: parsed.type,
        text: typeof parsed.payload === 'object' ? JSON.stringify(parsed.payload) : parsed.payload,
        status: 'delivered',
        hopCount: typeof parsed.hopCount === 'number' ? parsed.hopCount : 0,
        maxHops: typeof parsed.maxHops === 'number' ? parsed.maxHops : 5,
        encrypted: parsed.encrypted,
        signature: parsed.signature,
        createdAt: parsed.timestamp || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // Native transport deduplication
      if (this.seenMessageIds.has(msg.id)) {
        console.log(`[BleTransport] Dropping duplicate packet at transport layer: ${msg.id}`);
        return;
      }
      this.seenMessageIds.add(msg.id);
      if (this.seenMessageIds.size > 1000) {
        const iter = this.seenMessageIds.keys();
        this.seenMessageIds.delete(iter.next().value!);
      }

      console.log(`[BleTransport] Received message ${msg.id} from ${senderShortId} → conv:${conversationId}`);
      this.events?.onMessageReceived(msg);

    } catch (e) {
      console.error('[BleTransport] Failed to parse incoming message:', e);
    }
  }


  /** Tear down all BLE resources without touching transport state. */
  private async cleanup(): Promise<void> {
    // Stop stale peer timer
    if (this.staleCheckTimer !== null) {
      clearInterval(this.staleCheckTimer);
      this.staleCheckTimer = null;
    }
    
    // Remove native event listener
    this.nativeMessageSub?.remove();
    this.nativeMessageSub = null;

    // Stop scan session
    this.stopScanSession();

    // Unsubscribe from BLE state changes
    this.bleStateSubscription?.remove();
    this.bleStateSubscription = null;

    // Stop advertising and restore system BT name
    try {
      await BleAdvertiser.stopAdvertising();
    } catch (e) {
      console.warn('[BleTransport] cleanup: stopAdvertising error:', e);
    }

    // Destroy BleManager
    try {
      this.bleManager?.destroy();
    } catch (e) {
      console.warn('[BleTransport] cleanup: BleManager destroy error:', e);
    }
    this.bleManager = null;
  }
}

/** Factory function — preferred over `new BleTransport()` at call sites. */
export function createBleTransport(
  deviceId: string,
  displayName: string
): BleTransport {
  return new BleTransport(deviceId, displayName);
}
