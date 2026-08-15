/**
 * Domain model: Message
 * A chat or data message routed through the mesh.
 */

export type MessageStatus = 'pending' | 'sent' | 'delivered' | 'failed';
export type MessageType = 'text' | 'sos_relay' | 'location_beacon' | 'system';

export interface Message {
  /** Unique message ID (UUID) */
  id: string;

  /** Sender device UUID */
  senderId: string;

  /** Recipient device UUID, or 'broadcast' for mesh-wide */
  recipientId: string | 'broadcast';

  /** Conversation/thread ID (usually a sorted concatenation of sender+recipient IDs) */
  conversationId: string;

  /** Message content */
  type: MessageType;
  text?: string;

  /** Delivery status */
  status: MessageStatus;

  /** ISO timestamp when message was composed */
  createdAt: string;

  /** ISO timestamp when message was last updated */
  updatedAt: string;

  /** Number of hops this message has taken through the mesh (for relay tracking) */
  hopCount: number;
}

export function makeConversationId(idA: string, idB: string): string {
  if (idA === 'broadcast' || idB === 'broadcast') return 'broadcast';
  return [idA, idB].sort().join('::');
}

export function createMessage(
  partial: Pick<Message, 'senderId' | 'recipientId' | 'type'> & { text?: string }
): Message {
  const now = new Date().toISOString();
  return {
    id: generateId(),
    conversationId: makeConversationId(partial.senderId, partial.recipientId),
    status: 'pending',
    hopCount: 0,
    createdAt: now,
    updatedAt: now,
    ...partial,
  };
}

/** Lightweight ID generator — replaced by crypto.randomUUID() when available */
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
