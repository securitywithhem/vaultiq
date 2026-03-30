/**
 * =============================================================
 * VaultIQ — Cryptography Utilities
 * =============================================================
 * AES-256-CBC encryption/decryption with random IV per file.
 * SHA-256 hashing for integrity verification.
 *
 * Flow:
 *   Upload:  plaintext → sha256(plaintext) → encrypt(plaintext) → store ciphertext + IV
 *   Download: fetch ciphertext + IV → decrypt → sha256(decrypted) → compare hash
 * =============================================================
 */

const crypto = require('crypto');

const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16; // AES block size

/**
 * Get the 32-byte encryption key from the env variable (64 hex chars).
 * @returns {Buffer} 32-byte key
 */
function getEncryptionKey() {
  const keyHex = process.env.ENCRYPTION_KEY;
  if (!keyHex || keyHex.length !== 64) {
    throw new Error(
      'ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes). ' +
      'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
    );
  }
  return Buffer.from(keyHex, 'hex');
}

/**
 * Compute SHA-256 hash of a buffer.
 * @param {Buffer} buffer - Data to hash
 * @returns {string} Hex-encoded SHA-256 digest
 */
function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * Encrypt a buffer with AES-256-CBC using a fresh random IV.
 * @param {Buffer} plainBuffer - Raw file data
 * @returns {{ encryptedBuffer: Buffer, iv: string }} Ciphertext + IV (hex string)
 */
function encrypt(plainBuffer) {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plainBuffer), cipher.final()]);

  return {
    encryptedBuffer: encrypted,
    iv: iv.toString('hex'),
  };
}

/**
 * Decrypt a buffer with AES-256-CBC.
 * @param {Buffer} encryptedBuffer - Ciphertext
 * @param {string} ivHex - Initialization vector as hex string
 * @returns {Buffer} Decrypted plaintext buffer
 */
function decrypt(encryptedBuffer, ivHex) {
  const key = getEncryptionKey();
  const iv = Buffer.from(ivHex, 'hex');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  const decrypted = Buffer.concat([decipher.update(encryptedBuffer), decipher.final()]);

  return decrypted;
}

module.exports = { sha256, encrypt, decrypt };
