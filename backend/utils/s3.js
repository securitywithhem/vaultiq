/**
 * @file s3.js
 * @description AWS S3 interaction bindings
 * @dependencies @aws-sdk/client-s3
 * @exports s3Client, uploadToS3, downloadFromS3, deleteFromS3
 */

const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');

const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});

const getBucket = () => process.env.S3_BUCKET_NAME;

async function uploadToS3(key, buffer, mimeType, iv) {
  try {
    const command = new PutObjectCommand({
      Bucket: getBucket(),
      Key: key,
      Body: buffer,
      ContentType: mimeType || 'application/octet-stream'
      // Note: IV is now prepended to buffer, no need to store in metadata
    });
    return await s3Client.send(command);
  } catch (err) {
    console.error('[uploadToS3]', err.message);
    throw err;
  }
}

async function downloadFromS3(key) {
  try {
    const command = new GetObjectCommand({
      Bucket: getBucket(),
      Key: key
    });
    const response = await s3Client.send(command);

    // IV is now prepended to the file (first 16 bytes)
    const chunks = [];
    for await (const chunk of response.Body) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }

    const fullData = Buffer.concat(chunks);
    
    // Extract prepended IV (first 16 bytes)
    const iv = fullData.slice(0, 16);
    const ciphertext = fullData.slice(16);

    if (fullData.length < 16) {
      throw new Error('File corruption: IV missing');
    }

    // For large files, return as stream
    if (response.ContentLength > 10 * 1024 * 1024) {
      return { 
        body: response.Body, 
        metadata: { iv }, 
        isStream: true 
      };
    }

    return { 
      body: ciphertext, 
      metadata: { iv }, 
      isStream: false 
    };
  } catch (err) {
    console.error('[downloadFromS3]', err.message);
    throw err;
  }
}

async function deleteFromS3(key) {
  try {
    const command = new DeleteObjectCommand({
      Bucket: getBucket(),
      Key: key
    });
    return await s3Client.send(command);
  } catch (err) {
    console.error('[deleteFromS3]', err.message);
    throw err;
  }
}

module.exports = { s3Client, uploadToS3, downloadFromS3, deleteFromS3 };
