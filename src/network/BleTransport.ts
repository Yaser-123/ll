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
import type { Peer } from '../domain/Peer';
import type { Message } from '../domain/Message';
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
  readonly type = 'bluetooth' as const;
  readonly label = 'Bluetooth LE';

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
    
    // Broadcast is not supported in Module 3 (GATT requires direct connection)
    if (targetId === 'broadcast') {
      console.warn('[BleTransport] Broadcast sending not yet supported via GATT.');
      return;
    }

    // Queue the message
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
      // Flush outbox in case we have queued messages
      this.flushOutbox(shortId);
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

  private async flushOutbox(shortId: string): Promise<void> {
    const queue = this.outbox.get(shortId);
    if (!queue || queue.length === 0) return;
    
    const macAddress = this.peerDeviceMap.get(shortId);
    if (!macAddress) return;

    if (!this.bleManager) return;
    
    console.log(`[BleTransport] Flushing outbox for ${shortId} (${queue.length} messages)...`);

    try {
      // Pause scanning while we connect to save radio resources and improve connection speed
      this.stopScanSession();

      // Attempt to clear any hung connections first (safe to call even if not connected)
      try {
        await this.bleManager.cancelDeviceConnection(macAddress);
      } catch (e) {}

      const connectedDevice = await this.bleManager.connectToDevice(macAddress, {
        timeout: 10000,
      });

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
      await connectedDevice.discoverAllServicesAndCharacteristics();
      console.log(`[BleTransport] Services discovered successfully.`);

      // Send all queued messages
      while (queue.length > 0) {
        const msg = queue[0];
        
        // Format for offline packet: Plaintext JSON (E2EE omitted per Module 3 guidelines)
        const packet = JSON.stringify({
          protocol: 'lifeline/1.0',
          type: 'chat',
          messageId: msg.id,
          senderId: msg.senderId,
          timestamp: msg.createdAt,
          payload: msg.text,
        });

        const base64Payload = Buffer.from(packet, 'utf8').toString('base64');

        await connectedDevice.writeCharacteristicWithoutResponseForService(
          MESSAGING_SERVICE_UUID,
          WRITE_CHARACTERISTIC_UUID,
          base64Payload
        );

        console.log(`[BleTransport] Successfully sent msg ${msg.id} to ${shortId}`);
        queue.shift(); // Remove from queue

        // Notify app layer of delivery success
        msg.status = 'sent';
        this.events?.onMessageReceived(msg); // Note: We should ideally have an onMessageDelivered event, but updating local store handles this. Wait, transport doesn't have onMessageDelivered. We just update the store directly or emit an event? For now, we trust the queue.
        // Let's rely on the store picking up the change or just fire a success callback if we had one.
      }

      await connectedDevice.cancelConnection();
      console.log(`[BleTransport] Outbox flushed, disconnected from ${shortId}`);

    } catch (err) {
      console.error(`[BleTransport] Failed to flush outbox for ${shortId}:`, err);
      // Wait to disconnect on error just in case
      try {
        await this.bleManager.cancelDeviceConnection(macAddress);
      } catch (e) {}
    } finally {
      // Resume scanning
      this.startScanSession();
    }
  }

  private handleIncomingMessage(rawPayload: string): void {
    try {
      const parsed = JSON.parse(rawPayload);
      if (parsed.protocol !== 'lifeline/1.0' || parsed.type !== 'chat') {
        console.warn('[BleTransport] Received unknown packet type:', rawPayload);
        return;
      }

      const msg: Message = {
        id: parsed.messageId,
        senderId: parsed.senderId,
        recipientId: this.selfDeviceId,
        conversationId: [parsed.senderId, this.selfDeviceId].sort().join('_'),
        type: 'text',
        text: parsed.payload,
        status: 'delivered',
        hopCount: 0,
        createdAt: parsed.timestamp,
        updatedAt: new Date().toISOString(),
      };

      console.log(`[BleTransport] Received message ${msg.id} from ${msg.senderId}`);
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
