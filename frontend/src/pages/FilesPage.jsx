import React, { useEffect, useMemo } from 'react';
import AppNavbar from '../components/ui/AppNavbar';
import UploadZone from '../components/UploadZone';
import FileCard from '../components/FileCard';
import EmptyState from '../components/EmptyState';
import { useFiles } from '../hooks/useFiles';
import { fileService } from '../services/fileService';

// ─── Skeleton loader ──────────────────────────────────────────────────────────

const FileCardSkeleton = () => (
  <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 space-y-4 animate-pulse">
    <div className="flex items-start justify-between">
      <div className="w-9 h-9 rounded-xl bg-gray-800" />
      <div className="w-20 h-4 rounded-full bg-gray-800" />
    </div>
    <div className="space-y-2">
      <div className="h-3.5 w-3/4 rounded bg-gray-800" />
      <div className="h-2.5 w-1/2 rounded bg-gray-800" />
      <div className="h-7 rounded-lg bg-gray-800 mt-3" />
    </div>
    <div className="flex gap-2 pt-3 border-t border-gray-800">
      <div className="flex-1 h-8 rounded-xl bg-gray-800" />
      <div className="w-9 h-8 rounded-xl bg-gray-800" />
    </div>
  </div>
);

// ─── Empty state icon ─────────────────────────────────────────────────────────

const VaultIcon = () => (
  <svg className="w-6 h-6 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
  </svg>
);

// ─── FilesPage ────────────────────────────────────────────────────────────────

const FilesPage = () => {
  const { files, isLoading, fetchFiles, addFileOptimistic, deleteFile } = useFiles();

  useEffect(() => {
    const controller = new AbortController();
    fetchFiles(controller.signal);
    return () => controller.abort();
  }, [fetchFiles]);

  const sortedFiles = useMemo(
    () => [...files].sort((a, b) => new Date(b.uploaded_at) - new Date(a.uploaded_at)),
    [files],
  );

  const handleDownload = async (id, filename) => {
    await fileService.downloadFile(id, filename);
  };

  return (
    <div className="min-h-screen bg-gray-950 font-sans antialiased">
      <AppNavbar />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">

        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 rounded-lg bg-emerald-500/10 ring-1 ring-emerald-500/20 flex items-center justify-center">
                <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                </svg>
              </div>
              <span className="text-xs font-semibold text-emerald-400 uppercase tracking-widest">Secure Vault</span>
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tight mb-1">Encrypted Files</h1>
            <p className="text-sm text-gray-500">
              All files are AES-256 encrypted end-to-end before reaching our servers.
            </p>
          </div>

          {!isLoading && files.length > 0 && (
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs font-semibold bg-gray-900 border border-gray-800 text-gray-400 px-3 py-1.5 rounded-full">
                {files.length} file{files.length !== 1 ? 's' : ''}
              </span>
            </div>
          )}
        </div>

        {/* Upload zone */}
        <section className="mb-10">
          <UploadZone onUploadSuccess={addFileOptimistic} />
        </section>

        {/* Files section */}
        <section>
          <div className="flex items-center gap-3 mb-5">
            <h2 className="text-base font-semibold text-white">Your Files</h2>
            {!isLoading && (
              <span className="text-xs font-semibold bg-gray-900 border border-gray-800 text-gray-500 px-2 py-0.5 rounded-full">
                {files.length}
              </span>
            )}
          </div>

          {/* Loading skeletons */}
          {isLoading && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3].map((i) => <FileCardSkeleton key={i} />)}
            </div>
          )}

          {/* Empty state */}
          {!isLoading && sortedFiles.length === 0 && (
            <div className="bg-gray-900 border border-gray-800 rounded-2xl">
              <EmptyState
                icon={<VaultIcon />}
                message="Your vault is empty"
                submessage="Upload your first file above. It will be encrypted with AES-256 before storage."
                action={
                  <button
                    type="button"
                    onClick={() => document.querySelector('input[type="file"]')?.click()}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-sm font-semibold text-white transition-all duration-150 active:scale-[0.98]"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                    </svg>
                    Upload your first file
                  </button>
                }
              />
            </div>
          )}

          {/* File grid */}
          {!isLoading && sortedFiles.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {sortedFiles.map((file) => (
                <FileCard
                  key={file.id}
                  file={file}
                  onDownload={handleDownload}
                  onDelete={deleteFile}
                />
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
};

export default FilesPage;
