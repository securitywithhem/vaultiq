import React, { useState } from 'react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { updateCollection } from '../api/collectionsApi';

const FILE_TYPE_OPTIONS = ['pdf', 'docx', 'txt', 'doc', 'png', 'jpg', 'jpeg'];
const FIELD_TYPE_OPTIONS = [
  { value: 'text', label: 'Short text' },
  { value: 'textarea', label: 'Long text' },
  { value: 'email', label: 'Email' },
  { value: 'number', label: 'Number' },
  { value: 'select', label: 'Dropdown' },
];

export default function EditCollectionModal({ collection, onSuccess, onCancel }) {
  const [formData, setFormData] = useState({
    name: collection.name || '',
    description: collection.description || '',
    auto_detect_enabled: collection.autoDetectEnabled !== false,
    expires_at: collection.expiresAt ? new Date(collection.expiresAt).toISOString().slice(0, 16) : '',
    max_file_size_mb: collection.maxFileSizeMb || 25,
    allowed_types: collection.allowedTypes || ['pdf', 'docx', 'txt'],
    status: collection.status || 'active',
    fields: collection.fields || [],
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const toggleType = (type) =>
    setFormData((prev) => ({
      ...prev,
      allowed_types: prev.allowed_types.includes(type)
        ? prev.allowed_types.filter((t) => t !== type)
        : [...prev.allowed_types, type],
    }));

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

      await updateCollection(collection.id, dataToSend);
      toast.success('Collection updated');
      onSuccess();
    } catch (err) {
      setError(err.response?.data?.error || err.message);
      toast.error('Failed to update collection');
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={onCancel}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-gray-900 border border-gray-800 rounded-3xl p-8 max-w-2xl w-full max-h-[90vh] overflow-y-auto"
      >
        <h2 className="text-2xl font-bold text-white mb-6">Edit Collection</h2>

        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
              {error}
            </div>
          )}

          <Field label="Collection Name *">
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-4 py-3 bg-black border border-gray-800 rounded-xl text-white placeholder-gray-600 focus:border-violet-500 outline-none"
            />
          </Field>

          <Field label="Description">
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows="3"
              className="w-full px-4 py-3 bg-black border border-gray-800 rounded-xl text-white placeholder-gray-600 focus:border-violet-500 outline-none resize-none"
            />
          </Field>

          <Field label="Deadline">
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
            <Field label="Status">
              <select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                className="w-full px-4 py-3 bg-black border border-gray-800 rounded-xl text-white focus:border-violet-500 outline-none"
              >
                <option value="active">Active</option>
                <option value="closed">Closed</option>
                <option value="archived">Archived</option>
              </select>
            </Field>
          </div>

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

          <div className="flex gap-4 pt-6">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 px-6 py-3 bg-gray-800 text-white font-bold rounded-xl hover:bg-gray-700 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-6 py-3 bg-gradient-to-r from-violet-600 to-violet-500 text-white font-bold rounded-xl hover:scale-105 transition-transform disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
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
