/**
 * Analytics.jsx
 * Big Data Analytics dashboard — Phase 3.
 *
 * Sections (top → bottom):
 *   1. Header:         title, live badge, last-run time, Run Spark Job button
 *   2. Time range:     7d / 14d / 30d filter for the upload trend
 *   3. Metric cards:   Total Events · Active Users · Storage Used · Anomaly Alerts
 *   4. Area chart:     daily upload trend (filtered by time range)
 *   5. Two columns:    horizontal bar (top files) + donut pie (event breakdown)
 *   6. Bar chart:      hourly activity — off-hours bars coloured anomaly-red
 *   7. Anomaly alerts: expandable list (only when anomalies exist)
 *   8. Status grid:    6 cards — NameNode, DataNode, Spark Master/Worker, Logs, Results
 */

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import AppNavbar from '../components/ui/AppNavbar';
import api from '../services/api';
import {
  AreaChart, Area,
  BarChart, Bar,
  PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { formatRelativeTime } from '../utils/format';

// ─── Constants ────────────────────────────────────────────────────────────────

const BLUE        = '#378ADD';
const RED         = '#E24B4A';
const PIE_PALETTE = ['#378ADD', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899'];

const TIME_RANGES = [
  { label: '7d',  days: 7  },
  { label: '14d', days: 14 },
  { label: '30d', days: 30 },
];

const SPARK_CMD =
  'docker exec spark-master spark-submit --master local[*] /opt/spark-jobs/analytics_job.py';

const TT = {
  contentStyle: {
    background:   '#111827',
    border:       '1px solid #1f2937',
    borderRadius: '12px',
    color:        '#f9fafb',
    fontSize:     '12px',
    padding:      '10px 14px',
  },
  itemStyle: { color: '#9ca3af' },
  cursor:    { fill: 'rgba(55,138,221,0.06)' },
};

// ─── Formatters ───────────────────────────────────────────────────────────────

const fmtGB  = (bytes) => `${((bytes || 0) / 1e9).toFixed(1)} GB`;
const fmtNum = (n)     => (n || 0).toLocaleString();

// ─── Skeleton ─────────────────────────────────────────────────────────────────

const Skeleton = ({ height = 80, className = '' }) => (
  <div
    className={`rounded-2xl bg-gray-900 border border-gray-800 animate-pulse ${className}`}
    style={{ height }}
  />
);

// ─── MetricCard ───────────────────────────────────────────────────────────────

const METRIC_ICONS = {
  events: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
    </svg>
  ),
  users: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
    </svg>
  ),
  storage: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />
    </svg>
  ),
  alerts: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
    </svg>
  ),
};

