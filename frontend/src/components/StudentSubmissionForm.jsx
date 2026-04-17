import React, { useState, useMemo } from 'react';
import { useDropzone } from 'react-dropzone';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function StudentSubmissionForm({ collection, onSubmit, isLoading }) {
  const fieldDefs = collection?.fields || [];
  const allowedTypes = (collection?.allowedTypes || ['pdf', 'docx', 'txt']).map((t) => t.toLowerCase());
  const maxFileSizeMb = collection?.maxFileSizeMb || 25;
  const deadline = collection?.deadline ? new Date(collection.deadline) : null;

  const [student, setStudent] = useState({
    student_name: '',
    student_email: '',
    student_id: '',
    student_notes: '',
  });
  const [customValues, setCustomValues] = useState({});
  const [files, setFiles] = useState([]);
  const [fileErrors, setFileErrors] = useState([]);
  const [fieldErrors, setFieldErrors] = useState({});

  const acceptMap = useMemo(() => {
    const map = {};
    const mime = { pdf: 'application/pdf', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', txt: 'text/plain', doc: 'application/msword', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg' };
    allowedTypes.forEach((ext) => {
      if (mime[ext]) map[mime[ext]] = [`.${ext}`];
      else map[`application/${ext}`] = [`.${ext}`];
    });
    return map;
  }, [allowedTypes]);

  const onDrop = (accepted, rejected) => {
    const errs = [];
    const ok = [];
    accepted.forEach((f) => {
      const ext = (f.name.split('.').pop() || '').toLowerCase();
      if (!allowedTypes.includes(ext)) {
        errs.push(`${f.name}: type ".${ext}" not allowed`);
      } else if (f.size > maxFileSizeMb * 1024 * 1024) {
        errs.push(`${f.name}: exceeds ${maxFileSizeMb}MB limit`);
      } else {
        ok.push(f);
      }
    });
    rejected.forEach((r) => errs.push(`${r.file.name}: ${r.errors[0]?.message || 'rejected'}`));
    setFiles((prev) => [...prev, ...ok].slice(0, 10));
    setFileErrors(errs);
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: acceptMap,
    maxFiles: 10,
  });

  const removeFile = (idx) => setFiles((prev) => prev.filter((_, i) => i !== idx));

  const validate = () => {
    const errs = {};
    if (!student.student_name.trim()) errs.student_name = 'Name is required';
    if (!student.student_email.trim() || !EMAIL_RE.test(student.student_email.trim())) {
      errs.student_email = 'A valid email is required';
    }
    fieldDefs.forEach((f) => {
      if (f.required) {
        const v = customValues[f.id];
        if (v === undefined || v === null || String(v).trim() === '') {
          errs[f.id] = `${f.label} is required`;
        }
      }
      if (f.type === 'email' && customValues[f.id] && !EMAIL_RE.test(customValues[f.id])) {
        errs[f.id] = `${f.label} must be a valid email`;
      }
    });
    if (!files.length) errs.files = 'Please attach at least one file';
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    const fd = new FormData();
    fd.append('student_name', student.student_name.trim());
    fd.append('student_email', student.student_email.trim());
    if (student.student_id) fd.append('student_id', student.student_id.trim());
    if (student.student_notes) fd.append('student_notes', student.student_notes);
    fd.append('custom_fields', JSON.stringify(customValues));
    files.forEach((f) => fd.append('files', f));

    await onSubmit(fd);
  };

  const renderField = (f) => {
    const err = fieldErrors[f.id];
    const common = `w-full px-4 py-3 bg-gray-900 border rounded-xl text-white placeholder-gray-600 focus:border-violet-500 outline-none ${err ? 'border-red-500/60' : 'border-gray-800'}`;
    const set = (v) => setCustomValues((p) => ({ ...p, [f.id]: v }));

    if (f.type === 'textarea') {
      return <textarea rows="3" className={`${common} resize-none`} value={customValues[f.id] || ''} onChange={(e) => set(e.target.value)} />;
    }
    if (f.type === 'select') {
      return (
        <select className={common} value={customValues[f.id] || ''} onChange={(e) => set(e.target.value)}>
          <option value="">Choose…</option>
          {(f.options || []).map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      );
    }
    const inputType = f.type === 'email' ? 'email' : f.type === 'number' ? 'number' : 'text';
    return <input type={inputType} className={common} value={customValues[f.id] || ''} onChange={(e) => set(e.target.value)} />;
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {deadline && (
        <div className="text-xs text-gray-500 bg-gray-900 border border-gray-800 rounded-lg px-3 py-2">
          Deadline: <span className="text-gray-300">{deadline.toLocaleString()}</span>
        </div>
      )}

      <Section title="Your Name" required>
        <input
          type="text"
          value={student.student_name}
          onChange={(e) => setStudent({ ...student, student_name: e.target.value })}
          placeholder="Enter your full name"
          className={inputClass(fieldErrors.student_name)}
        />
        <ErrorText msg={fieldErrors.student_name} />
      </Section>

      <Section title="Email" required>
        <input
          type="email"
          value={student.student_email}
          onChange={(e) => setStudent({ ...student, student_email: e.target.value })}
          placeholder="you@school.edu"
          className={inputClass(fieldErrors.student_email)}
        />
        <ErrorText msg={fieldErrors.student_email} />
      </Section>

      <Section title="Student ID (optional)">
        <input
          type="text"
          value={student.student_id}
          onChange={(e) => setStudent({ ...student, student_id: e.target.value })}
          placeholder="e.g., 12345678"
          className={inputClass()}
        />
      </Section>

      {fieldDefs.map((f) => (
        <Section key={f.id} title={f.label} required={f.required}>
          {renderField(f)}
          <ErrorText msg={fieldErrors[f.id]} />
        </Section>
      ))}

      <Section title="Notes (optional)">
        <textarea
          rows="3"
          value={student.student_notes}
          onChange={(e) => setStudent({ ...student, student_notes: e.target.value })}
          placeholder="Anything your teacher should know…"
          className={`${inputClass()} resize-none`}
        />
      </Section>

      <Section title="Upload Files" required>
        <div
          {...getRootProps()}
          className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition ${
            isDragActive ? 'border-violet-500 bg-violet-500/5' : fieldErrors.files ? 'border-red-500/60' : 'border-gray-800 hover:border-gray-700'
          }`}
        >
          <input {...getInputProps()} />
          <div className="w-12 h-12 bg-gray-800 rounded-xl flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
          </div>
          <p className="text-white font-semibold mb-1">
            {isDragActive ? 'Drop files here' : 'Drag files or click to browse'}
          </p>
          <p className="text-xs text-gray-500">
            Allowed: {allowedTypes.join(', ').toUpperCase()} • Max {maxFileSizeMb}MB per file
          </p>
        </div>
        <ErrorText msg={fieldErrors.files} />
        {fileErrors.length > 0 && (
          <div className="mt-3 space-y-1">
            {fileErrors.map((e, i) => (
              <p key={i} className="text-xs text-red-400">• {e}</p>
            ))}
          </div>
        )}
        {files.length > 0 && (
          <ul className="mt-4 space-y-2">
            {files.map((f, i) => (
              <li key={`${f.name}-${i}`} className="flex items-center justify-between bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 text-sm">
                <span className="text-gray-300 truncate mr-3">{f.name}</span>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-500">{(f.size / 1024).toFixed(1)} KB</span>
                  <button type="button" onClick={() => removeFile(i)} className="text-xs text-gray-500 hover:text-red-400">
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <button
        type="submit"
        disabled={isLoading}
        className="w-full py-3 bg-gradient-to-r from-violet-600 to-violet-500 text-white font-bold rounded-xl hover:scale-[1.01] transition-transform disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3"
      >
        {isLoading ? (
          <>
            <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            Submitting…
          </>
        ) : (
          'Submit Assignment'
        )}
      </button>
    </form>
  );
}

function Section({ title, required, children }) {
  return (
    <div>
      <label className="block text-sm font-bold text-white mb-2">
        {title}
        {required && <span className="text-red-400 ml-1">*</span>}
      </label>
      {children}
    </div>
  );
}

function ErrorText({ msg }) {
  if (!msg) return null;
  return <p className="text-xs text-red-400 mt-1">{msg}</p>;
}

function inputClass(err) {
  return `w-full px-4 py-3 bg-gray-900 border rounded-xl text-white placeholder-gray-600 focus:border-violet-500 outline-none ${err ? 'border-red-500/60' : 'border-gray-800'}`;
}
