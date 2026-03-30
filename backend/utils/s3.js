/**
 * =============================================================
 * VaultIQ — AWS S3 Utilities (SDK v3)
 * =============================================================
 * Provides upload, download, and delete helpers for S3.
 * The IV is stored as S3 object metadata under x-amz-meta-iv
 * so it can be retrieved during download for decryption.
 * =============================================================
 */

const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} = require('@aws-sdk/client-s3');

/**
 * Create the S3 client configured from env variables.
 */
const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'ap-south-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const getBucket = () => process.env.S3_BUCKET_NAME;

/**
 * Upload an encrypted buffer to S3.
 * @param {string} key       - S3 object key (e.g. "uploads/<userId>/<uuid>")
 * @param {Buffer} buffer    - Encrypted file data
 * @param {string} mimeType  - Original MIME type (stored for reference)
 * @param {string} ivHex     - AES IV as hex string, stored in metadata
 * @returns {Promise<object>} S3 PutObject response
 */
async function uploadToS3(key, buffer, mimeType, ivHex) {
  const command = new PutObjectCommand({
    Bucket: getBucket(),
    Key: key,
    Body: buffer,
    ContentType: 'application/octet-stream', // always octet-stream since it's encrypted
    Metadata: {
      iv: ivHex,
      'original-content-type': mimeType || 'application/octet-stream',
    },
  });

  return s3Client.send(command);
}

/**
 * Download an encrypted buffer from S3 along with the IV from metadata.
 * @param {string} key - S3 object key
 * @returns {Promise<{ buffer: Buffer, iv: string }>}
 */
async function downloadFromS3(key) {
  const command = new GetObjectCommand({
    Bucket: getBucket(),
    Key: key,
  });

  const response = await s3Client.send(command);

  // Convert the readable stream to a Buffer
  const chunks = [];
  for await (const chunk of response.Body) {
    chunks.push(chunk);
  }
  const buffer = Buffer.concat(chunks);

  // Retrieve the IV from S3 object metadata
  // AWS SDK v3 lowercases all metadata keys
  const iv = response.Metadata?.iv || response.Metadata?.IV || '';

  return { buffer, iv };
}

/**
 * Delete an object from S3.
 * @param {string} key - S3 object key
 * @returns {Promise<object>} S3 DeleteObject response
 */
async function deleteFromS3(key) {
  const command = new DeleteObjectCommand({
    Bucket: getBucket(),
    Key: key,
  });

  return s3Client.send(command);
}

/**
 * Check if an object exists in S3 (head request).
 * @param {string} key - S3 object key
 * @returns {Promise<boolean>}
 */
async function existsInS3(key) {
  try {
    const command = new HeadObjectCommand({
      Bucket: getBucket(),
      Key: key,
    });
    await s3Client.send(command);
    return true;
  } catch (err) {
    if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) {
      return false;
    }
    throw err;
  }
}

module.exports = { s3Client, uploadToS3, downloadFromS3, deleteFromS3, existsInS3 };