const MetricCard = ({ label, value, iconKey, danger }) => (
  <div className={`bg-gray-900 border rounded-2xl p-5 transition-colors ${danger ? 'border-red-500/30' : 'border-gray-800'}`}>
    <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-4 ${danger ? 'bg-red-500/10 text-red-400' : 'bg-gray-800 text-gray-400'}`}>
      {METRIC_ICONS[iconKey]}
    </div>
    <p className="text-2xl font-bold text-white tracking-tight">{value}</p>
    <p className="text-xs text-gray-500 mt-0.5">{label}</p>
  </div>
);

// ─── PieLegend ────────────────────────────────────────────────────────────────

const PieLegend = ({ entries }) => (
  <div className="space-y-2 mt-4">
    {entries.map((entry, i) => (
      <div key={entry.event || i} className="flex items-center gap-2">
        <span
          className="w-2 h-2 rounded-full shrink-0"
          style={{ background: PIE_PALETTE[i % PIE_PALETTE.length] }}
        />
        <span className="text-xs text-gray-400 flex-1 truncate">{entry.event}</span>
        <span className="text-xs font-mono text-gray-500">{fmtNum(entry.count)}</span>
      </div>
    ))}
  </div>
);

// ─── Chart card wrapper ───────────────────────────────────────────────────────

const ChartCard = ({ title, subtitle, children, className = '' }) => (
  <div className={`bg-gray-900 border border-gray-800 rounded-2xl p-6 ${className}`}>
    <p className="text-sm font-semibold text-white mb-0.5">{title}</p>
    {subtitle && <p className="text-xs text-gray-500 mb-5">{subtitle}</p>}
    {children}
  </div>
);

// ─── Analytics ────────────────────────────────────────────────────────────────

const Analytics = () => {
  const [data,         setData]         = useState(null);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState(null);
  const [timeRange,    setTimeRange]    = useState(30);
  const [lastFetched,  setLastFetched]  = useState(null);
  const [sparkRunning, setSparkRunning] = useState(false);

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/api/analytics');
      setData(res.data);
      setLastFetched(new Date());
      setError(null);
    } catch (err) {
      setError(err.message || 'Failed to load analytics');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Run Spark job ──────────────────────────────────────────────────────────
  const handleSparkRun = async () => {
    setSparkRunning(true);
    try {
      await api.post('/api/analytics/refresh');
      setTimeout(() => { fetchData(); setSparkRunning(false); }, 3_000);
    } catch {
      setSparkRunning(false);
    }
  };

  // ── Derived values ─────────────────────────────────────────────────────────
  const pt = data?.platform_totals || {};

  const filteredTrend = useMemo(() => {
    const all = data?.daily_trend || [];
    return all.slice(-timeRange);
  }, [data?.daily_trend, timeRange]);

  const topFiles  = data?.top_files       || [];
  const breakdown = data?.event_breakdown || [];
  const hourly    = data?.hourly_pattern  || [];
  const anomalies = data?.anomalies       || [];

  const isNoData = data !== null && !filteredTrend.length && !breakdown.length && !(pt.total_events);

  // ── HDFS / Spark status ────────────────────────────────────────────────────
  const hdfsUp = data?._source === 'hdfs';
  const STATUS_ITEMS = [
    { label: 'NameNode',     value: hdfsUp ? 'Online'       : 'Offline',      ok: hdfsUp },
    { label: 'DataNode',     value: hdfsUp ? 'Online'       : 'Offline',      ok: hdfsUp },
    { label: 'Spark Master', value: hdfsUp ? 'Online'       : 'Unavailable',  ok: hdfsUp },
    { label: 'Spark Worker', value: hdfsUp ? 'Online'       : 'Unavailable',  ok: hdfsUp },
    { label: 'Log Events',   value: fmtNum(pt.total_events),                  ok: true   },
    { label: 'Results',      value: hdfsUp ? '7 / 7 loaded' : 'From cache',   ok: !!data },
  ];

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-950 font-sans antialiased">
      <AppNavbar />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">

        {/* ── 1. Header ─────────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-2.5 mb-3">
              <div className="w-7 h-7 rounded-lg bg-sky-500/10 ring-1 ring-sky-500/20 flex items-center justify-center">
                <svg className="w-3.5 h-3.5 text-sky-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
                </svg>
              </div>
              <span className="text-xs font-semibold text-sky-400 uppercase tracking-widest">Analytics</span>
              {!loading && (
                <div className="flex items-center gap-1.5">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  </span>
                  <span className="text-xs text-emerald-400 font-medium">Live</span>
                </div>
              )}
              {data?._source === 'cache' && (
                <span className="text-xs font-semibold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full">
                  cached
                </span>
              )}
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tight mb-1">Big Data Analytics</h1>
            {lastFetched && (
              <p className="text-sm text-gray-500">
                Last Spark run: {formatRelativeTime(lastFetched.toISOString())}
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={handleSparkRun}
            disabled={sparkRunning || loading}
            className="
              shrink-0 flex items-center gap-2
              px-4 py-2.5 rounded-xl
              bg-sky-500/10 hover:bg-sky-500/20
              border border-sky-500/20 hover:border-sky-500/40
              text-sm font-semibold text-sky-400
              disabled:opacity-50 disabled:cursor-not-allowed
              transition-all duration-150
            "
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
            </svg>
            {sparkRunning ? 'Starting…' : 'Run Spark Job'}
          </button>
        </div>

        {/* ── 2. Time-range filter ──────────────────────────────────────────── */}
        {!loading && data && (
          <div className="flex items-center gap-1 mb-8 bg-gray-900 border border-gray-800 rounded-xl p-1 w-fit">
            {TIME_RANGES.map((r) => (
              <button
                key={r.days}
                type="button"
                onClick={() => setTimeRange(r.days)}
                className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 ${
                  timeRange === r.days
                    ? 'bg-gray-800 text-white'
                    : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        )}

        {/* ── Loading skeletons ─────────────────────────────────────────────── */}
        {loading && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map((i) => <Skeleton key={i} height={110} />)}
            </div>
            <Skeleton height={280} />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Skeleton height={340} />
              <Skeleton height={340} />
            </div>
            <Skeleton height={260} />
          </div>
        )}

        {/* ── Error state ───────────────────────────────────────────────────── */}
        {!loading && error && (
          <div className="bg-gray-900 border border-red-500/20 rounded-2xl p-12 flex flex-col items-center gap-5 text-center">
            <div className="w-12 h-12 rounded-2xl bg-red-500/10 flex items-center justify-center">
              <svg className="w-5 h-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-white mb-1">Could not load analytics</p>
              <p className="text-xs text-gray-500 max-w-sm">{error}</p>
            </div>
            <button
              type="button"
              onClick={fetchData}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gray-800 hover:bg-gray-700 border border-gray-700 text-xs font-semibold text-gray-300 hover:text-white transition-all duration-150"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
              </svg>
              Retry
            </button>
          </div>
        )}

        {/* ── No data — Spark hasn't run yet ────────────────────────────────── */}
        {!loading && !error && isNoData && (
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-12 flex flex-col items-center gap-5 text-center">
            <div className="w-12 h-12 rounded-2xl bg-sky-500/10 flex items-center justify-center">
              <svg className="w-5 h-5 text-sky-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-white mb-1">No analytics data yet</p>
              <p className="text-xs text-gray-500 max-w-sm">
                Run the Spark job to populate results. Once complete, charts and metrics will appear here automatically.
              </p>
            </div>
            <div className="w-full max-w-lg bg-gray-950 border border-gray-800 rounded-xl p-4">
              <p className="text-[10px] font-semibold text-gray-600 uppercase tracking-widest mb-2">Run in terminal</p>
              <code className="text-xs font-mono text-emerald-400 break-all leading-relaxed">
                {SPARK_CMD}
              </code>
            </div>
            <button
              type="button"
              onClick={() => navigator.clipboard?.writeText(SPARK_CMD)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gray-800 hover:bg-gray-700 border border-gray-700 text-xs font-semibold text-gray-300 hover:text-white transition-all duration-150"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              Copy command
            </button>
          </div>
        )}

        {/* ── Dashboard ─────────────────────────────────────────────────────── */}
        {!loading && !error && !isNoData && data && (
          <div className="space-y-4">

            {/* ── 3. Metric cards ─────────────────────────────────────────── */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <MetricCard iconKey="events"  label="Total Events"   value={fmtNum(pt.total_events)}           />
              <MetricCard iconKey="users"   label="Active Users"   value={fmtNum(pt.active_users)}           />
              <MetricCard iconKey="storage" label="Storage Used"   value={fmtGB(pt.total_bytes_uploaded)}    />
              <MetricCard iconKey="alerts"  label="Anomaly Alerts" value={fmtNum(anomalies.length)} danger={anomalies.length > 0} />
            </div>

            {/* ── 4. Daily upload trend ────────────────────────────────────── */}
            <ChartCard
              title="Daily Upload Trend"
              subtitle={`Uploads per day · showing last ${timeRange} days (${filteredTrend.length} data points)`}
            >
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={filteredTrend} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="uploadGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor={BLUE} stopOpacity={0.2} />
                      <stop offset="95%" stopColor={BLUE} stopOpacity={0}   />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
                  <XAxis dataKey="date" stroke="#4b5563" tick={{ fontSize: 11, fill: '#6b7280' }} tickFormatter={(d) => d?.slice(5) || d} />
                  <YAxis stroke="#4b5563" tick={{ fontSize: 11, fill: '#6b7280' }} />
                  <Tooltip {...TT} />
                  <Area type="monotone" dataKey="uploads" stroke={BLUE} strokeWidth={2} fill="url(#uploadGrad)" dot={false} activeDot={{ r: 4, fill: BLUE, strokeWidth: 0 }} />
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>

            {/* ── 5. Two-column: top files + event breakdown ───────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

              <ChartCard title="Top 10 Downloaded Files" subtitle="Ranked by download count">
                <ResponsiveContainer width="100%" height={290}>
                  <BarChart layout="vertical" data={topFiles} margin={{ top: 0, right: 16, left: 4, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" horizontal={false} />
                    <XAxis type="number" stroke="#4b5563" tick={{ fontSize: 11, fill: '#6b7280' }} />
                    <YAxis
                      type="category"
                      dataKey="filename"
                      width={115}
                      stroke="#4b5563"
                      tick={{ fontSize: 10, fill: '#6b7280' }}
                      tickFormatter={(v) => v && v.length > 14 ? `${v.slice(0, 12)}…` : v}
                    />
                    <Tooltip {...TT} />
                    <Bar dataKey="downloads" fill={BLUE} radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="Event Type Breakdown" subtitle="Uploads · Downloads · Deletes">
                <ResponsiveContainer width="100%" height={185}>
                  <PieChart>
                    <Pie
                      data={breakdown}
                      dataKey="count"
                      nameKey="event"
                      cx="50%"
                      cy="50%"
                      outerRadius={74}
                      innerRadius={36}
                      paddingAngle={3}
                    >
                      {breakdown.map((_, i) => (
                        <Cell key={`pie-${i}`} fill={PIE_PALETTE[i % PIE_PALETTE.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={TT.contentStyle}
                      formatter={(v) => [v.toLocaleString(), 'events']}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <PieLegend entries={breakdown} />
              </ChartCard>

            </div>

            {/* ── 6. Hourly activity ───────────────────────────────────────── */}
            <ChartCard
              title="Hourly Activity Pattern"
              subtitle={<>Hours 22–06 shown in <span className="text-red-400">anomaly red</span></>}
            >
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={hourly} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
                  <XAxis dataKey="hour" stroke="#4b5563" tick={{ fontSize: 11, fill: '#6b7280' }} tickFormatter={(h) => `${h}h`} />
                  <YAxis stroke="#4b5563" tick={{ fontSize: 11, fill: '#6b7280' }} />
                  <Tooltip {...TT} />
                  <Bar dataKey="events" radius={[3, 3, 0, 0]}>
                    {hourly.map((entry) => (
                      <Cell key={`h-${entry.hour}`} fill={(entry.hour >= 22 || entry.hour <= 6) ? RED : BLUE} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            {/* ── 7. Anomaly alerts ────────────────────────────────────────── */}
            {anomalies.length > 0 && (
              <ChartCard title="Anomaly Alerts" subtitle="Users with more than 5 off-hours events (22:00–06:00) on a single day">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-xs font-semibold text-red-400 bg-red-500/10 border border-red-500/20 px-2.5 py-0.5 rounded-full">
                    {anomalies.length} alert{anomalies.length > 1 ? 's' : ''}
                  </span>
                </div>
                <div className="space-y-2">
                  {anomalies.map((a, i) => (
                    <div key={i} className="flex items-center gap-3 bg-gray-800/60 border border-gray-700/50 rounded-xl px-4 py-3">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" aria-hidden="true" />
                      <span className="text-xs font-medium text-white flex-1">{a.user_id}</span>
                      <span className="text-xs text-gray-500">{fmtNum(a.off_hours_events)} events</span>
                      <span className="text-xs text-gray-600">{a.date}</span>
                    </div>
                  ))}
                </div>
              </ChartCard>
            )}

            {/* ── 8. HDFS + Spark status grid ──────────────────────────────── */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {STATUS_ITEMS.map((item) => (
                <div key={item.label} className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex items-center gap-3">
                  <span
                    className={`w-1.5 h-1.5 rounded-full shrink-0 ${item.ok ? 'bg-emerald-400' : 'bg-red-400'}`}
                    aria-hidden="true"
                  />
                  <div className="min-w-0">
                    <p className="text-[10px] text-gray-500 truncate">{item.label}</p>
                    <p className="text-xs font-semibold text-white truncate">{item.value}</p>
                  </div>
                </div>
              ))}
            </div>

          </div>
        )}
      </main>
    </div>
  );
};

export default Analytics;
