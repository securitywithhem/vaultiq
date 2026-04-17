import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { createCollection } from '../api/collectionsApi';

const FILE_TYPE_OPTIONS = ['pdf', 'docx', 'txt', 'doc', 'png', 'jpg', 'jpeg'];
const FIELD_TYPE_OPTIONS = [
  { value: 'text', label: 'Short text' },
  { value: 'textarea', label: 'Long text' },
  { value: 'email', label: 'Email' },
  { value: 'number', label: 'Number' },
  { value: 'select', label: 'Dropdown' },
];

export default function CreateCollectionPage() {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    auto_detect_enabled: true,
    expires_at: '',
    max_file_size_mb: 25,
    allowed_types: ['pdf', 'docx', 'txt'],
    fields: [],
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(null);
  const navigate = useNavigate();

  const addField = () =>
    setFormData((prev) => ({
      ...prev,
      fields: [
        ...prev.fields,
        { id: `field_${Date.now()}`, label: '', type: 'text', required: false, options: [] },
      ],
    }));

  const updateField = (idx, patch) =>
    setFormData((prev) => ({
      ...prev,
      fields: prev.fields.map((f, i) => (i === idx ? { ...f, ...patch } : f)),
    }));

  const removeField = (idx) =>
    setFormData((prev) => ({ ...prev, fields: prev.fields.filter((_, i) => i !== idx) }));

  const toggleType = (type) =>
    setFormData((prev) => ({
      ...prev,
      allowed_types: prev.allowed_types.includes(type)
        ? prev.allowed_types.filter((t) => t !== type)
        : [...prev.allowed_types, type],
    }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      setError('Collection name is required');
      return;
    }
    if (!formData.allowed_types.length) {
      setError('Select at least one allowed file type');
      return;
    }
    const invalidField = formData.fields.find((f) => !f.label.trim());
    if (invalidField) {
      setError('All custom fields need a label');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const dataToSend = { ...formData };
      if (formData.expires_at) dataToSend.expires_at = new Date(formData.expires_at).toISOString();
      dataToSend.fields = formData.fields.map((f) => ({
        id: f.id,
        label: f.label.trim(),
        type: f.type,
        required: Boolean(f.required),
        options: f.type === 'select'
          ? (Array.isArray(f.options) ? f.options : String(f.options || '').split(',')).map((o) => String(o).trim()).filter(Boolean)
          : [],
      }));
      const result = await createCollection(dataToSend);
      setSuccess(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    const shareLink = `${window.location.origin}/submit/${success.data?.shareCode}`;
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-950 to-black p-8">
        <div className="max-w-2xl mx-auto">
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-emerald-500/10 border border-emerald-500/20 rounded-3xl p-12 text-center">
            <div className="w-16 h-16 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg className="w-8 h-8 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-3xl font-bold text-emerald-400 mb-4">Collection Created!</h2>
            <p className="text-emerald-300 mb-6">Share this link with your students:</p>

            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 mb-6">
              <input type="text" readOnly value={shareLink} className="w-full px-4 py-3 bg-black text-white text-center font-mono text-sm rounded-lg" />
            </div>

            <div className="flex gap-4 justify-center">
              <button onClick={() => navigator.clipboard.writeText(shareLink)} className="px-6 py-3 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-500 transition">
                Copy Link
              </button>
              <button onClick={() => navigate(`/collections/${success.data?.id}`)} className="px-6 py-3 bg-violet-600 text-white font-bold rounded-xl hover:bg-violet-500 transition">
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
          <p className="text-gray-400">Set up a public submission form for your students</p>
        </div>

        <motion.form
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          onSubmit={handleSubmit}
          className="bg-gray-900 border border-gray-800 rounded-3xl p-8 space-y-6"
        >
          {error && <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">{error}</div>}

          <Field label="Collection Name *">
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g., Assignment 1 — Poetry Analysis"
              className="w-full px-4 py-3 bg-black border border-gray-800 rounded-xl text-white placeholder-gray-600 focus:border-violet-500 outline-none"
            />
          </Field>

          <Field label="Description">
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Instructions or context for students..."
              rows="3"
              className="w-full px-4 py-3 bg-black border border-gray-800 rounded-xl text-white placeholder-gray-600 focus:border-violet-500 outline-none resize-none"
            />
          </Field>

          <Field label="Deadline (optional)">
            <input
              type="datetime-local"
              value={formData.expires_at}
              onChange={(e) => setFormData({ ...formData, expires_at: e.target.value })}
              className="w-full px-4 py-3 bg-black border border-gray-800 rounded-xl text-white focus:border-violet-500 outline-none"
            />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Max file size (MB)">
              <input
                type="number"
                min="1"
                max="100"
                value={formData.max_file_size_mb}
                onChange={(e) => setFormData({ ...formData, max_file_size_mb: Number(e.target.value) })}
                className="w-full px-4 py-3 bg-black border border-gray-800 rounded-xl text-white focus:border-violet-500 outline-none"
              />
            </Field>
            <Field label="Allowed file types">
              <div className="flex flex-wrap gap-2 pt-2">
                {FILE_TYPE_OPTIONS.map((t) => {
                  const on = formData.allowed_types.includes(t);
                  return (
                    <button
                      type="button"
                      key={t}
                      onClick={() => toggleType(t)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase transition ${on ? 'bg-violet-600 text-white' : 'bg-black text-gray-500 border border-gray-800 hover:text-white'}`}
                    >
                      {t}
                    </button>
                  );
                })}
              </div>
            </Field>
          </div>

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

          {/* Custom fields builder */}
          <div className="pt-4 border-t border-gray-800">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-sm font-bold text-white">Custom Questions</p>
                <p className="text-xs text-gray-500">Collect extra info from students — e.g. roll no., topic choice.</p>
              </div>
              <button type="button" onClick={addField} className="px-3 py-1.5 bg-violet-600 text-white text-xs font-bold rounded-lg hover:bg-violet-500">
                + Add Question
              </button>
            </div>

            {formData.fields.length === 0 && (
              <p className="text-xs text-gray-600 italic">No custom questions yet — name & email are always collected.</p>
            )}

            <div className="space-y-3">
              {formData.fields.map((f, idx) => (
                <div key={f.id} className="bg-black border border-gray-800 rounded-xl p-4 space-y-3">
                  <div className="flex gap-3">
                    <input
                      type="text"
                      value={f.label}
                      onChange={(e) => updateField(idx, { label: e.target.value })}
                      placeholder="Question label"
                      className="flex-1 px-3 py-2 bg-gray-900 border border-gray-800 rounded-lg text-white text-sm focus:border-violet-500 outline-none"
                    />
                    <select
                      value={f.type}
                      onChange={(e) => updateField(idx, { type: e.target.value })}
                      className="px-3 py-2 bg-gray-900 border border-gray-800 rounded-lg text-white text-sm focus:border-violet-500 outline-none"
                    >
                      {FIELD_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                    <button type="button" onClick={() => removeField(idx)} className="px-3 py-2 text-gray-500 hover:text-red-400 text-sm">
                      Remove
                    </button>
                  </div>
                  {f.type === 'select' && (
                    <input
                      type="text"
                      value={Array.isArray(f.options) ? f.options.join(', ') : f.options}
                      onChange={(e) => updateField(idx, { options: e.target.value.split(',').map((o) => o.trim()).filter(Boolean) })}
                      placeholder="Comma-separated options, e.g. Topic A, Topic B"
                      className="w-full px-3 py-2 bg-gray-900 border border-gray-800 rounded-lg text-white text-sm focus:border-violet-500 outline-none"
                    />
                  )}
                  <label className="flex items-center gap-2 text-xs text-gray-400">
                    <input
                      type="checkbox"
                      checked={f.required}
                      onChange={(e) => updateField(idx, { required: e.target.checked })}
                      className="w-4 h-4 accent-violet-600"
                    />
                    Required
                  </label>
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-4 pt-6">
            <button type="button" onClick={() => navigate('/collections')} className="flex-1 px-6 py-3 bg-gray-800 text-white font-bold rounded-xl hover:bg-gray-700 transition">
              Cancel
            </button>
            <button type="submit" disabled={loading} className="flex-1 px-6 py-3 bg-gradient-to-r from-violet-600 to-violet-500 text-white font-bold rounded-xl hover:scale-105 transition-transform disabled:opacity-50 disabled:cursor-not-allowed">
              {loading ? 'Creating…' : 'Create Collection'}
            </button>
          </div>
        </motion.form>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-sm font-bold text-white mb-2">{label}</label>
      {children}
    </div>
  );
}
