import React from 'react';
import AppNavbar from '../components/ui/AppNavbar';
import AIDetector from '../components/AIDetector';

const TextAiDetection = () => (
  <div className="min-h-screen bg-gray-950 font-sans antialiased">
    <AppNavbar />

    <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10">

      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-7 h-7 rounded-lg bg-violet-500/10 ring-1 ring-violet-500/20 flex items-center justify-center">
            <svg className="w-3.5 h-3.5 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
            </svg>
          </div>
          <span className="text-xs font-semibold text-violet-400 uppercase tracking-widest">AI Detection</span>
        </div>
        <h1 className="text-2xl font-bold text-white tracking-tight mb-1.5">
          AI Content Scanner
        </h1>
        <p className="text-sm text-gray-500 leading-relaxed">
          Upload documents to detect AI-generated content using deep learning models before encrypting them to your vault.
        </p>
      </div>

      {/* Detector */}
      <AIDetector />
    </main>
  </div>
);

export default TextAiDetection;
