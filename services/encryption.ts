/**
 * Message Encryption Service
 *
 * Provides optional end-to-end encryption for sensitive messages.
 * Uses Web Crypto API for encryption operations.
 *
 * Note: This is client-side encryption. For true E2E encryption,
 * you would need to implement key exchange protocols (e.g., Signal Protocol).
 */

// Check if Web Crypto API is available
const isCryptoAvailable = typeof window !== 'undefined' && window.crypto && window.crypto.subtle;

/**
 * Generate a new encryption key
 */
export const generateKey = async (): Promise<CryptoKey | null> => {
  if (!isCryptoAvailable) {
    console.warn('Web Crypto API not available');
    return null;
  }

  try {
    const key = await window.crypto.subtle.generateKey(
      {
        name: 'AES-GCM',
        length: 256,
      },
      true, // extractable
      ['encrypt', 'decrypt']
    );
    return key;
  } catch (error) {
    console.error('Failed to generate encryption key:', error);
    return null;
  }
};

/**
 * Export a CryptoKey to a base64 string for storage
 */
export const exportKey = async (key: CryptoKey): Promise<string | null> => {
  if (!isCryptoAvailable) return null;

  try {
    const exported = await window.crypto.subtle.exportKey('raw', key);
    return arrayBufferToBase64(exported);
  } catch (error) {
    console.error('Failed to export key:', error);
    return null;
  }
};

/**
 * Import a base64 string key back to CryptoKey
 */
export const importKey = async (keyString: string): Promise<CryptoKey | null> => {
  if (!isCryptoAvailable) return null;

  try {
    const keyData = base64ToArrayBuffer(keyString);
    const key = await window.crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'AES-GCM' },
      true,
      ['encrypt', 'decrypt']
    );
    return key;
  } catch (error) {
    console.error('Failed to import key:', error);
    return null;
  }
};

/**
 * Encrypt a message
 */
export const encryptMessage = async (
  message: string,
  key: CryptoKey
): Promise<{ ciphertext: string; iv: string } | null> => {
  if (!isCryptoAvailable) return null;

  try {
    // Generate a random IV (Initialization Vector)
    const iv = window.crypto.getRandomValues(new Uint8Array(12));

    // Encode the message
    const encoder = new TextEncoder();
    const data = encoder.encode(message);

    // Encrypt
    const encrypted = await window.crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: iv,
      },
      key,
      data
    );

    return {
      ciphertext: arrayBufferToBase64(encrypted),
      iv: arrayBufferToBase64(iv.buffer),
    };
  } catch (error) {
    console.error('Failed to encrypt message:', error);
    return null;
  }
};

/**
 * Decrypt a message
 */
export const decryptMessage = async (
  ciphertext: string,
  iv: string,
  key: CryptoKey
): Promise<string | null> => {
  if (!isCryptoAvailable) return null;

  try {
    const encryptedData = base64ToArrayBuffer(ciphertext);
    const ivData = new Uint8Array(base64ToArrayBuffer(iv));

    const decrypted = await window.crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: ivData,
      },
      key,
      encryptedData
    );

    const decoder = new TextDecoder();
    return decoder.decode(decrypted);
  } catch (error) {
    console.error('Failed to decrypt message:', error);
    return null;
  }
};

/**
 * Hash a string using SHA-256
 */
export const hashString = async (input: string): Promise<string | null> => {
  if (!isCryptoAvailable) return null;

  try {
    const encoder = new TextEncoder();
    const data = encoder.encode(input);
    const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
    return arrayBufferToBase64(hashBuffer);
  } catch (error) {
    console.error('Failed to hash string:', error);
    return null;
  }
};

/**
 * Generate a random ID
 */
export const generateRandomId = (length: number = 32): string => {
  if (!isCryptoAvailable) {
    // Fallback for non-crypto environments
    return Math.random().toString(36).substring(2, length + 2);
  }

  const array = new Uint8Array(length);
  window.crypto.getRandomValues(array);
  return Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join('').substring(0, length);
};

// Helper functions

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Encrypted message interface
 */
export interface EncryptedMessage {
  encrypted: true;
  ciphertext: string;
  iv: string;
  keyId: string; // Identifier for which key was used
}

/**
 * Check if a message object is encrypted
 */
export const isEncryptedMessage = (content: any): content is EncryptedMessage => {
  return (
    content &&
    typeof content === 'object' &&
    content.encrypted === true &&
    typeof content.ciphertext === 'string' &&
    typeof content.iv === 'string'
  );
};

/**
 * Key storage helpers - store encryption keys securely
 * In production, consider using a secure enclave or key management service
 */
const KEY_STORAGE_PREFIX = 'northstar_encryption_key_';

export const storeKey = async (keyId: string, key: CryptoKey): Promise<boolean> => {
  try {
    const exported = await exportKey(key);
    if (exported && typeof localStorage !== 'undefined') {
      localStorage.setItem(KEY_STORAGE_PREFIX + keyId, exported);
      return true;
    }
    return false;
  } catch (error) {
    console.error('Failed to store key:', error);
    return false;
  }
};

export const retrieveKey = async (keyId: string): Promise<CryptoKey | null> => {
  try {
    if (typeof localStorage === 'undefined') return null;
    const keyString = localStorage.getItem(KEY_STORAGE_PREFIX + keyId);
    if (!keyString) return null;
    return await importKey(keyString);
  } catch (error) {
    console.error('Failed to retrieve key:', error);
    return null;
  }
};

export const deleteKey = (keyId: string): boolean => {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(KEY_STORAGE_PREFIX + keyId);
      return true;
    }
    return false;
  } catch (error) {
    console.error('Failed to delete key:', error);
    return false;
  }
};
