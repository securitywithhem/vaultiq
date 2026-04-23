import React, { useState } from 'react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';

export default function SubmissionList({
  submissions,
  onRunDetection,
  onStatusChange,
  onBulkDetect,
  onBulkStatusChange,
  onBulkDelete,
  selectedSubmissionId,
  onSelectSubmission,
}) {
  const [search, setSearch] = useState('');
  const [filterVerdict, setFilterVerdict] = useState('all');
  const [sortBy, setSortBy] = useState('submitted_at');
  const [expandedId, setExpandedId] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());

  const filtered = submissions
    .filter((s) => {
      const q = search.toLowerCase();
      return (
        s.student_name.toLowerCase().includes(q) ||
        (s.student_email || '').toLowerCase().includes(q) ||
        (s.student_id || '').toLowerCase().includes(q)
      );
    })
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

  const toggleSelectAll = () => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((s) => s.id)));
    }
  };

  const toggleSelect = (id) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedIds(newSet);
  };

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

      {/* Bulk Action Bar */}
      {selectedIds.size > 0 && (onBulkDetect || onBulkStatusChange || onBulkDelete) && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-violet-600/10 border border-violet-500/20 rounded-xl p-4 flex flex-wrap gap-3 items-center"
        >
          <span className="text-sm text-violet-300 font-bold">{selectedIds.size} selected</span>
          {onBulkDetect && (
            <button
              onClick={() => {
                onBulkDetect(Array.from(selectedIds));
                setSelectedIds(new Set());
              }}
              className="px-3 py-1.5 bg-violet-600 text-white text-xs font-bold rounded hover:bg-violet-500 transition"
            >
              Run Detection
            </button>
          )}
          {onBulkStatusChange && (
            <select
              onChange={(e) => {
                if (e.target.value) {
                  onBulkStatusChange(Array.from(selectedIds), e.target.value);
                  setSelectedIds(new Set());
                }
              }}
              defaultValue=""
              className="px-3 py-1.5 bg-gray-800 text-white text-xs font-bold rounded hover:bg-gray-700 transition"
            >
              <option value="">Change Status</option>
              <option value="unreviewed">Unreviewed</option>
              <option value="reviewed">Reviewed</option>
              <option value="flagged">Flagged</option>
              <option value="approved">Approved</option>
            </select>
          )}
          {onBulkDelete && (
            <button
              onClick={() => {
                if (window.confirm(`Delete ${selectedIds.size} submission(s)?`)) {
                  onBulkDelete(Array.from(selectedIds));
                  setSelectedIds(new Set());
                }
              }}
              className="px-3 py-1.5 bg-red-600/20 text-red-400 text-xs font-bold rounded hover:bg-red-600/30 transition"
            >
              Delete
            </button>
          )}
          <button
            onClick={() => setSelectedIds(new Set())}
            className="ml-auto text-gray-500 hover:text-gray-300 text-sm"
          >
            ✕ Clear
          </button>
        </motion.div>
      )}

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-gray-800">
            <tr className="text-xs text-gray-600 uppercase tracking-widest">
              <th className="text-center py-3 px-4 w-12">
                <input
                  type="checkbox"
                  checked={selectedIds.size > 0 && selectedIds.size === filtered.length}
                  onChange={toggleSelectAll}
                  className="w-4 h-4 rounded accent-violet-600 cursor-pointer"
                />
              </th>
              <th className="text-left py-3 px-4">Student</th>
              <th className="text-left py-3 px-4">Email</th>
              <th className="text-center py-3 px-4">Files</th>
              <th className="text-center py-3 px-4">AI Score</th>
              <th className="text-center py-3 px-4">Detection</th>
              <th className="text-center py-3 px-4">Review Status</th>
              <th className="text-center py-3 px-4">Verdict</th>
              <th className="text-center py-3 px-4">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {filtered.map((sub) => {
              const maxScore = Math.max(...sub.files.map((f) => f.ai_score || 0));
              const verdict = sub.files.find((f) => f.verdict === 'ai') ? 'ai' : sub.files.find((f) => f.verdict === 'mixed') ? 'mixed' : 'human';
              const isOpen = expandedId === sub.id;
              const isSelected = selectedIds.has(sub.id);
              const customEntries = Object.entries(sub.custom_fields || {});

              return (
                <React.Fragment key={sub.id}>
                  <motion.tr
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className={`hover:bg-gray-900/50 cursor-pointer transition-colors ${
                      isSelected ? 'bg-violet-600/10' : ''
                    } ${selectedSubmissionId === sub.id ? 'bg-violet-600/20 border-l-4 border-l-violet-600' : ''}`}
                    onClick={() => {
                      setExpandedId(isOpen ? null : sub.id);
                      if (onSelectSubmission) {
                        onSelectSubmission(sub.id);
                      }
                    }}
                  >
                    <td
                      className="py-3 px-4 text-center"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(sub.id)}
                        className="w-4 h-4 rounded accent-violet-600 cursor-pointer"
                      />
                    </td>
                    <td className="py-3 px-4 text-white font-semibold">
                      <div>{sub.student_name}</div>
                      {sub.student_id && sub.student_id !== 'N/A' && (
                        <div className="text-xs text-gray-500 font-normal">{sub.student_id}</div>
                      )}
                    </td>
                    <td className="py-3 px-4 text-gray-400 text-xs">{sub.student_email || '—'}</td>
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
                      <ReviewStatusBadge status={sub.review_status || 'unreviewed'} />
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
                  {isOpen && (
                    <tr className="bg-gray-950/60">
                      <td colSpan={9} className="py-4 px-6 text-xs text-gray-400">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div>
                            <p className="text-[10px] text-gray-600 uppercase tracking-widest mb-2">Files</p>
                            <ul className="space-y-1">
                              {sub.files.map((f, i) => (
                                <li key={i} className="flex items-center justify-between bg-gray-900 border border-gray-800 rounded-lg px-3 py-2">
                                  <span className="truncate text-gray-300">{f.filename}</span>
                                  {f.download_url ? (
                                    <a
                                      href={f.download_url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      onClick={(e) => e.stopPropagation()}
                                      className="text-violet-400 hover:text-violet-300 font-bold"
                                    >
                                      Download
                                    </a>
                                  ) : (
                                    <span className="text-gray-600">—</span>
                                  )}
                                </li>
                              ))}
                            </ul>
                          </div>
                          <div>
                            <p className="text-[10px] text-gray-600 uppercase tracking-widest mb-2">Responses</p>
                            {sub.student_notes && (
                              <div className="mb-2">
                                <span className="text-gray-500">Notes: </span>
                                <span className="text-gray-300 whitespace-pre-wrap">{sub.student_notes}</span>
                              </div>
                            )}
                            {customEntries.length === 0 && !sub.student_notes && (
                              <p className="text-gray-600 italic">No additional responses.</p>
                            )}
                            {customEntries.map(([k, v]) => (
                              <div key={k} className="mb-1">
                                <span className="text-gray-500">{k}: </span>
                                <span className="text-gray-300">{String(v)}</span>
                              </div>
                            ))}
                          </div>
                          {onStatusChange && (
                            <div>
                              <p className="text-[10px] text-gray-600 uppercase tracking-widest mb-2">Review Status</p>
                              <select
                                value={sub.review_status || 'unreviewed'}
                                onChange={(e) => {
                                  onStatusChange(sub.id, e.target.value);
                                }}
                                className="w-full px-3 py-2 bg-gray-900 border border-gray-800 rounded-lg text-white text-sm focus:border-violet-500 outline-none"
                              >
                                <option value="unreviewed">Unreviewed</option>
                                <option value="reviewed">Reviewed</option>
                                <option value="flagged">Flagged</option>
                                <option value="approved">Approved</option>
                              </select>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
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

function ReviewStatusBadge({ status }) {
  const cfg = {
    unreviewed: { label: 'Unreviewed', bg: 'bg-gray-700/50 text-gray-300' },
    reviewed: { label: 'Reviewed', bg: 'bg-blue-500/10 text-blue-400' },
    flagged: { label: 'Flagged', bg: 'bg-red-500/10 text-red-400' },
    approved: { label: 'Approved', bg: 'bg-green-500/10 text-green-400' },
  }[status] || { label: '—', bg: 'bg-gray-800 text-gray-400' };

  return <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded ${cfg.bg}`}>{cfg.label}</span>;
}
