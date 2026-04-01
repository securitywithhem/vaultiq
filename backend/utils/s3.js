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
      ContentType: mimeType || 'application/octet-stream',
      Metadata: { iv }
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
    const chunks = [];
    
    for await (const chunk of response.Body) {
      chunks.push(chunk);
    }
    
    return { body: Buffer.concat(chunks), metadata: response.Metadata };
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
