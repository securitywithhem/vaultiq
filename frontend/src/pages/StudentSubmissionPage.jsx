import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import toast from 'react-hot-toast';
import StudentSubmissionForm from '../components/StudentSubmissionForm';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

export default function StudentSubmissionPage() {
  const { shareCode } = useParams();
  const [collection, setCollection] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    fetchCollection();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shareCode]);

  const fetchCollection = async () => {
    try {
      const response = await fetch(`${API_URL}/api/share/${shareCode}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      const contentType = response.headers.get('content-type');
      let data;
      if (contentType && contentType.includes('application/json')) {
        data = await response.json();
      } else {
        throw new Error('Invalid collection share code or collection not found');
      }
      if (!response.ok) throw new Error(data.error || 'Collection not found');
      setCollection(data);
    } catch (err) {
      setError(err.message || 'Failed to load collection');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (formData) => {
    setIsSubmitting(true);
    try {
      const response = await fetch(`${API_URL}/api/share/${shareCode}/submit`, {
        method: 'POST',
        body: formData,
      });
      const contentType = response.headers.get('content-type');
      let data = {};
      if (contentType && contentType.includes('application/json')) {
        data = await response.json();
      }
      if (!response.ok) {
        const errorMsg = data.error || `Submission failed (${response.status})`;
        toast.error(errorMsg);
        setIsSubmitting(false);
        return;
      }
      toast.success('Submission received!');
      setSuccess(true);
    } catch (err) {
      toast.error(err.message || 'Network error. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <>
        <Toaster position="top-right" />
        <div className="flex items-center justify-center h-screen">
          <div className="w-8 h-8 border-4 border-violet-500/20 border-t-violet-500 rounded-full animate-spin" />
        </div>
      </>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-950 to-black flex items-center justify-center p-4">
        <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-8 text-center max-w-md">
          <h2 className="text-2xl font-bold text-red-400 mb-2">Unable to open form</h2>
          <p className="text-red-300">{error}</p>
        </div>
      </div>
    );
  }

  if (!collection) {
    return <div className="text-center py-8 text-red-400">Collection not found</div>;
  }

  if (success) {
    return (
      <>
        <Toaster position="top-right" />
        <div className="min-h-screen bg-gradient-to-b from-gray-950 to-black flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-emerald-500/10 border border-emerald-500/20 rounded-3xl p-10 text-center">
            <div className="w-16 h-16 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg className="w-8 h-8 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-3xl font-bold text-emerald-400 mb-2">Submission received</h2>
            <p className="text-emerald-300/90 mb-6">Thanks! Your teacher will review your submission shortly.</p>
            <button
              onClick={() => { setSuccess(false); window.location.reload(); }}
              className="px-6 py-2 bg-emerald-600 text-white text-sm font-bold rounded-xl hover:bg-emerald-500 transition"
            >
              Submit another response
            </button>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Toaster position="top-right" />
      <div className="min-h-screen bg-gradient-to-b from-gray-950 to-black p-4">
        <div className="max-w-2xl mx-auto py-12">
          <div className="text-center mb-10">
            <h1 className="text-4xl font-bold text-white mb-3">{collection.name}</h1>
            {collection.description && (
              <p className="text-gray-400 text-base whitespace-pre-wrap">{collection.description}</p>
            )}
            <p className="text-gray-500 text-sm mt-3">Complete the form below to submit your assignment</p>
          </div>

          <div className="bg-gray-900 border border-gray-800 rounded-3xl p-8">
            <StudentSubmissionForm collection={collection} onSubmit={handleSubmit} isLoading={isSubmitting} />
          </div>

          <p className="text-center text-xs text-gray-600 mt-6">Powered by VaultIQ</p>
        </div>
      </div>
    </>
  );
}
