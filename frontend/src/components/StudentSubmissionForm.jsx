import React, { useState } from 'react';
import { useDropzone } from 'react-dropzone';

export default function StudentSubmissionForm({ collectionName, onSubmit, isLoading }) {
  const [formData, setFormData] = useState({
    student_name: '',
    student_id: '',
    student_notes: '',
  });
  const [files, setFiles] = useState([]);
  const [submitted, setSubmitted] = useState(false);

  const onDrop = (acceptedFiles) => {
    setFiles(acceptedFiles.slice(0, 5));
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': [],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': [],
      'text/plain': [],
    },
    maxFiles: 5,
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.student_name.trim() || files.length === 0) {
      alert('Please enter your name and select at least one file.');
      return;
    }

    const formDataToSend = new FormData();
    formDataToSend.append('student_name', formData.student_name);
    formDataToSend.append('student_id', formData.student_id);
    formDataToSend.append('student_notes', formData.student_notes);
    files.forEach((file) => formDataToSend.append('files', file));

    await onSubmit(formDataToSend);
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-8 text-center">
        <div className="w-12 h-12 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-6 h-6 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h3 className="text-xl font-bold text-emerald-400 mb-2">Submission Received!</h3>
        <p className="text-emerald-300 text-sm">Your assignment has been submitted successfully. Your teacher will review it shortly.</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Student Name */}
      <div>
        <label className="block text-sm font-bold text-white mb-2">Your Name *</label>
        <input
          type="text"
          required
          value={formData.student_name}
          onChange={(e) => setFormData({ ...formData, student_name: e.target.value })}
          placeholder="Enter your full name"
          className="w-full px-4 py-3 bg-gray-900 border border-gray-800 rounded-xl text-white placeholder-gray-600 focus:border-violet-500 outline-none"
        />
      </div>

      {/* Student ID */}
      <div>
        <label className="block text-sm font-bold text-white mb-2">Student ID (Optional)</label>
        <input
          type="text"
          value={formData.student_id}
          onChange={(e) => setFormData({ ...formData, student_id: e.target.value })}
          placeholder="e.g., 12345678"
          className="w-full px-4 py-3 bg-gray-900 border border-gray-800 rounded-xl text-white placeholder-gray-600 focus:border-violet-500 outline-none"
        />
      </div>

      {/* Notes */}
      <div>
        <label className="block text-sm font-bold text-white mb-2">Notes (Optional)</label>
        <textarea
          value={formData.student_notes}
          onChange={(e) => setFormData({ ...formData, student_notes: e.target.value })}
          placeholder="Add any comments or notes about your submission..."
          rows="3"
          className="w-full px-4 py-3 bg-gray-900 border border-gray-800 rounded-xl text-white placeholder-gray-600 focus:border-violet-500 outline-none resize-none"
        />
      </div>

      {/* File Upload */}
      <div>
        <label className="block text-sm font-bold text-white mb-2">Upload Files *</label>
        <div
          {...getRootProps()}
          className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition ${
            isDragActive ? 'border-violet-500 bg-violet-500/5' : 'border-gray-800 hover:border-gray-700'
          }`}
        >
          <input {...getInputProps()} />
          <div className="w-12 h-12 bg-gray-800 rounded-xl flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path d="M12 4v16m8-8H4" />
            </svg>
          </div>
          <p className="text-white font-semibold mb-1">
            {isDragActive ? 'Drop files here' : 'Select or drag files'}
          </p>
          <p className="text-xs text-gray-500">PDF, DOCX, or TXT • Max 5 files</p>
        </div>
      </div>

      {/* Selected Files */}
      {files.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <p className="text-xs font-bold text-gray-500 uppercase mb-3">Selected Files</p>
          <ul className="space-y-2">
            {files.map((f, i) => (
              <li key={i} className="flex items-center justify-between text-sm text-gray-300">
                <span className="truncate">{f.name}</span>
                <span className="text-xs text-gray-600">{(f.size / 1024).toFixed(1)}KB</span>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => setFiles([])}
            className="mt-3 text-xs text-gray-500 hover:text-white transition"
          >
            Clear All
          </button>
        </div>
      )}

      {/* Submit Button */}
      <button
        type="submit"
        disabled={isLoading || !formData.student_name || files.length === 0}
        className="w-full py-3 bg-gradient-to-r from-violet-600 to-violet-500 text-white font-bold rounded-xl hover:scale-[1.01] transition-transform disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isLoading ? 'Submitting...' : 'Submit Assignment'}
      </button>
    </form>
  );
}
