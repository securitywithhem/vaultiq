import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import CollectionSummary from '../components/CollectionSummary';
import SubmissionList from '../components/SubmissionList';
import CollectionAnalytics from '../components/CollectionAnalytics';
import SubmissionPreviewPane from '../components/SubmissionPreviewPane';
import EditCollectionModal from '../components/EditCollectionModal';
import api from '../services/api';

export default function CollectionDetailsPage() {
  const { id } = useParams();
  const [collection, setCollection] = useState(null);
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showEditModal, setShowEditModal] = useState(false);
  const [activeTab, setActiveTab] = useState('submissions');
  const [selectedSubmissionId, setSelectedSubmissionId] = useState(null);

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

  const handleStatusChange = async (submissionId, status) => {
    try {
      const { updateSubmissionStatus } = await import('../api/collectionsApi');
      await updateSubmissionStatus(id, submissionId, status);
      toast.success('Status updated');
      await fetchData();
    } catch (err) {
      setError('Failed to update submission status');
      toast.error('Failed to update status');
    }
  };

  const handleBulkDetect = async (submissionIds) => {
    try {
      await api.post(`/api/collections/${id}/detect`, { submissionIds });
      toast.success('Detection started');
      await fetchData();
    } catch (err) {
      setError('Failed to trigger detection');
      toast.error('Failed to start detection');
    }
  };

  const handleBulkStatusChange = async (submissionIds, status) => {
    try {
      const { bulkUpdateSubmissionStatus } = await import('../api/collectionsApi');
      await bulkUpdateSubmissionStatus(id, submissionIds, status);
      toast.success(`Updated ${submissionIds.length} submissions`);
      await fetchData();
    } catch (err) {
      setError('Failed to update submissions');
      toast.error('Failed to update submissions');
    }
  };

  const handleBulkDelete = async (submissionIds) => {
    if (!window.confirm(`Delete ${submissionIds.length} submission(s)? This cannot be undone.`)) {
      return;
    }
    try {
      const { bulkDeleteSubmissions } = await import('../api/collectionsApi');
      await bulkDeleteSubmissions(id, submissionIds);
      toast.success(`Deleted ${submissionIds.length} submissions`);
      await fetchData();
    } catch (err) {
      setError('Failed to delete submissions');
      toast.error('Failed to delete submissions');
    }
  };

  // Get selected submission object
  const selectedSubmission = submissions.find((s) => s.id === selectedSubmissionId);

  // Get index for navigation
  const selectedIndex = submissions.findIndex((s) => s.id === selectedSubmissionId);

  const handleNextSubmission = () => {
    if (selectedIndex < submissions.length - 1) {
      setSelectedSubmissionId(submissions[selectedIndex + 1].id);
    }
  };

  const handlePreviousSubmission = () => {
    if (selectedIndex > 0) {
      setSelectedSubmissionId(submissions[selectedIndex - 1].id);
    }
  };

  const handleSelectSubmission = (submissionId) => {
    setSelectedSubmissionId(submissionId);
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
          <div className="flex items-center justify-between mb-2">
            <h1 className="text-4xl font-bold text-white">{collection.name}</h1>
            <button
              onClick={() => setShowEditModal(true)}
              className="px-4 py-2 bg-gray-800 text-white text-sm font-bold rounded-lg hover:bg-gray-700 transition"
            >
              ⚙️ Edit Settings
            </button>
          </div>
          <p className="text-gray-400 mb-4">{collection.description}</p>
          <div className="flex gap-4">
            <span className="text-sm text-gray-500">Auto-detect: {collection.autoDetectEnabled ? 'ON' : 'OFF'}</span>
            <span className="text-sm text-gray-500">Status: {collection.status}</span>
            {collection.expiresAt && (
              <span className="text-sm text-gray-500">Deadline: {new Date(collection.expiresAt).toLocaleString()}</span>
            )}
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

        {/* Tab Bar */}
        <div className="mb-6 flex gap-2 border-b border-gray-800">
          <button
            onClick={() => setActiveTab('submissions')}
            className={`px-4 py-3 font-bold transition-colors ${
              activeTab === 'submissions'
                ? 'text-violet-400 border-b-2 border-violet-400'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            Submissions ({submissions.length})
          </button>
          <button
            onClick={() => setActiveTab('analytics')}
            className={`px-4 py-3 font-bold transition-colors ${
              activeTab === 'analytics'
                ? 'text-violet-400 border-b-2 border-violet-400'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            Analytics
          </button>
        </div>

        {/* Submissions Tab */}
        {activeTab === 'submissions' && (
          <>
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

            {/* Split View: List + Preview */}
            <div className="flex gap-6 h-[calc(100vh-400px)] bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              {/* Left: Submissions List */}
              <div
                className={`overflow-y-auto ${
                  selectedSubmission ? 'w-1/3' : 'w-full'
                } transition-all duration-300`}
              >
                <SubmissionList
                  submissions={submissions}
                  onRunDetection={handleRunDetection}
                  onStatusChange={handleStatusChange}
                  onBulkDetect={handleBulkDetect}
                  onBulkStatusChange={handleBulkStatusChange}
                  onBulkDelete={handleBulkDelete}
                  selectedSubmissionId={selectedSubmissionId}
                  onSelectSubmission={handleSelectSubmission}
                />
              </div>

              {/* Right: Preview Pane */}
              {selectedSubmission && (
                <SubmissionPreviewPane
                  submission={selectedSubmission}
                  onStatusChange={handleStatusChange}
                  onClose={() => setSelectedSubmissionId(null)}
                  onNext={handleNextSubmission}
                  onPrevious={handlePreviousSubmission}
                  hasNext={selectedIndex < submissions.length - 1}
                  hasPrevious={selectedIndex > 0}
                />
              )}
            </div>
          </>
        )}

        {/* Analytics Tab */}
        {activeTab === 'analytics' && <CollectionAnalytics submissions={submissions} />}

        {/* Edit Modal */}
        {showEditModal && (
          <EditCollectionModal
            collection={collection}
            onSuccess={() => {
              setShowEditModal(false);
              fetchData();
            }}
            onCancel={() => setShowEditModal(false)}
          />
        )}
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
