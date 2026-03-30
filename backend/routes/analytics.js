/**
 * =============================================================
 * VaultIQ — Analytics Routes
 * =============================================================
 * GET /api/analytics — returns aggregated analytics data
 *
 * Reads the latest Spark-generated result JSON from HDFS.
 * If HDFS / Spark data is unavailable, returns mock data
 * so the frontend never breaks.
 * =============================================================
 */

const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { readFromHDFS, listHDFS } = require('../utils/hdfsLogger');
const getSupabase = require('../utils/supabase');

const router = express.Router();

/**
 * Generate fallback/mock analytics data from Supabase
 * when HDFS/Spark results are unavailable.
 */
async function generateFallbackAnalytics(userId) {
  const analytics = {
    topFiles: [],
    storagePerUser: [],
    dailyTrend: [],
    anomalies: [],
  };

  try {
    const supabase = getSupabase();

    // Top files — most recently uploaded
    const { data: files } = await supabase
      .from('files')
      .select('filename, file_size, uploaded_at')
      .eq('user_id', userId)
      .order('uploaded_at', { ascending: false })
      .limit(10);

    if (files && files.length > 0) {
      // Simulate access counts based on recency
      analytics.topFiles = files.map((f, i) => ({
        filename: f.filename,
        access_count: Math.max(10 - i * 2, 1),
      }));

      // Storage per user — just this user's total
      const totalBytes = files.reduce((sum, f) => sum + (f.file_size || 0), 0);
      analytics.storagePerUser = [
        { user_id: userId, total_bytes: totalBytes },
      ];

      // Daily trend — group uploads by date
      const dateCounts = {};
      files.forEach((f) => {
        const date = new Date(f.uploaded_at).toISOString().split('T')[0];
        dateCounts[date] = (dateCounts[date] || 0) + 1;
      });
      analytics.dailyTrend = Object.entries(dateCounts)
        .map(([date, count]) => ({ date, count }))
        .sort((a, b) => a.date.localeCompare(b.date));
    }
  } catch (err) {
    // TODO: remove in prod
    console.error('[Analytics] Fallback generation error:', err.message);
  }

  return analytics;
}

// ---------------------------------------------------------------
// GET /api/analytics
// ---------------------------------------------------------------
router.get('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    // Attempt to read the latest Spark results from HDFS
    let sparkData = null;

    // Try the primary results path
    sparkData = await readFromHDFS('/vaultiq/results/analytics.json');

    // If primary path fails, try listing the results directory for the latest file
    if (!sparkData) {
      const fileList = await listHDFS('/vaultiq/results');
      if (fileList && fileList.length > 0) {
        // Sort by modification time descending, grab the newest
        const sorted = fileList
          .filter((f) => f.type === 'FILE' && f.pathSuffix.endsWith('.json'))
          .sort((a, b) => b.modificationTime - a.modificationTime);

        if (sorted.length > 0) {
          sparkData = await readFromHDFS(`/vaultiq/results/${sorted[0].pathSuffix}`);
        }
      }
    }

    // If Spark data is available, return it
    if (sparkData) {
      // Normalize the field names to what the frontend expects
      const result = {
        topFiles: sparkData.topFiles || sparkData.top_files || [],
        storagePerUser: sparkData.storagePerUser || sparkData.storage_per_user || [],
        dailyTrend: sparkData.dailyTrend || sparkData.daily_trend || [],
        anomalies: sparkData.anomalies || [],
      };

      return res.status(200).json(result);
    }

    // Fallback: generate analytics from Supabase data
    // TODO: remove in prod
    console.log('[Analytics] HDFS/Spark data unavailable — using fallback');
    const fallback = await generateFallbackAnalytics(userId);

    return res.status(200).json(fallback);
  } catch (err) {
    // TODO: remove in prod
    console.error('[Analytics] Crash:', err);

    // Even on error, return mock data so frontend never breaks
    return res.status(200).json({
      topFiles: [],
      storagePerUser: [],
      dailyTrend: [],
      anomalies: [],
    });
  }
});

module.exports = router;
