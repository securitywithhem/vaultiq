import React from 'react';
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

export default function CollectionAnalytics({ submissions }) {
  // Submission timeline (last 14 days)
  const getTimelineData = () => {
    const last14Days = {};
    const now = new Date();
    for (let i = 13; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      last14Days[dateStr] = 0;
    }

    submissions.forEach((sub) => {
      const date = new Date(sub.submitted_at);
      const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      if (last14Days.hasOwnProperty(dateStr)) {
        last14Days[dateStr]++;
      }
    });

    return Object.entries(last14Days).map(([date, count]) => ({ date, count }));
  };

  // Verdict distribution
  const getVerdictData = () => {
    let human = 0,
      mixed = 0,
      ai = 0;
    submissions.forEach((sub) => {
      const verdict = sub.files.find((f) => f.verdict === 'ai')
        ? 'ai'
        : sub.files.find((f) => f.verdict === 'mixed')
          ? 'mixed'
          : 'human';
      if (verdict === 'human') human++;
      else if (verdict === 'mixed') mixed++;
      else ai++;
    });
    return [
      { name: 'Human Written', value: human, fill: '#10b981' },
      { name: 'Mixed Content', value: mixed, fill: '#f59e0b' },
      { name: 'AI Generated', value: ai, fill: '#ef4444' },
    ];
  };

  // AI score distribution histogram
  const getScoreHistogram = () => {
    const buckets = [
      { range: '0-10%', count: 0 },
      { range: '10-20%', count: 0 },
      { range: '20-30%', count: 0 },
      { range: '30-40%', count: 0 },
      { range: '40-50%', count: 0 },
      { range: '50-60%', count: 0 },
      { range: '60-70%', count: 0 },
      { range: '70-80%', count: 0 },
      { range: '80-90%', count: 0 },
      { range: '90-100%', count: 0 },
    ];

    submissions.forEach((sub) => {
      const maxScore = Math.max(...sub.files.map((f) => f.ai_score || 0));
      const percentage = Math.round(maxScore * 100);
      const bucketIndex = Math.floor(percentage / 10);
      if (bucketIndex < 10) {
        buckets[bucketIndex].count++;
      }
    });

    return buckets;
  };

  // Detection status
  const getDetectionStats = () => {
    let pending = 0,
      processing = 0,
      completed = 0,
      failed = 0;
    submissions.forEach((sub) => {
      sub.files.forEach((file) => {
        if (file.detection_status === 'pending') pending++;
        else if (file.detection_status === 'processing') processing++;
        else if (file.detection_status === 'completed') completed++;
        else if (file.detection_status === 'failed') failed++;
      });
    });
    return { pending, processing, completed, failed };
  };

  // Top flagged submissions
  const getTopFlagged = () => {
    return submissions
      .map((sub) => ({
        name: sub.student_name,
        score: Math.round(Math.max(...sub.files.map((f) => f.ai_score || 0)) * 100),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
  };

  const timelineData = getTimelineData();
  const verdictData = getVerdictData();
  const scoreHistogram = getScoreHistogram();
  const detectionStats = getDetectionStats();
  const topFlagged = getTopFlagged();

  return (
    <div className="space-y-8">
      {/* Key Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <p className="text-xs text-gray-600 mb-1 uppercase tracking-widest">Completed</p>
          <p className="text-3xl font-bold text-green-400">{detectionStats.completed}</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <p className="text-xs text-gray-600 mb-1 uppercase tracking-widest">Processing</p>
          <p className="text-3xl font-bold text-blue-400">{detectionStats.processing}</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <p className="text-xs text-gray-600 mb-1 uppercase tracking-widest">Pending</p>
          <p className="text-3xl font-bold text-yellow-400">{detectionStats.pending}</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <p className="text-xs text-gray-600 mb-1 uppercase tracking-widest">Failed</p>
          <p className="text-3xl font-bold text-red-400">{detectionStats.failed}</p>
        </div>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Submission Timeline */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h3 className="text-sm font-bold text-white mb-4">Submissions Timeline (14 days)</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={timelineData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="date" stroke="#9ca3af" style={{ fontSize: '12px' }} />
              <YAxis stroke="#9ca3af" style={{ fontSize: '12px' }} />
              <Tooltip
                contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px' }}
                labelStyle={{ color: '#f3f4f6' }}
              />
              <Bar dataKey="count" fill="#8b5cf6" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Verdict Distribution */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h3 className="text-sm font-bold text-white mb-4">Verdict Distribution</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={verdictData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, value }) => `${name}: ${value}`}
                outerRadius={100}
                fill="#8884d8"
                dataKey="value"
              >
                {verdictData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.fill} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px' }}
                labelStyle={{ color: '#f3f4f6' }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* AI Score Histogram */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
        <h3 className="text-sm font-bold text-white mb-4">AI Score Distribution</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={scoreHistogram}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis dataKey="range" stroke="#9ca3af" style={{ fontSize: '12px' }} />
            <YAxis stroke="#9ca3af" style={{ fontSize: '12px' }} />
            <Tooltip
              contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px' }}
              labelStyle={{ color: '#f3f4f6' }}
            />
            <Bar dataKey="count" fill="#f97316" radius={[8, 8, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Top Flagged */}
      {topFlagged.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h3 className="text-sm font-bold text-white mb-4">Top 5 Highest AI Scores</h3>
          <div className="space-y-2">
            {topFlagged.map((item, i) => (
              <div key={i} className="flex items-center justify-between p-3 bg-gray-950/50 rounded-lg">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-400 font-bold w-6 text-center">{i + 1}.</span>
                  <span className="text-sm text-white truncate">{item.name}</span>
                </div>
                <span className="text-sm font-bold text-red-400">{item.score}%</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
