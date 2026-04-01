/**
 * @file crypto.js
 * @description Cryptography logic (AES-256-CBC, SHA-256)
 * @dependencies crypto
 * @exports encrypt, decrypt, sha256
 */

const crypto = require('crypto');

const ALGO = 'aes-256-cbc';
const keyHex = process.env.ENCRYPTION_KEY || '';

if (keyHex.length !== 64) {
  throw new Error('ENCRYPTION_KEY must be 64 hex characters (32 bytes)');
}

const KEY = Buffer.from(keyHex, 'hex');

function encrypt(buffer) {
  try {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(ALGO, KEY, iv);
    const data = Buffer.concat([cipher.update(buffer), cipher.final()]);
    
    return { data, iv };
  } catch (err) {
    console.error('[crypto.encrypt]', err.message);
    throw new Error('Failed to encrypt block');
  }
}

function decrypt(encryptedBuffer, iv) {
  try {
    if (typeof iv === 'string') {
      iv = Buffer.from(iv, 'hex');
    }
    
    const decipher = crypto.createDecipheriv(ALGO, KEY, iv);
    return Buffer.concat([decipher.update(encryptedBuffer), decipher.final()]);
  } catch (err) {
    console.error('[crypto.decrypt]', err.message);
    throw new Error('Failed to decrypt block (verify key validity)');
  }
}

function sha256(buffer) {
  try {
    return crypto.createHash('sha256').update(buffer).digest('hex');
  } catch (err) {
    console.error('[crypto.sha256]', err.message);
    throw new Error('Failed to compute hash');
  }
}

module.exports = {
  encrypt,
  decrypt,
  sha256
};
