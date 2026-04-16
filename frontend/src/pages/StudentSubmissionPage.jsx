import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import StudentSubmissionForm from '../components/StudentSubmissionForm';

export default function StudentSubmissionPage() {
  const { shareCode } = useParams();
  const [collection, setCollection] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    fetchCollection();
  }, [shareCode]);

  const fetchCollection = async () => {
    try {
      const response = await fetch(`/api/share/${shareCode}`);
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Collection not found');
      }
      setCollection(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (formData) => {
    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/share/${shareCode}/submit`, {
        method: 'POST',
        body: formData,
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Submission failed');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="w-8 h-8 border-4 border-violet-500/20 border-t-violet-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-950 to-black flex items-center justify-center p-4">
        <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-8 text-center">
          <h2 className="text-2xl font-bold text-red-400 mb-2">Oops!</h2>
          <p className="text-red-300">{error}</p>
        </div>
      </div>
    );
  }

  if (!collection) {
    return <div className="text-center py-8 text-red-400">Collection not found</div>;
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-950 to-black p-4">
      <div className="max-w-2xl mx-auto py-12">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-white mb-4">{collection.name}</h1>
          <p className="text-gray-400 text-lg">Submit your assignment below</p>
        </div>

        {/* Form */}
        <div className="bg-gray-900 border border-gray-800 rounded-3xl p-8">
          <StudentSubmissionForm collectionName={collection.name} onSubmit={handleSubmit} isLoading={isSubmitting} />
        </div>
      </div>
    </div>
  );
}
