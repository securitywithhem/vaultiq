import React from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import AppNavbar from '../components/ui/AppNavbar';
import { useAuth } from '../hooks/useAuth';

// ─── Motion presets ───────────────────────────────────────────────────────────

const EASE = [0.25, 0.1, 0.25, 1];

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.35, ease: EASE } },
};

const stagger = {
  hidden: {},
  show:   { transition: { staggerChildren: 0.06 } },
};

// ─── Dummy data ───────────────────────────────────────────────────────────────

const CHART_DATA = [
  { day: 'Mon', uploads: 4,  scans: 7  },
  { day: 'Tue', uploads: 9,  scans: 14 },
  { day: 'Wed', uploads: 6,  scans: 11 },
  { day: 'Thu', uploads: 14, scans: 22 },
  { day: 'Fri', uploads: 11, scans: 18 },
  { day: 'Sat', uploads: 5,  scans: 9  },
  { day: 'Sun', uploads: 8,  scans: 16 },
];

const STATUS_PILLS = [
  { label: 'Encryption', status: 'Operational', dot: 'bg-emerald-400' },
  { label: 'AI Service',  status: 'Operational', dot: 'bg-emerald-400' },
  { label: 'Storage',     status: 'Degraded',    dot: 'bg-amber-400'   },
];

