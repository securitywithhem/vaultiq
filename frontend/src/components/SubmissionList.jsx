import React, { useState } from 'react';
import { motion } from 'framer-motion';

export default function SubmissionList({ submissions, onRunDetection }) {
  const [search, setSearch] = useState('');
  const [filterVerdict, setFilterVerdict] = useState('all');
  const [sortBy, setSortBy] = useState('submitted_at');
  const [expandedId, setExpandedId] = useState(null);

  const filtered = submissions
    .filter((s) => s.student_name.toLowerCase().includes(search.toLowerCase()))
    .filter((s) => {
      if (filterVerdict === 'all') return true;
      const hasVerdict = s.files.some((f) => f.verdict === filterVerdict);
      return hasVerdict;
    })
    .sort((a, b) => {
      if (sortBy === 'submitted_at') return new Date(b.submitted_at) - new Date(a.submitted_at);
      if (sortBy === 'ai_score') {
        const scoreA = Math.max(...a.files.map((f) => f.ai_score || 0));
        const scoreB = Math.max(...b.files.map((f) => f.ai_score || 0));
        return scoreB - scoreA;
      }
      return 0;
    });

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex gap-4 mb-6">
        <input
          type="text"
          placeholder="Search by student name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 px-4 py-2 bg-gray-900 border border-gray-800 rounded-xl text-white placeholder-gray-600 focus:border-violet-500 outline-none"
        />
        <select
          value={filterVerdict}
          onChange={(e) => setFilterVerdict(e.target.value)}
          className="px-4 py-2 bg-gray-900 border border-gray-800 rounded-xl text-white focus:border-violet-500 outline-none"
        >
          <option value="all">All Verdicts</option>
          <option value="human">Human Written</option>
          <option value="mixed">Mixed</option>
          <option value="ai">AI Generated</option>
        </select>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          className="px-4 py-2 bg-gray-900 border border-gray-800 rounded-xl text-white focus:border-violet-500 outline-none"
        >
          <option value="submitted_at">Latest First</option>
          <option value="ai_score">Highest Score</option>
        </select>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-gray-800">
            <tr className="text-xs text-gray-600 uppercase tracking-widest">
              <th className="text-left py-3 px-4">Student Name</th>
              <th className="text-center py-3 px-4">Files</th>
              <th className="text-center py-3 px-4">AI Score</th>
              <th className="text-center py-3 px-4">Status</th>
              <th className="text-center py-3 px-4">Verdict</th>
              <th className="text-center py-3 px-4">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {filtered.map((sub) => {
              const maxScore = Math.max(...sub.files.map((f) => f.ai_score || 0));
              const verdict = sub.files.find((f) => f.verdict === 'ai') ? 'ai' : sub.files.find((f) => f.verdict === 'mixed') ? 'mixed' : 'human';

              return (
                <motion.tr
                  key={sub.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="hover:bg-gray-900/50 cursor-pointer"
                  onClick={() => setExpandedId(expandedId === sub.id ? null : sub.id)}
                >
                  <td className="py-3 px-4 text-white font-semibold">{sub.student_name}</td>
                  <td className="py-3 px-4 text-center text-gray-400">{sub.files.length}</td>
                  <td className="py-3 px-4 text-center font-mono text-orange-400">{Math.round(maxScore * 100)}%</td>
                  <td className="py-3 px-4 text-center">
                    {sub.files.some((f) => f.detection_status === 'processing') && (
                      <span className="text-xs text-blue-400">Processing</span>
                    )}
                    {sub.files.every((f) => f.detection_status === 'completed') && (
                      <span className="text-xs text-green-400">Completed</span>
                    )}
                    {sub.files.some((f) => f.detection_status === 'pending') && (
                      <span className="text-xs text-gray-500">Pending</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-center">
                    <VerdictBadge verdict={verdict} />
                  </td>
                  <td className="py-3 px-4 text-center">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onRunDetection(sub.id);
                      }}
                      className="text-xs text-violet-400 hover:text-violet-300"
                    >
                      Detect
                    </button>
                  </td>
                </motion.tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-8 text-gray-500">No submissions match your filters.</div>
      )}
    </div>
  );
}

function VerdictBadge({ verdict }) {
  const cfg = {
    human: { label: 'Human Written', bg: 'bg-emerald-500/10 text-emerald-400' },
    mixed: { label: 'Mixed Content', bg: 'bg-amber-500/10 text-amber-400' },
    ai: { label: 'AI Generated', bg: 'bg-red-500/10 text-red-400' },
  }[verdict] || { label: '—', bg: 'bg-gray-800 text-gray-400' };

  return <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded ${cfg.bg}`}>{cfg.label}</span>;
}
