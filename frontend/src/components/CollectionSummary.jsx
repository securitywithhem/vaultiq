import React from 'react';

export default function CollectionSummary({ submissions }) {
  const totalSubmissions = submissions.length;
  const aiDetectedCount = submissions.reduce((count, sub) => {
    const hasAI = sub.files.some((f) => f.verdict === 'ai');
    return hasAI ? count + 1 : count;
  }, 0);
  const aiRate = totalSubmissions > 0 ? Math.round((aiDetectedCount / totalSubmissions) * 100) : 0;

  const allScores = submissions.flatMap((s) => s.files.map((f) => f.ai_score).filter((s) => s !== null));
  const avgScore = allScores.length > 0 ? (allScores.reduce((a, b) => a + b) / allScores.length * 100).toFixed(1) : 0;

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <p className="text-xs text-gray-600 mb-1 uppercase tracking-widest">Total Submissions</p>
        <p className="text-3xl font-bold text-white">{totalSubmissions}</p>
      </div>
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <p className="text-xs text-gray-600 mb-1 uppercase tracking-widest">AI Detection Rate</p>
        <p className="text-3xl font-bold text-red-400">{aiRate}%</p>
      </div>
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <p className="text-xs text-gray-600 mb-1 uppercase tracking-widest">Average AI Score</p>
        <p className="text-3xl font-bold text-orange-400">{avgScore}%</p>
      </div>
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <p className="text-xs text-gray-600 mb-1 uppercase tracking-widest">Model Used</p>
        <p className="text-sm font-bold text-violet-400">v1.0</p>
      </div>
    </div>
  );
}
