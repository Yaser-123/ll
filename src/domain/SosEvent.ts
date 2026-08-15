/**
 * Domain model: SosEvent
 * An emergency SOS alert created locally or received via mesh.
 */

export type SosSeverity = 'low' | 'medium' | 'high' | 'critical';
export type SosStatus = 'active' | 'acknowledged' | 'resolved' | 'expired';

export interface SosEvent {
  /** Unique event ID (UUID) */
  id: string;

  /** Device UUID that originated this SOS */
  originatorId: string;

  /** Human-readable name of the originator at time of alert */
  originatorName: string;

  severity: SosSeverity;
  status: SosStatus;

  /** Free-text description of the emergency */
  description?: string;

  /** GPS location at time of alert (null if unavailable) */
  location?: {
    latitude: number;
    longitude: number;
    accuracy?: number;
  };

  /** ISO timestamp when SOS was triggered */
  createdAt: string;

  /** ISO timestamp of last status update */
  updatedAt: string;

  /** ISO timestamp when the SOS auto-expires (null = never) */
  expiresAt?: string;

  /** ISO timestamp when the SOS was resolved */
  resolvedAt?: string;

  /** Number of hops across the mesh (0 = local origin) */
  hopCount: number;

  /** Whether this event was created by the local device */
  isLocal: boolean;
}

export function createSosEvent(
  originatorId: string,
  originatorName: string,
  severity: SosSeverity,
  description?: string
): SosEvent {
  const now = new Date().toISOString();
  // Auto-expire after 4 hours
  const expiresAt = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString();
  return {
    id: generateId(),
    originatorId,
    originatorName,
    severity,
    status: 'active',
    description,
    location: undefined,
    createdAt: now,
    updatedAt: now,
    expiresAt,
    resolvedAt: undefined,
    hopCount: 0,
    isLocal: true,
  };
}

function generateId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
