// backend/utils/collectionHelpers.js

const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const { v4: uuidv4 } = require("uuid");
const axios = require("axios");

const s3Client = new S3Client({ region: process.env.AWS_REGION });

/**
 * Generate a unique, unguessable share code
 * @returns {string} 12-character alphanumeric code
 */
function generateShareCode() {
  return uuidv4().substring(0, 12).replace(/-/g, "");
}

/**
 * Upload a file to S3 in the collection folder
 * @param {Buffer} fileBuffer - File contents
 * @param {string} collectionId - Collection ID
 * @param {string} submissionId - Submission ID
 * @param {string} filename - Original filename
 * @returns {Promise<string>} S3 path (e.g., collections/uuid/uuid/filename)
 */
async function uploadToS3(fileBuffer, collectionId, submissionId, filename) {
  const s3Path = `collections/${collectionId}/${submissionId}/${filename}`;
  const params = {
    Bucket: process.env.AWS_BUCKET_NAME,
    Key: s3Path,
    Body: fileBuffer,
  };

  try {
    await s3Client.send(new PutObjectCommand(params));
    return s3Path;
  } catch (error) {
    console.error("S3 upload failed:", error);
    throw new Error(`Failed to upload ${filename} to S3`);
  }
}

/**
 * Call FastAPI service to detect AI in a file
 * @param {string} s3Path - S3 file path
 * @param {Buffer} fileBuffer - File contents for detection
 * @returns {Promise<Object>} Detection result {ai_score, verdict, confidence, chunk_scores, similarity_score}
 */
async function callAIDetection(s3Path, fileBuffer) {
  try {
    // Create FormData and send to FastAPI
    const FormData = require("form-data");
    const form = new FormData();
    form.append("file", fileBuffer, s3Path.split("/").pop());

    const response = await axios.post(
      `${process.env.FASTAPI_URL}/detect`,
      form,
      {
        headers: form.getHeaders(),
      }
    );

    return {
      ai_score: response.data.score || 0,
      verdict: response.data.verdict || "human",
      confidence: response.data.confidence || "low",
      chunk_scores: response.data.chunks || [],
      similarity_score: response.data.similarity_score || 0,
    };
  } catch (error) {
    console.error("FastAPI detection failed:", error);
    throw new Error("AI detection service unavailable");
  }
}

module.exports = {
  generateShareCode,
  uploadToS3,
  callAIDetection,
};
