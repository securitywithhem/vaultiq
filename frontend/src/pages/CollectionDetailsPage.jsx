import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import CollectionSummary from '../components/CollectionSummary';
import SubmissionList from '../components/SubmissionList';
import api from '../services/api';

export default function CollectionDetailsPage() {
  const { id } = useParams();
  const [collection, setCollection] = useState(null);
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchData();
    // Poll every 4 seconds for updates
    const interval = setInterval(fetchData, 4000);
    return () => clearInterval(interval);
  }, [id]);

  const fetchData = async () => {
    try {
      const colRes = await api.get(`/api/collections/${id}`);
      setCollection(colRes.data?.data || null);

      const subRes = await api.get(`/api/collections/${id}/submissions`);
      setSubmissions(subRes.data?.submissions || []);
    } catch (err) {
      setError('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleRunDetection = async (submissionId) => {
    try {
      await api.post(`/api/collections/${id}/detect`, { submissionIds: [submissionId] });
      // Refetch immediately to show processing status
      await fetchData();
    } catch (err) {
      setError('Failed to trigger detection');
    }
  };

  const handleRunAllDetection = async () => {
    try {
      await api.post(`/api/collections/${id}/detect`, {});
      await fetchData();
    } catch (err) {
      setError('Failed to trigger bulk detection');
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-screen"><div className="w-8 h-8 border-4 border-violet-500/20 border-t-violet-500 rounded-full animate-spin" /></div>;
  }

  if (!collection) {
    return <div className="text-center py-8 text-red-400">Collection not found</div>;
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-950 to-black p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">{collection.name}</h1>
          <p className="text-gray-400 mb-4">{collection.description}</p>
          <div className="flex gap-4">
            <span className="text-sm text-gray-500">Auto-detect: {collection.auto_detect_enabled ? '✓ ON' : '✗ OFF'}</span>
            <span className="text-sm text-gray-500">Status: {collection.status}</span>
          </div>
        </div>

        {error && <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 mb-6">{error}</div>}

        {/* Share Link */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-violet-500/5 border border-violet-500/20 rounded-xl p-4 mb-8">
          <p className="text-xs text-gray-500 uppercase mb-2">Share Link</p>
          <div className="flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={`${window.location.origin}/submit/${collection.shareCode}`}
              className="flex-1 px-4 py-2 bg-gray-900 border border-gray-800 rounded-lg text-white text-sm"
            />
            <button
              onClick={() => navigator.clipboard.writeText(`${window.location.origin}/submit/${collection.shareCode}`)}
              className="px-4 py-2 bg-violet-600 text-white text-sm rounded-lg hover:bg-violet-500"
            >
              Copy
            </button>
          </div>
        </motion.div>

        {/* Summary */}
        <CollectionSummary submissions={submissions} />

        {/* Bulk Actions */}
        <div className="mb-6 flex gap-4">
          <button
            onClick={handleRunAllDetection}
            className="px-6 py-2 bg-violet-600 text-white font-bold rounded-xl hover:scale-105 transition-transform"
          >
            Run All Detections
          </button>
          <button
            onClick={() => downloadCSV(submissions)}
            className="px-6 py-2 bg-gray-800 text-white font-bold rounded-xl hover:bg-gray-700 transition"
          >
            Download CSV
          </button>
        </div>

        {/* Submissions Table */}
        <SubmissionList submissions={submissions} onRunDetection={handleRunDetection} />
      </div>
    </div>
  );
}

function downloadCSV(submissions) {
  const rows = [
    ['Student Name', 'Student ID', 'File Count', 'Max AI Score', 'Verdict', 'Submitted At'],
    ...submissions.map((s) => [
      s.student_name,
      s.student_id,
      s.files.length,
      Math.round(Math.max(...s.files.map((f) => f.ai_score || 0)) * 100),
      s.files.find((f) => f.verdict === 'ai') ? 'AI' : s.files.find((f) => f.verdict === 'mixed') ? 'Mixed' : 'Human',
      new Date(s.submitted_at).toISOString(),
    ]),
  ];

  const csv = rows.map((row) => row.map((cell) => `"${cell}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'results.csv';
  a.click();
}
