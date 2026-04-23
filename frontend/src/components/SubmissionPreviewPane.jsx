import React, { useState } from 'react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';

export default function SubmissionPreviewPane({
  submission,
  onStatusChange,
  onClose,
  onPrevious,
  onNext,
  hasPrevious,
  hasNext,
}) {
  const [comment, setComment] = useState('');
  const [loadingFile, setLoadingFile] = useState(null);

  if (!submission) {
    return (
      <div className="flex-1 bg-gray-900 border-l border-gray-800 flex items-center justify-center">
        <p className="text-gray-500">Select a submission to preview</p>
      </div>
    );
  }

  const currentFile = submission.files[0]; // Show first file by default
  const maxScore = Math.max(...submission.files.map((f) => f.ai_score || 0));
  const verdict = submission.files.find((f) => f.verdict === 'ai')
    ? 'ai'
    : submission.files.find((f) => f.verdict === 'mixed')
      ? 'mixed'
      : 'human';

  const handleAddComment = () => {
    if (comment.trim()) {
      toast.success('Comment saved');
      setComment('');
      // TODO: Save comment to backend
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      className="flex-1 bg-gray-900 border-l border-gray-800 flex flex-col overflow-hidden"
    >
      {/* Header */}
      <div className="border-b border-gray-800 p-4 flex items-center justify-between bg-gray-950">
        <div className="flex-1">
          <h3 className="text-lg font-bold text-white">{submission.student_name}</h3>
          <p className="text-xs text-gray-500">
            {submission.student_id && submission.student_id !== 'N/A'
              ? `ID: ${submission.student_id}`
              : ''}{' '}
            • {new Date(submission.submitted_at).toLocaleString()}
          </p>
        </div>
        <button
          onClick={onClose}
          className="text-gray-500 hover:text-gray-300 text-2xl leading-none"
        >
          ✕
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto flex flex-col">
        {/* File Preview Section */}
        <div className="flex-1 bg-black border-b border-gray-800 flex flex-col">
          <div className="p-4 bg-gray-950 border-b border-gray-800">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-xs text-gray-600 uppercase tracking-widest mb-1">
                  File Preview
                </p>
                <p className="text-sm text-white font-mono break-all">{currentFile.filename}</p>
              </div>
              {currentFile.download_url && (
                <a
                  href={currentFile.download_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 bg-violet-600 text-white text-xs font-bold rounded hover:bg-violet-500 transition whitespace-nowrap ml-4"
                >
                  Download
                </a>
              )}
            </div>

            {/* File Stats */}
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-gray-900 rounded-lg p-2">
                <p className="text-[10px] text-gray-600 uppercase">AI Score</p>
                <p className="text-lg font-bold text-orange-400">
                  {Math.round((currentFile.ai_score || 0) * 100)}%
                </p>
              </div>
              <div className="bg-gray-900 rounded-lg p-2">
                <p className="text-[10px] text-gray-600 uppercase">Verdict</p>
                <p className="text-sm font-bold text-red-400">
                  {currentFile.verdict || 'Pending'}
                </p>
              </div>
              <div className="bg-gray-900 rounded-lg p-2">
                <p className="text-[10px] text-gray-600 uppercase">Status</p>
                <p className="text-sm font-bold text-blue-400">
                  {currentFile.detection_status || 'N/A'}
                </p>
              </div>
            </div>
          </div>

          {/* Preview Container */}
          <div className="flex-1 p-6 overflow-auto">
            {currentFile.download_url ? (
              <div className="space-y-4">
                <div className="bg-gray-950 rounded-lg border border-gray-800 p-4 text-center">
                  <p className="text-sm text-gray-400 mb-3">
                    📄 {currentFile.filename}
                  </p>
                  <div className="space-y-2">
                    <p className="text-xs text-gray-500">
                      File preview opens in new tab
                    </p>
                    <a
                      href={currentFile.download_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-block px-4 py-2 bg-violet-600 text-white text-sm font-bold rounded-lg hover:bg-violet-500 transition"
                    >
                      🔍 View File in New Tab
                    </a>
                  </div>
                </div>

                {/* Quick Metadata */}
                <div className="bg-gray-950 rounded-lg border border-gray-800 p-4 space-y-2">
                  <p className="text-xs text-gray-600 uppercase tracking-widest mb-3">
                    Detection Details
                  </p>
                  {currentFile.confidence && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Confidence:</span>
                      <span className="text-white font-bold capitalize">
                        {currentFile.confidence}
                      </span>
                    </div>
                  )}
                  {currentFile.similarity_score && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Similarity:</span>
                      <span className="text-white font-bold">
                        {Math.round(currentFile.similarity_score * 100)}%
                      </span>
                    </div>
                  )}
                  {currentFile.detected_at && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Detected:</span>
                      <span className="text-white font-bold">
                        {new Date(currentFile.detected_at).toLocaleString()}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-gray-500">
                <p>File preview not available</p>
              </div>
            )}
          </div>
        </div>

        {/* Submission Details Section */}
        <div className="p-4 border-b border-gray-800 bg-gray-950">
          <p className="text-xs text-gray-600 uppercase tracking-widest mb-3">
            Submission Details
          </p>
          <div className="space-y-2">
            {submission.student_email && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Email:</span>
                <span className="text-white">{submission.student_email}</span>
              </div>
            )}
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Files:</span>
              <span className="text-white">{submission.files.length}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Max AI Score:</span>
              <span className="text-orange-400 font-bold">
                {Math.round(maxScore * 100)}%
              </span>
            </div>
            {submission.student_notes && (
              <div className="mt-3 p-2 bg-gray-900 rounded-lg border border-gray-800">
                <p className="text-[10px] text-gray-600 mb-1">Student Notes:</p>
                <p className="text-xs text-gray-300 whitespace-pre-wrap">
                  {submission.student_notes}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Review Status Section */}
        <div className="p-4 border-b border-gray-800">
          <p className="text-xs text-gray-600 uppercase tracking-widest mb-3">
            Review Status
          </p>
          <select
            value={submission.review_status || 'unreviewed'}
            onChange={(e) => {
              onStatusChange(submission.id, e.target.value);
            }}
            className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:border-violet-500 outline-none"
          >
            <option value="unreviewed">☐ Unreviewed</option>
            <option value="reviewed">✓ Reviewed</option>
            <option value="flagged">⚠ Flagged</option>
            <option value="approved">✅ Approved</option>
          </select>
        </div>

        {/* Comments Section */}
        <div className="p-4">
          <p className="text-xs text-gray-600 uppercase tracking-widest mb-3">
            Faculty Comments
          </p>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Add feedback or notes for this submission..."
            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-600 focus:border-violet-500 outline-none resize-none"
            rows="3"
          />
          <button
            onClick={handleAddComment}
            disabled={!comment.trim()}
            className="mt-2 w-full px-4 py-2 bg-violet-600 text-white text-sm font-bold rounded-lg hover:bg-violet-500 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Save Comment
          </button>
        </div>
      </div>

      {/* Footer Navigation */}
      <div className="border-t border-gray-800 p-4 bg-gray-950 flex gap-2">
        <button
          onClick={onPrevious}
          disabled={!hasPrevious}
          className="flex-1 px-4 py-2 bg-gray-800 text-white text-sm font-bold rounded-lg hover:bg-gray-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          ← Previous
        </button>
        <button
          onClick={onNext}
          disabled={!hasNext}
          className="flex-1 px-4 py-2 bg-gray-800 text-white text-sm font-bold rounded-lg hover:bg-gray-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Next →
        </button>
      </div>
    </motion.div>
  );
}
