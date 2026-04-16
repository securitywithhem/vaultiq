/**
 * @file detectionHelper.js
 * @description Background detection processing helper
 * @exports processDetectionsAsync
 */

const { supabase } = require("../data/supabaseClient");
const { callAIDetection } = require("./collectionHelpers");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const { S3Client, GetObjectCommand } = require("@aws-sdk/client-s3");

const s3Client = new S3Client({ region: process.env.AWS_REGION });

/**
 * Background function to process detections
 * Updates detection_status as it goes
 */
async function processDetectionsAsync(results, collectionId) {
  for (const result of results) {
    try {
      // Update status to processing
      await supabase
        .from("ai_detection_results")
        .update({ detection_status: "processing" })
        .eq("id", result.id);

      // Get file from S3 and run detection
      const signedUrl = await getSignedUrl(
        s3Client,
        new GetObjectCommand({
          Bucket: process.env.AWS_BUCKET_NAME,
          Key: result.s3_file_path,
        }),
        { expiresIn: 3600 }
      );

      // Fetch file from S3
      const fileResponse = await fetch(signedUrl);
      const arrayBuffer = await fileResponse.arrayBuffer();
      const fileBuffer = Buffer.from(arrayBuffer);

      // Call FastAPI
      const detection = await callAIDetection(fileBuffer, result.filename);

      // Update result
      await supabase
        .from("ai_detection_results")
        .update({
          detection_status: "completed",
          ai_score: detection.ai_score,
          verdict: detection.verdict,
          confidence: detection.confidence,
          chunk_scores: detection.chunk_scores,
          similarity_score: detection.similarity_score,
          detected_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", result.id);

      console.log(`Detection completed for ${result.filename}`);
    } catch (error) {
      console.error(`Detection failed for ${result.filename}:`, error);

      // Update status to failed with error message
      await supabase
        .from("ai_detection_results")
        .update({
          detection_status: "failed",
          error_message: error.message || "Unknown error",
          updated_at: new Date().toISOString(),
        })
        .eq("id", result.id);
    }
  }
}

module.exports = { processDetectionsAsync };
