/**
 * MockTransport — a no-op placeholder transport used during development.
 *
 * It satisfies ITransport but never transmits or receives anything.
 * All method calls are logged to the console so you can trace
 * what the app would do when a real transport is wired in.
 *
 * Replace / supplement this with a real BLE or Wi-Fi adapter.
 */

import type { ITransport, TransportEvents, TransportState } from './ITransport';
import type { Message } from '../domain/Message';
import type { Location } from '../domain/Location';
import type { SosEvent } from '../domain/SosEvent';
import type { TransportType } from '../domain/Peer';

export class MockTransport implements ITransport {
  public readonly id: string;
  public readonly type: TransportType;
  public readonly label: string;
  private _state: TransportState = 'idle';

  constructor(type: TransportType, label: string) {
    this.id = `mock_${type}_${Math.random().toString(36).substring(7)}`;
    this.type = type;
    this.label = label;
  }

  get state(): TransportState {
    return this._state;
  }

  async start(_events: TransportEvents): Promise<void> {
    console.log('[MockTransport] start() — no real transport connected');
    this._state = 'scanning';
  }

  async stop(): Promise<void> {
    console.log('[MockTransport] stop()');
    this._state = 'idle';
  }

  async sendMessage(message: Message, recipientId?: string): Promise<void> {
    console.log('[MockTransport] sendMessage() — message NOT sent (placeholder)', {
      messageId: message.id,
      recipientId,
    });
  }

  async broadcastLocation(location: Location): Promise<void> {
    console.log('[MockTransport] broadcastLocation() — NOT broadcast (placeholder)', {
      deviceId: location.deviceId,
      lat: location.latitude,
      lng: location.longitude,
    });
  }

  async broadcastSos(sos: SosEvent): Promise<void> {
    console.log('[MockTransport] broadcastSos() — NOT broadcast (placeholder)', {
      sosId: sos.id,
      severity: sos.severity,
    });
  }

  getConnectedPeerIds(): string[] {
    return [];
  }
}