// NOTE: All color class strings are static so Tailwind JIT scans them correctly.
const FEATURE_CARDS = [
  {
    to: '/files',
    title: 'Secure Vault',
    description: 'AES-256 encrypted files with SHA-256 integrity verification.',
    iconBg: 'bg-emerald-500/10', iconRing: 'ring-emerald-500/20', iconText: 'text-emerald-400',
    badge: '24 files', badgeBg: 'bg-emerald-500/10 text-emerald-400',
    arrowColor: 'text-emerald-400',
    glow: 'rgba(16,185,129,0.12)',
    icon: (<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" /></svg>),
  },
  {
    to: '/ai-detection',
    title: 'AI Detection',
    description: 'Detect AI-generated content with deep learning NLP models.',
    iconBg: 'bg-violet-500/10', iconRing: 'ring-violet-500/20', iconText: 'text-violet-400',
    badge: 'New', badgeBg: 'bg-violet-500/10 text-violet-400',
    arrowColor: 'text-violet-400',
    glow: 'rgba(139,92,246,0.12)',
    icon: (<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" /></svg>),
  },
  {
    to: '/analytics',
    title: 'Analytics',
    description: 'Upload trends, scan history, and storage insights.',
    iconBg: 'bg-sky-500/10', iconRing: 'ring-sky-500/20', iconText: 'text-sky-400',
    badge: '7-day view', badgeBg: 'bg-sky-500/10 text-sky-400',
    arrowColor: 'text-sky-400',
    glow: 'rgba(14,165,233,0.12)',
    icon: (<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" /></svg>),
  },
  {
    to: '/logs',
    title: 'Security Logs',
    description: 'Audit access events, threats, and integrity checks.',
    iconBg: 'bg-amber-500/10', iconRing: 'ring-amber-500/20', iconText: 'text-amber-400',
    badge: '3 alerts', badgeBg: 'bg-amber-500/10 text-amber-400',
    arrowColor: 'text-amber-400',
    glow: 'rgba(245,158,11,0.12)',
    icon: (<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" /></svg>),
  },
];

const STATS = [
  { label: 'Total Files',     value: '24',     sub: '+3 this week',  iconBg: 'bg-emerald-500/10', iconText: 'text-emerald-400', icon: (<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>) },
  { label: 'AI Detections',   value: '138',    sub: '+21 this week', iconBg: 'bg-violet-500/10', iconText: 'text-violet-400', icon: (<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" /></svg>) },
  { label: 'Storage Used',    value: '4.2 GB', sub: '82% capacity',  iconBg: 'bg-sky-500/10',    iconText: 'text-sky-400',    icon: (<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" /></svg>) },
  { label: 'Threats Blocked', value: '3',      sub: 'Last 30 days',  iconBg: 'bg-amber-500/10',  iconText: 'text-amber-400',  icon: (<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>) },
];

const QUICK_ACTIONS = [
  { label: 'Upload File',    to: '/files',        iconText: 'text-emerald-400', bg: 'bg-emerald-500/10 hover:bg-emerald-500/20 border-emerald-500/20 hover:border-emerald-500/40', icon: (<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" /></svg>) },
  { label: 'Scan Document',  to: '/ai-detection', iconText: 'text-violet-400', bg: 'bg-violet-500/10 hover:bg-violet-500/20 border-violet-500/20 hover:border-violet-500/40', icon: (<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" /></svg>) },
  { label: 'View Analytics', to: '/analytics',    iconText: 'text-sky-400',    bg: 'bg-sky-500/10 hover:bg-sky-500/20 border-sky-500/20 hover:border-sky-500/40', icon: (<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" /></svg>) },
];

const GUIDED_STEPS = [
  { n: '1', label: 'Upload File',    sub: 'AES-256 encryption', to: '/files',        color: 'emerald' },
  { n: '2', label: 'AI Scan',        sub: 'Detect AI content',  to: '/ai-detection', color: 'violet'  },
  { n: '3', label: 'View Analytics', sub: 'Monitor everything', to: '/analytics',    color: 'sky'     },
];

// ─── Recharts tooltip ─────────────────────────────────────────────────────────

const ChartTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-gray-900 border border-gray-700/80 rounded-xl px-4 py-3 shadow-2xl">
      <p className="text-xs font-semibold text-gray-400 mb-2">{label}</p>
      {payload.map((e) => (
        <p key={e.dataKey} className="text-xs font-medium" style={{ color: e.color }}>
          {e.dataKey === 'uploads' ? 'Uploads' : 'AI Scans'}: {e.value}
        </p>
      ))}
    </div>
  );
};

// ─── Dashboard ────────────────────────────────────────────────────────────────

const Dashboard = () => {
  const { user } = useAuth();
  const navigate  = useNavigate();
  const firstName = user?.email?.split('@')[0] ?? 'there';

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900/30 to-gray-950 font-sans antialiased">
      <AppNavbar />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <motion.div variants={stagger} initial="hidden" animate="show" className="space-y-8">

          {/* ── Hero ────────────────────────────────────────────────────────── */}
          <motion.div variants={fadeUp} className="flex flex-col sm:flex-row sm:items-end justify-between gap-5">
            <div>
              <p className="text-xs font-semibold text-gray-600 uppercase tracking-widest mb-3">
                Good to see you back, {firstName}
              </p>
              <h1 className="text-3xl font-bold text-white tracking-tight leading-tight">
                Secure your data.<br />
                <span className="text-gray-500 font-light">Detect AI. Monitor everything.</span>
              </h1>
            </div>

            <motion.button
              type="button"
              onClick={() => navigate('/files')}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              transition={{ type: 'spring', stiffness: 340, damping: 20 }}
              className="shrink-0 flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-sm font-semibold text-white shadow-lg shadow-emerald-500/20 transition-colors duration-150"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
              </svg>
              Upload File
            </motion.button>
          </motion.div>

          {/* ── Guided flow ─────────────────────────────────────────────────── */}
          <motion.div variants={fadeUp}>
            <div className="bg-gray-900/60 border border-gray-800 rounded-2xl p-5">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-4">
                Guided workflow
              </p>
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                {GUIDED_STEPS.map((step, i) => (
                  <React.Fragment key={step.n}>
                    <motion.button
                      type="button"
                      onClick={() => navigate(step.to)}
                      whileHover={{ y: -1 }}
                      whileTap={{ scale: 0.97 }}
                      transition={{ type: 'spring', stiffness: 360, damping: 24 }}
                      className="flex items-center gap-3 flex-1 bg-gray-800/60 hover:bg-gray-800 border border-gray-700/60 hover:border-gray-600 rounded-xl px-4 py-3 text-left transition-colors duration-150 w-full sm:w-auto"
                    >
                      <span className={`w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center shrink-0 ${
                        step.color === 'emerald' ? 'bg-emerald-500/20 text-emerald-400' :
                        step.color === 'violet'  ? 'bg-violet-500/20  text-violet-400'  :
                                                   'bg-sky-500/20     text-sky-400'
                      }`}>{step.n}</span>
                      <div>
                        <p className="text-xs font-semibold text-white">{step.label}</p>
                        <p className="text-[10px] text-gray-500">{step.sub}</p>
                      </div>
                    </motion.button>

                    {i < GUIDED_STEPS.length - 1 && (
                      <svg className="w-4 h-4 text-gray-700 shrink-0 hidden sm:block" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                      </svg>
                    )}
                  </React.Fragment>
                ))}
              </div>
            </div>
          </motion.div>

          {/* ── System status bar ───────────────────────────────────────────── */}
          <motion.div variants={fadeUp}>
            <div className="flex flex-wrap items-center gap-3 p-4 bg-gray-900/60 border border-gray-800 rounded-2xl">
              <span className="text-xs font-semibold text-gray-600 uppercase tracking-widest">
                System Status
              </span>
              {STATUS_PILLS.map(({ label, status, dot }) => (
                <div key={label} className="flex items-center gap-1.5 bg-gray-800/60 border border-gray-700/50 rounded-full px-3 py-1">
                  <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
                  <span className="text-xs text-gray-400">{label}</span>
                  <span className="text-xs font-medium text-gray-300">{status}</span>
                </div>
              ))}
              <div className="ml-auto hidden sm:flex items-center gap-1.5">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
                </span>
                <span className="text-xs text-emerald-400 font-medium">All systems live</span>
              </div>
            </div>
          </motion.div>

          {/* ── Stats row ───────────────────────────────────────────────────── */}
          <motion.div variants={stagger} className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {STATS.map(({ label, value, sub, icon, iconBg, iconText }) => (
              <motion.div
                key={label}
                variants={fadeUp}
                whileHover={{ y: -2 }}
                transition={{ type: 'spring', stiffness: 300, damping: 22 }}
                className="bg-gray-900/80 border border-gray-800 hover:border-gray-700 rounded-2xl p-5 cursor-default"
              >
                <div className={`w-8 h-8 rounded-lg ${iconBg} flex items-center justify-center mb-4`}>
                  <span className={iconText}>{icon}</span>
                </div>
                <p className="text-2xl font-bold text-white tracking-tight">{value}</p>
                <p className="text-xs text-gray-500 mt-0.5">{label}</p>
                <p className="text-xs text-gray-600 mt-1">{sub}</p>
              </motion.div>
            ))}
          </motion.div>

          {/* ── Feature cards ───────────────────────────────────────────────── */}
          <motion.div variants={stagger} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {FEATURE_CARDS.map(({ to, title, description, iconBg, iconRing, iconText, badge, badgeBg, arrowColor, glow, icon }) => (
              <motion.button
                key={to}
                type="button"
                onClick={() => navigate(to)}
                variants={fadeUp}
                initial="rest"
                whileHover="hover"
                whileTap={{ scale: 0.98 }}
                animate="rest"
                className="relative group text-left bg-gray-900/80 border border-gray-800 rounded-2xl p-5 flex flex-col gap-4 overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40"
                style={{ WebkitTapHighlightColor: 'transparent' }}
              >
                {/* Per-card colored glow */}
                <motion.div
                  variants={{ rest: { opacity: 0 }, hover: { opacity: 1 } }}
                  transition={{ duration: 0.2 }}
                  className="absolute inset-0 rounded-2xl pointer-events-none"
                  style={{ boxShadow: `inset 0 0 0 1px rgba(255,255,255,0.04), 0 8px 32px ${glow}` }}
                  aria-hidden="true"
                />

                <div className="flex items-start justify-between">
                  <div className={`w-9 h-9 rounded-xl ${iconBg} ring-1 ${iconRing} flex items-center justify-center`}>
                    <span className={iconText}>{icon}</span>
                  </div>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${badgeBg}`}>{badge}</span>
                </div>

                <div className="flex-1">
                  <p className="text-sm font-semibold text-white mb-1">{title}</p>
                  <p className="text-xs text-gray-500 leading-relaxed">{description}</p>
                </div>

                <motion.div
                  variants={{ rest: { x: 0 }, hover: { x: 2 } }}
                  transition={{ type: 'spring', stiffness: 400, damping: 22 }}
                  className={`flex items-center gap-1 text-xs font-semibold ${arrowColor}`}
                >
                  Open
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                  </svg>
                </motion.div>
              </motion.button>
            ))}
          </motion.div>

          {/* ── Chart + Quick Actions ────────────────────────────────────────── */}
          <motion.div variants={fadeUp} className="grid grid-cols-1 lg:grid-cols-3 gap-4">

            {/* Area chart — 2 cols */}
            <div className="lg:col-span-2 bg-gray-900/80 border border-gray-800 rounded-2xl p-6">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-sm font-semibold text-white">Activity Overview</h2>
                  <p className="text-xs text-gray-500 mt-0.5">Uploads & AI scans — last 7 days</p>
                </div>
                <motion.button
                  type="button"
                  onClick={() => navigate('/analytics')}
                  whileHover={{ x: 2 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 22 }}
                  className="text-xs font-semibold text-gray-500 hover:text-emerald-400 transition-colors flex items-center gap-1"
                >
                  View all
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                  </svg>
                </motion.button>
              </div>

              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={CHART_DATA} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                  <defs>
                    <linearGradient id="gradUploads" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#10b981" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0}   />
                    </linearGradient>
                    <linearGradient id="gradScans" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#8b5cf6" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}   />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
                  <XAxis dataKey="day" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTooltip />} cursor={{ stroke: '#374151', strokeWidth: 1 }} />
                  <Area type="monotone" dataKey="uploads" stroke="#10b981" strokeWidth={2} fill="url(#gradUploads)" dot={false} activeDot={{ r: 4, fill: '#10b981', strokeWidth: 0 }} />
                  <Area type="monotone" dataKey="scans"   stroke="#8b5cf6" strokeWidth={2} fill="url(#gradScans)"   dot={false} activeDot={{ r: 4, fill: '#8b5cf6', strokeWidth: 0 }} />
                </AreaChart>
              </ResponsiveContainer>

              <div className="flex items-center gap-5 mt-4">
                <div className="flex items-center gap-1.5">
                  <span className="w-3 inline-block bg-emerald-400" style={{ height: '2px' }} />
                  <span className="text-xs text-gray-500">Uploads</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-3 inline-block bg-violet-400" style={{ height: '2px' }} />
                  <span className="text-xs text-gray-500">AI Scans</span>
                </div>
              </div>
            </div>

            {/* Quick actions */}
            <div className="bg-gray-900/80 border border-gray-800 rounded-2xl p-6 flex flex-col">
              <h2 className="text-sm font-semibold text-white mb-0.5">Quick Actions</h2>
              <p className="text-xs text-gray-500 mb-5">Jump straight into a task.</p>
              <div className="flex flex-col gap-2.5 flex-1 justify-center">
                {QUICK_ACTIONS.map(({ label, to, iconText, bg, icon }) => (
                  <motion.button
                    key={to}
                    type="button"
                    onClick={() => navigate(to)}
                    whileHover={{ x: 2 }}
                    whileTap={{ scale: 0.97 }}
                    transition={{ type: 'spring', stiffness: 380, damping: 24 }}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-sm font-semibold text-white transition-colors duration-150 ${bg}`}
                  >
                    <span className={iconText}>{icon}</span>
                    {label}
                  </motion.button>
                ))}
              </div>
            </div>

          </motion.div>

        </motion.div>
      </main>
    </div>
  );
};

export default Dashboard;
