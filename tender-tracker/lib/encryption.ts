import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto';

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;

function getKey(): Buffer {
  const raw = process.env.SESSION_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error('Missing SESSION_ENCRYPTION_KEY env var (64-char hex)');
  }
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    return Buffer.from(raw, 'hex');
  }
  // Fall back to SHA-256 of arbitrary string so dev setups don't need exact hex.
  return createHash('sha256').update(raw).digest();
}

/**
 * Encrypt a plaintext string into a URL-safe compact token.
 * Format: base64url( iv(12) | authTag(16) | ciphertext ).
 */
export function encryptSession(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]).toString('base64url');
}

export function decryptSession(token: string): string {
  const key = getKey();
  const buf = Buffer.from(token, 'base64url');
  if (buf.length < IV_LEN + 16 + 1) {
    throw new Error('Invalid session token');
  }
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + 16);
  const ciphertext = buf.subarray(IV_LEN + 16);
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString('utf8');
}
