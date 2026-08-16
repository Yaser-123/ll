import nacl from 'tweetnacl';
import naclUtil from 'tweetnacl-util';
import * as crypto from 'expo-crypto';

// Polyfill random bytes for TweetNaCl using expo-crypto since tweetnacl expects 
// window.crypto.getRandomValues or crypto.randomBytes
nacl.setPRNG((x: Uint8Array, n: number) => {
  const randomBytes = crypto.getRandomBytes(n);
  for (let i = 0; i < n; i++) {
    x[i] = randomBytes[i];
  }
});

export interface KeyPair {
  publicKey: string;  // Base64
  secretKey: string;  // Base64
}

export const CryptoService = {
  /**
   * Generates a new Curve25519 keypair for encryption (box).
   */
  generateEncryptionKeyPair(): KeyPair {
    const kp = nacl.box.keyPair();
    return {
      publicKey: naclUtil.encodeBase64(kp.publicKey),
      secretKey: naclUtil.encodeBase64(kp.secretKey),
    };
  },

  /**
   * Generates a new Ed25519 keypair for signing.
   */
  generateSigningKeyPair(): KeyPair {
    const kp = nacl.sign.keyPair();
    return {
      publicKey: naclUtil.encodeBase64(kp.publicKey),
      secretKey: naclUtil.encodeBase64(kp.secretKey),
    };
  },

  /**
   * Encrypts a message payload using Curve25519-XSalsa20-Poly1305.
   * Uses ephemeral nonces.
   */
  encryptDM(text: string, recipientPublicKeyBase64: string, senderSecretKeyBase64: string): string {
    const nonce = crypto.getRandomBytes(nacl.box.nonceLength);
    const messageUint8 = naclUtil.decodeUTF8(text);
    const recipientPubKey = naclUtil.decodeBase64(recipientPublicKeyBase64);
    const senderSecKey = naclUtil.decodeBase64(senderSecretKeyBase64);

    const encrypted = nacl.box(messageUint8, nonce, recipientPubKey, senderSecKey);
    
    // Package nonce + ciphertext into a single Base64 string for transport
    const fullMessage = new Uint8Array(nonce.length + encrypted.length);
    fullMessage.set(nonce);
    fullMessage.set(encrypted, nonce.length);
    
    return naclUtil.encodeBase64(fullMessage);
  },

  /**
   * Decrypts a message payload.
   */
  decryptDM(encryptedBase64: string, senderPublicKeyBase64: string, recipientSecretKeyBase64: string): string | null {
    try {
      const fullMessage = naclUtil.decodeBase64(encryptedBase64);
      const nonce = fullMessage.slice(0, nacl.box.nonceLength);
      const message = fullMessage.slice(nacl.box.nonceLength);
      
      const senderPubKey = naclUtil.decodeBase64(senderPublicKeyBase64);
      const recipientSecKey = naclUtil.decodeBase64(recipientSecretKeyBase64);

      const decrypted = nacl.box.open(message, nonce, senderPubKey, recipientSecKey);
      if (!decrypted) return null;

      return naclUtil.encodeUTF8(decrypted);
    } catch (err) {
      console.warn('[CryptoService] Failed to decrypt message', err);
      return null;
    }
  },

  /**
   * Signs a payload using Ed25519 to prove authenticity and prevent tampering.
   * Returns a Base64 signature.
   */
  signPayload(payloadString: string, secretKeyBase64: string): string {
    const messageUint8 = naclUtil.decodeUTF8(payloadString);
    const secretKey = naclUtil.decodeBase64(secretKeyBase64);
    const signature = nacl.sign.detached(messageUint8, secretKey);
    return naclUtil.encodeBase64(signature);
  },

  /**
   * Verifies an Ed25519 signature.
   */
  verifySignature(payloadString: string, signatureBase64: string, publicKeyBase64: string): boolean {
    try {
      const messageUint8 = naclUtil.decodeUTF8(payloadString);
      const signature = naclUtil.decodeBase64(signatureBase64);
      const publicKey = naclUtil.decodeBase64(publicKeyBase64);
      return nacl.sign.detached.verify(messageUint8, signature, publicKey);
    } catch (err) {
      return false;
    }
  },

  /**
   * Creates a deterministic string representation of a message for signing.
   * This avoids issues where JSON.stringify produces different results on the sender vs receiver.
   */
  canonicalizeMessage(message: { id: string; senderId: string; recipientId: string; type: string; text?: string }): string {
    return `${message.id}:${message.senderId}:${message.recipientId}:${message.type}:${message.text || ''}`;
  }
};
