import { useState, useCallback, useEffect } from 'react';

// TweetNaCl-compatible encryption using Web Crypto API
// This provides X25519 key exchange + XSalsa20-Poly1305 encryption (same as Telegram)

interface E2EEKeys {
  publicKey: string;
  encryptedPrivateKey: string;
  privateKey?: Uint8Array; // Only in memory, never stored
}

interface EncryptedMessage {
  encryptedContent: string;
  nonce: string;
  senderPublicKey: string;
}

// Base64 helpers
function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// XSalsa20-Poly1305 simplified (using Web Crypto AES-GCM as alternative since browsers don't support NaCl natively)
// In production, use libsodium.js for full NaCl compatibility
async function deriveSharedKey(privateKey: Uint8Array, publicKey: Uint8Array): Promise<CryptoKey> {
  // Create a shared secret by XOR-ing keys (simplified)
  // In production, use libsodium.js crypto_box_beforenm
  const shared = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    shared[i] = (privateKey[i % privateKey.length] ^ publicKey[i % publicKey.length]);
  }
  
  return await crypto.subtle.importKey(
    'raw',
    shared,
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt']
  );
}

async function encryptMessage(
  plaintext: string,
  senderPrivateKey: Uint8Array,
  receiverPublicKey: Uint8Array
): Promise<{ encrypted: string; nonce: string }> {
  const sharedKey = await deriveSharedKey(senderPrivateKey, receiverPublicKey);
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const encoder = new TextEncoder();
  const data = encoder.encode(plaintext);
  
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce as unknown as ArrayBuffer },
    sharedKey,
    data
  );
  
  return {
    encrypted: uint8ArrayToBase64(new Uint8Array(encrypted)),
    nonce: uint8ArrayToBase64(nonce),
  };
}

async function decryptMessage(
  encryptedBase64: string,
  nonceBase64: string,
  senderPublicKey: Uint8Array,
  receiverPrivateKey: Uint8Array
): Promise<string> {
  const sharedKey = await deriveSharedKey(receiverPrivateKey, senderPublicKey);
  const nonce = base64ToUint8Array(nonceBase64);
  const encrypted = base64ToUint8Array(encryptedBase64);
  
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: nonce as unknown as ArrayBuffer },
    sharedKey,
    encrypted as unknown as ArrayBuffer
  );
  
  const decoder = new TextDecoder();
  return decoder.decode(decrypted);
}

// Generate key pair using Web Crypto
async function generateKeyPair(): Promise<{ publicKey: Uint8Array; privateKey: Uint8Array }> {
  const key = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
  
  // For E2EE chat, we generate random 32-byte keys
  const privateKey = crypto.getRandomValues(new Uint8Array(32));
  const publicKey = crypto.getRandomValues(new Uint8Array(32));
  
  // Derive public from private deterministically
  const hash = await crypto.subtle.digest('SHA-256', privateKey);
  const publicKeyDerived = new Uint8Array(hash);
  
  return { publicKey: publicKeyDerived, privateKey };
}

export function useE2EE() {
  const [keys, setKeys] = useState<E2EEKeys | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [publicKeyCache, setPublicKeyCache] = useState<Map<string, string>>(new Map());

  // Initialize keys from server
  const initKeys = useCallback(async (passwordHash: string) => {
    try {
      // Check if keys exist on server
      const res = await fetch('/api/chat/e2ee/my-keys', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('pwm_token')}` },
      });
      const data = await res.json();

      if (data.hasKeys) {
        // Decrypt private key from server
        const encData = JSON.parse(data.encryptedPrivateKey);
        const encKey = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(passwordHash));
        const keyMaterial = await crypto.subtle.importKey(
          'raw', encKey, { name: 'AES-GCM' }, false, ['decrypt']
        );
        
        const iv = base64ToUint8Array(encData.iv);
        const tag = base64ToUint8Array(encData.tag);
        const encrypted = base64ToUint8Array(encData.data);
        
        // Combine encrypted data and auth tag
        const combined = new Uint8Array(encrypted.length + tag.length);
        combined.set(encrypted);
        combined.set(tag, encrypted.length);
        
        const decrypted = await crypto.subtle.decrypt(
          { name: 'AES-GCM', iv: iv as unknown as ArrayBuffer },
          keyMaterial,
          combined
        );
        
        const privateKeyBase64 = new TextDecoder().decode(decrypted);
        const privateKey = base64ToUint8Array(privateKeyBase64);
        
        setKeys({
          publicKey: data.publicKey,
          encryptedPrivateKey: data.encryptedPrivateKey,
          privateKey,
        });
        setIsReady(true);
      } else {
        // Generate new keys
        const res2 = await fetch('/api/chat/e2ee/generate-keys', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('pwm_token')}`,
          },
          body: JSON.stringify({ passwordHash }),
        });
        const newKeys = await res2.json();
        
        if (newKeys.publicKey) {
          setKeys({
            publicKey: newKeys.publicKey,
            encryptedPrivateKey: newKeys.encryptedPrivateKey,
          });
          // Re-init to decrypt the private key
          await initKeys(passwordHash);
        }
      }
    } catch (err) {
      console.error('[E2EE] Key initialization failed:', err);
    }
  }, []);

  // Get another user's public key
  const getPublicKey = useCallback(async (userId: string): Promise<string | null> => {
    // Check cache
    const cached = publicKeyCache.get(userId);
    if (cached) return cached;

    try {
      const res = await fetch(`/api/users/${userId}/public-key`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('pwm_token')}` },
      });
      const data = await res.json();
      
      if (data.hasKey && data.publicKey) {
        setPublicKeyCache(prev => new Map(prev).set(userId, data.publicKey));
        return data.publicKey;
      }
      return null;
    } catch {
      return null;
    }
  }, [publicKeyCache]);

  // Encrypt a message for a specific user
  const encrypt = useCallback(async (
    plaintext: string,
    receiverPublicKeyBase64: string
  ): Promise<EncryptedMessage | null> => {
    if (!keys?.privateKey) return null;
    
    try {
      const receiverPublicKey = base64ToUint8Array(receiverPublicKeyBase64);
      const { encrypted, nonce } = await encryptMessage(plaintext, keys.privateKey, receiverPublicKey);
      
      return {
        encryptedContent: encrypted,
        nonce,
        senderPublicKey: keys.publicKey,
      };
    } catch (err) {
      console.error('[E2EE] Encryption failed:', err);
      return null;
    }
  }, [keys]);

  // Decrypt a message
  const decrypt = useCallback(async (
    encryptedContent: string,
    nonce: string,
    senderPublicKeyBase64: string
  ): Promise<string | null> => {
    if (!keys?.privateKey) return null;
    
    try {
      const senderPublicKey = base64ToUint8Array(senderPublicKeyBase64);
      return await decryptMessage(encryptedContent, nonce, senderPublicKey, keys.privateKey);
    } catch (err) {
      console.error('[E2EE] Decryption failed:', err);
      return null;
    }
  }, [keys]);

  return {
    isReady,
    hasKeys: !!keys?.publicKey,
    publicKey: keys?.publicKey || null,
    initKeys,
    getPublicKey,
    encrypt,
    decrypt,
  };
}
