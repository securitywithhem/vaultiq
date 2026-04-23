import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import api from '../services/api';

export default function CollectionsPage() {
  const [collections, setCollections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortBy, setSortBy] = useState('newest');
  const navigate = useNavigate();

  useEffect(() => {
    fetchCollections();
  }, []);

  const fetchCollections = async () => {
    try {
      const response = await api.get('/api/collections');
      setCollections(response.data?.data?.collections || []);
    } catch (err) {
      setError('Failed to load collections');
    } finally {
      setLoading(false);
    }
  };

  // Compute displayed collections based on search, filter, and sort
  const displayedCollections = collections
    .filter((col) => {
      const matchesSearch = col.name.toLowerCase().includes(search.toLowerCase()) ||
                           (col.description && col.description.toLowerCase().includes(search.toLowerCase()));
      const matchesStatus = statusFilter === 'all' || col.status === statusFilter;
      return matchesSearch && matchesStatus;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'oldest':
          return new Date(a.createdAt) - new Date(b.createdAt);
        case 'most-submissions':
          return b.submissionCount - a.submissionCount;
        case 'newest':
        default:
          return new Date(b.createdAt) - new Date(a.createdAt);
      }
    });

  const copyLink = (e, shareCode) => {
    e.stopPropagation();
    navigator.clipboard.writeText(`${window.location.origin}/submit/${shareCode}`);
    toast.success('Submit link copied');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="w-8 h-8 border-4 border-violet-500/20 border-t-violet-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-950 to-black p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-12">
          <div>
            <h1 className="text-4xl font-bold text-white mb-2">Assignment Collections</h1>
            <p className="text-gray-400">Create and manage assignment submission links</p>
          </div>
          <button
            onClick={() => navigate('/collections/new')}
            className="px-6 py-3 bg-gradient-to-r from-violet-600 to-violet-500 text-white font-bold rounded-xl hover:scale-105 transition-transform"
          >
            + New Collection
          </button>
        </div>

        {/* Filter bar */}
        {collections.length > 0 && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-6 flex flex-wrap gap-4">
            <div className="flex-1 min-w-[200px]">
              <input
                type="text"
                placeholder="Search collections..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full px-4 py-2 bg-black border border-gray-800 rounded-lg text-white text-sm placeholder-gray-600 focus:border-violet-500 outline-none"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-4 py-2 bg-black border border-gray-800 rounded-lg text-white text-sm focus:border-violet-500 outline-none"
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="closed">Closed</option>
              <option value="archived">Archived</option>
            </select>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="px-4 py-2 bg-black border border-gray-800 rounded-lg text-white text-sm focus:border-violet-500 outline-none"
            >
              <option value="newest">Newest</option>
              <option value="oldest">Oldest</option>
              <option value="most-submissions">Most Submissions</option>
            </select>
          </div>
        )}

        {error && (
          <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 mb-6">{error}</div>
        )}

        {displayedCollections.length === 0 && collections.length > 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500 text-lg">No collections match your search.</p>
          </div>
        ) : collections.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500 text-lg">No collections yet. Create one to get started.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {displayedCollections.map((col) => (
              <motion.div
                key={col.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                onClick={() => navigate(`/collections/${col.id}`)}
                className="p-6 bg-gray-900 border border-gray-800 rounded-2xl cursor-pointer hover:border-violet-500/50 transition-all group"
              >
                <div className="flex items-start justify-between mb-2">
                  <h3 className="text-lg font-bold text-white group-hover:text-violet-400 transition-colors">
                    {col.name}
                  </h3>
                  <span className="text-xs font-bold px-2 py-1 bg-violet-500/10 text-violet-300 rounded-lg">
                    {col.submissionCount ?? 0} {col.submissionCount === 1 ? 'submission' : 'submissions'}
                  </span>
                </div>

                <p className="text-sm text-gray-500 mb-4 line-clamp-2 min-h-[2.5rem]">
                  {col.description || 'No description'}
                </p>

                {col.shareCode && (
                  <div className="bg-black border border-gray-800 rounded-lg p-2 flex items-center gap-2 mb-3">
                    <span className="flex-1 text-xs text-gray-400 font-mono truncate">
                      /submit/{col.shareCode}
                    </span>
                    <button
                      onClick={(e) => copyLink(e, col.shareCode)}
                      className="px-2 py-1 text-xs font-bold bg-violet-600 text-white rounded hover:bg-violet-500 transition"
                    >
                      Copy
                    </button>
                  </div>
                )}

                <div className="flex items-center justify-between text-xs text-gray-600">
                  <span className="capitalize">{col.status}</span>
                  <span>{new Date(col.createdAt).toLocaleDateString()}</span>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
