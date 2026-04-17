import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { createCollection } from '../api/collectionsApi';

export default function CreateCollectionPage() {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    auto_detect_enabled: true,
    expires_at: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(null);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      setError('Collection name is required');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const result = await createCollection(formData);
      setSuccess(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-950 to-black p-8">
        <div className="max-w-2xl mx-auto">
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-emerald-500/10 border border-emerald-500/20 rounded-3xl p-12 text-center">
            <div className="w-16 h-16 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg className="w-8 h-8 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-3xl font-bold text-emerald-400 mb-4">Collection Created!</h2>
            <p className="text-emerald-300 mb-6">Share this link with your students:</p>

            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 mb-6">
              <input
                type="text"
                readOnly
                value={`${window.location.origin}/submit/${success.data?.shareCode}`}
                className="w-full px-4 py-3 bg-black text-white text-center font-mono text-sm rounded-lg"
              />
            </div>

            <div className="flex gap-4 justify-center">
              <button
                onClick={() => navigator.clipboard.writeText(`${window.location.origin}/submit/${success.data?.shareCode}`)}
                className="px-6 py-3 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-500 transition"
              >
                Copy Link
              </button>
              <button
                onClick={() => navigate(`/collections/${success.data?.id}`)}
                className="px-6 py-3 bg-violet-600 text-white font-bold rounded-xl hover:bg-violet-500 transition"
              >
                Go to Dashboard
              </button>
            </div>
          </motion.div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-950 to-black p-8">
      <div className="max-w-2xl mx-auto">
        <div className="mb-12">
          <h1 className="text-4xl font-bold text-white mb-2">Create New Collection</h1>
          <p className="text-gray-400">Set up an assignment collection link for your students</p>
        </div>

        <motion.form
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          onSubmit={handleSubmit}
          className="bg-gray-900 border border-gray-800 rounded-3xl p-8 space-y-6"
        >
          {error && <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">{error}</div>}

          {/* Name */}
          <div>
            <label className="block text-sm font-bold text-white mb-2">Collection Name *</label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g., Assignment 1 - Poetry Analysis"
              className="w-full px-4 py-3 bg-black border border-gray-800 rounded-xl text-white placeholder-gray-600 focus:border-violet-500 outline-none"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-bold text-white mb-2">Description</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Describe the assignment or provide instructions..."
              rows="4"
              className="w-full px-4 py-3 bg-black border border-gray-800 rounded-xl text-white placeholder-gray-600 focus:border-violet-500 outline-none resize-none"
            />
          </div>

          {/* Auto-detect Toggle */}
          <div>
            <label className="flex items-center gap-4">
              <input
                type="checkbox"
                checked={formData.auto_detect_enabled}
                onChange={(e) => setFormData({ ...formData, auto_detect_enabled: e.target.checked })}
                className="w-5 h-5 rounded accent-violet-600"
              />
              <span className="text-sm font-bold text-white">
                Auto-detect AI in submissions
                <span className="block text-xs text-gray-500 font-normal">Detection runs automatically when students submit</span>
              </span>
            </label>
          </div>

          {/* Deadline */}
          <div>
            <label className="block text-sm font-bold text-white mb-2">Deadline (Optional)</label>
            <input
              type="datetime-local"
              value={formData.expires_at}
              onChange={(e) => setFormData({ ...formData, expires_at: e.target.value })}
              className="w-full px-4 py-3 bg-black border border-gray-800 rounded-xl text-white focus:border-violet-500 outline-none"
            />
          </div>

          {/* Buttons */}
          <div className="flex gap-4 pt-6">
            <button
              type="button"
              onClick={() => navigate('/collections')}
              className="flex-1 px-6 py-3 bg-gray-800 text-white font-bold rounded-xl hover:bg-gray-700 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-6 py-3 bg-gradient-to-r from-violet-600 to-violet-500 text-white font-bold rounded-xl hover:scale-105 transition-transform disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Creating...' : 'Create Collection'}
            </button>
          </div>
        </motion.form>
      </div>
    </div>
  );
}
