/**
 * Client-Side End-to-End Encryption Service (E2EE)
 * Uses Web Crypto API:
 * - RSA-OAEP (2048-bit) for exchange of conversation symmetric keys.
 * - AES-GCM (256-bit) for high-performance symmetric message encryption.
 */

// Helper to convert ArrayBuffer to Base64
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

// Helper to convert Base64 to ArrayBuffer
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = window.atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

export interface KeyPairJWK {
  publicKey: string;  // Base64 encoded JWK string
  privateKey: string; // Base64 encoded JWK string
}

/**
 * Generates a new RSA-OAEP key pair for E2E Key Exchange
 */
export async function generateUserKeyPair(): Promise<KeyPairJWK> {
  const keyPair = await window.crypto.subtle.generateKey(
    {
      name: 'RSA-OAEP',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true, // extractable
    ['encrypt', 'decrypt']
  );

  const publicKeyJWK = await window.crypto.subtle.exportKey('jwk', keyPair.publicKey);
  const privateKeyJWK = await window.crypto.subtle.exportKey('jwk', keyPair.privateKey);

  return {
    publicKey: window.btoa(JSON.stringify(publicKeyJWK)),
    privateKey: window.btoa(JSON.stringify(privateKeyJWK)),
  };
}

/**
 * Generates a random 256-bit AES-GCM symmetric key
 */
export async function generateAESKey(): Promise<CryptoKey> {
  return await window.crypto.subtle.generateKey(
    {
      name: 'AES-GCM',
      length: 256,
    },
    true,
    ['encrypt', 'decrypt']
  );
}

/**
 * Exports a CryptoKey to base64 raw string
 */
export async function exportAESKey(key: CryptoKey): Promise<string> {
  const exported = await window.crypto.subtle.exportKey('raw', key);
  return arrayBufferToBase64(exported);
}

/**
 * Imports a base64 raw string to a CryptoKey
 */
export async function importAESKey(base64Key: string): Promise<CryptoKey> {
  const buffer = base64ToArrayBuffer(base64Key);
  return await window.crypto.subtle.importKey(
    'raw',
    buffer,
    { name: 'AES-GCM' },
    true,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypts the AES conversation key with a user's RSA Public Key (JWK)
 */
export async function encryptAESKeyWithRSAPublic(
  aesKeyBase64: string,
  recipientRSAPublicKeyBase64: string
): Promise<string> {
  const recipientJWK = JSON.parse(window.atob(recipientRSAPublicKeyBase64));
  const rsaPublicKey = await window.crypto.subtle.importKey(
    'jwk',
    recipientJWK,
    {
      name: 'RSA-OAEP',
      hash: 'SHA-256',
    },
    true,
    ['encrypt']
  );

  const aesKeyBuffer = base64ToArrayBuffer(aesKeyBase64);
  const encryptedBuffer = await window.crypto.subtle.encrypt(
    {
      name: 'RSA-OAEP',
    },
    rsaPublicKey,
    aesKeyBuffer
  );

  return arrayBufferToBase64(encryptedBuffer);
}

/**
 * Decrypts the encrypted AES conversation key using own RSA Private Key (JWK)
 */
export async function decryptAESKeyWithRSAPrivate(
  encryptedAESKeyBase64: string,
  ownRSAPrivateKeyBase64: string
): Promise<string> {
  const ownJWK = JSON.parse(window.atob(ownRSAPrivateKeyBase64));
  const rsaPrivateKey = await window.crypto.subtle.importKey(
    'jwk',
    ownJWK,
    {
      name: 'RSA-OAEP',
      hash: 'SHA-256',
    },
    true,
    ['decrypt']
  );

  const encryptedBuffer = base64ToArrayBuffer(encryptedAESKeyBase64);
  const decryptedBuffer = await window.crypto.subtle.decrypt(
    {
      name: 'RSA-OAEP',
    },
    rsaPrivateKey,
    encryptedBuffer
  );

  return arrayBufferToBase64(decryptedBuffer);
}

/**
 * Encrypts a message using a shared AES key
 */
export async function encryptMessage(
  text: string,
  aesKey: CryptoKey
): Promise<{ ciphertext: string; iv: string }> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const iv = window.crypto.getRandomValues(new Uint8Array(12)); // 96-bit IV recommended for GCM

  const ciphertextBuffer = await window.crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv,
    },
    aesKey,
    data
  );

  return {
    ciphertext: arrayBufferToBase64(ciphertextBuffer),
    iv: arrayBufferToBase64(iv.buffer),
  };
}

/**
 * Decrypts a message using a shared AES key and IV
 */
export async function decryptMessage(
  ciphertextBase64: string,
  ivBase64: string,
  aesKey: CryptoKey
): Promise<string> {
  try {
    const ciphertext = base64ToArrayBuffer(ciphertextBase64);
    const iv = base64ToArrayBuffer(ivBase64);

    const decryptedBuffer = await window.crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: new Uint8Array(iv),
      },
      aesKey,
      ciphertext
    );

    const decoder = new TextDecoder();
    return decoder.decode(decryptedBuffer);
  } catch (err) {
    console.error('Failed to decrypt message:', err);
    return '[Decryption failed: Key mismatch or tampered payload]';
  }
}
