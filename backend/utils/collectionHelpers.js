const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const { v4: uuidv4 } = require("uuid");
const axios = require("axios");
const FormData = require("form-data");

const s3Client = new S3Client({ region: process.env.AWS_REGION });

/**
 * Generate a unique, unguessable 12-character share code
 * @returns {string} alphanumeric code
 */
function generateShareCode() {
  return uuidv4().substring(0, 12).replace(/-/g, "");
}

/**
 * Upload file to S3 in collection folder structure
 * @param {Buffer} fileBuffer - file contents
 * @param {string} collectionId - collection UUID
 * @param {string} submissionId - submission UUID
 * @param {string} filename - original filename
 * @returns {Promise<string>} S3 path (collections/collectionId/submissionId/filename)
 */
async function uploadToS3(fileBuffer, collectionId, submissionId, filename) {
  // INPUT VALIDATION
  if (!Buffer.isBuffer(fileBuffer)) {
    throw new Error("fileBuffer must be a Buffer");
  }
  if (!filename || typeof filename !== 'string' || filename.trim() === '') {
    throw new Error("filename must be a non-empty string");
  }
  if (!collectionId || typeof collectionId !== 'string' || collectionId.trim() === '') {
    throw new Error("collectionId must be a non-empty string");
  }
  if (!submissionId || typeof submissionId !== 'string' || submissionId.trim() === '') {
    throw new Error("submissionId must be a non-empty string");
  }

  // MAX FILE SIZE CHECK - 100MB limit
  const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB
  if (fileBuffer.length > MAX_FILE_SIZE) {
    throw new Error(`File size exceeds limit of 100MB (got ${(fileBuffer.length / 1024 / 1024).toFixed(1)}MB)`);
  }

  const s3Path = `collections/${collectionId}/${submissionId}/${filename}`;
  const params = {
    Bucket: process.env.AWS_BUCKET_NAME,
    Key: s3Path,
    Body: fileBuffer,
  };

  try {
    await s3Client.send(new PutObjectCommand(params));
    console.log(`✓ Uploaded ${filename} to S3`);
    return s3Path;
  } catch (error) {
    console.error("S3 upload error:", error);
    throw new Error(`Failed to upload ${filename} to S3: ${error.message}`);
  }
}

/**
 * Call FastAPI AI detection service
 * @param {Buffer} fileBuffer - file contents
 * @param {string} filename - original filename
 * @returns {Promise<Object>} detection result {ai_score, verdict, confidence, chunk_scores, similarity_score}
 */
async function callAIDetection(fileBuffer, filename) {
  // INPUT VALIDATION
  if (!Buffer.isBuffer(fileBuffer)) {
    throw new Error("fileBuffer must be a Buffer");
  }
  if (!filename || typeof filename !== 'string' || filename.trim() === '') {
    throw new Error("filename must be a non-empty string");
  }

  try {
    const form = new FormData();
    form.append("file", fileBuffer, filename);

    const response = await axios.post(
      `${process.env.AI_SERVICE_URL || process.env.FASTAPI_URL}/detect`,
      form,
      {
        headers: form.getHeaders(),
        timeout: 30000,
      }
    );

    console.log(`✓ AI detection completed for ${filename}`);
    return {
      ai_score: response.data.score || response.data.ai_score || 0,
      verdict: response.data.verdict || "human",
      confidence: response.data.confidence || "low",
      chunk_scores: response.data.chunk_scores || response.data.chunks || [],
      similarity_score: response.data.similarity_score || 0,
    };
  } catch (error) {
    console.error("FastAPI detection error:", error.message);
    throw new Error(`AI detection failed: ${error.message}`);
  }
}

module.exports = {
  generateShareCode,
  uploadToS3,
  callAIDetection,
};
