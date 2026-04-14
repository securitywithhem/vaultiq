import React from 'react';
import { motion } from 'framer-motion';
import AppNavbar from '../components/ui/AppNavbar';
import AIDetector from '../components/AIDetector';

const TextAiDetection = () => (
  <div className="min-h-screen bg-gray-950 font-sans antialiased">
    <AppNavbar />

    <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      {/* Header */}
      <motion.div 
        initial={{ opacity: 0, y: -10 }} 
        animate={{ opacity: 1, y: 0 }}
        className="mb-10"
      >
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-violet-500/10 ring-1 ring-violet-500/20 flex items-center justify-center">
                <svg className="w-3.5 h-3.5 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                </svg>
              </div>
              <span className="text-xs font-semibold text-violet-400 uppercase tracking-widest">AI Intelligence</span>
            </div>
            <h1 className="text-3xl font-bold text-white tracking-tight leading-tight">AI Content Scanner</h1>
            <p className="text-sm text-gray-500 max-w-xl leading-relaxed">
              Detect AI-generated segments using a deep-learning ensemble architecture including RoBERTa and Statistical Logistic Regression.
            </p>
          </div>

          {/* Model Status Pills */}
          <div className="flex flex-wrap gap-2">
            {['RoBERTa-L v2', 'GPT Perplexity', 'Statistical LR'].map(model => (
              <span key={model} className="px-2.5 py-1 rounded-full bg-gray-900 border border-gray-800 text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                {model}
              </span>
            ))}
          </div>
        </div>
      </motion.div>

      {/* Main Detector Section */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }} 
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <AIDetector />
      </motion.div>
    </main>
  </div>
);

export default TextAiDetection;
