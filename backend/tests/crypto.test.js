/**
 * Tests for backend/utils/crypto.js
 * Covers: encrypt/decrypt round-trip, sha256 determinism, IV uniqueness,
 * tamper detection, and createDecipher with both Buffer and hex-string IVs.
 */

// Set env before requiring the module
process.env.ENCRYPTION_KEY = 'a'.repeat(64); // 32-byte key (all 0xaa)

const { encrypt, decrypt, sha256, createDecipher } = require('../utils/crypto');

describe('crypto utils', () => {
  const plaintext = Buffer.from('Hello, VaultIQ!');

  // ─── encrypt / decrypt round-trip ────────────────────────────────
  test('encrypt + decrypt returns original plaintext', () => {
    const { data: ciphertext, iv } = encrypt(plaintext);
    const result = decrypt(ciphertext, iv);
    expect(result).toEqual(plaintext);
  });

  test('decrypt with hex-string IV returns original plaintext', () => {
    const { data: ciphertext, iv } = encrypt(plaintext);
    const hexIV = iv.toString('hex');
    const result = decrypt(ciphertext, hexIV);
    expect(result).toEqual(plaintext);
  });

  // ─── IV uniqueness ────────────────────────────────────────────────
  test('each encrypt call produces a different IV', () => {
    const { iv: iv1 } = encrypt(plaintext);
    const { iv: iv2 } = encrypt(plaintext);
    expect(iv1.toString('hex')).not.toBe(iv2.toString('hex'));
  });

  test('each encrypt call produces different ciphertext', () => {
    const { data: c1 } = encrypt(plaintext);
    const { data: c2 } = encrypt(plaintext);
    expect(c1.toString('hex')).not.toBe(c2.toString('hex'));
  });

  // ─── tamper detection ────────────────────────────────────────────
  test('decrypt throws when ciphertext is tampered', () => {
    const { data: ciphertext, iv } = encrypt(plaintext);
    const tampered = Buffer.from(ciphertext);
    tampered[0] ^= 0xff; // flip bits in first byte
    expect(() => decrypt(tampered, iv)).toThrow();
  });

  // ─── sha256 ──────────────────────────────────────────────────────
  test('sha256 returns a 64-character hex string', () => {
    const hash = sha256(plaintext);
    expect(typeof hash).toBe('string');
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  test('sha256 is deterministic', () => {
    expect(sha256(plaintext)).toBe(sha256(plaintext));
  });

  test('sha256 differs for different inputs', () => {
    expect(sha256(plaintext)).not.toBe(sha256(Buffer.from('different')));
  });

  // ─── createDecipher ──────────────────────────────────────────────
  test('createDecipher returns a Decipher with a write method', () => {
    const { iv } = encrypt(plaintext);
    const decipher = createDecipher(iv);
    expect(typeof decipher.write).toBe('function');
    expect(typeof decipher.final).toBe('function');
  });
});
