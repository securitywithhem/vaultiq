/**
 * AnalyticsDashboard.jsx
 * Full-page analytics dashboard — uses data from bigdata/analytics_latest.json
 * via GET /api/analytics (HDFS → local cache → Supabase live fallback).
 *
 * Sections:
 *   A. Header:          title, generated_at, source badge, trigger button
 *   B. Metric cards:    events today, storage today, AI detections today, anomalies
 *   C. Line chart:      daily activity (uploads / downloads / detections) — last 14 days
 *   D. Pie chart:       AI verdict distribution (Human / Mixed / AI-Generated)
 *   E. Bar chart:       storage by file type (horizontal, MB)
 *   F. Anomaly panel:   delete spikes + suspicious users
 *   G. Latency table:   avg ms + p95 ms per event type
 */

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import Navbar from './Navbar';
import { fetchAnalytics, triggerAnalyticsJob } from '../api/analyticsApi';
import { detectVaultFiles } from '../api/aiDetectApi';
import { fileService } from '../services/fileService';
import toast from 'react-hot-toast';
import {
  LineChart, Line,
  BarChart, Bar,
  PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts';
import styles from './AnalyticsDashboard.module.css';

// ─── Palette — Apple system colors ───────────────────────────────────────────

const COLOR_UPLOAD    = '#0a84ff';   // Apple blue
const COLOR_DOWNLOAD  = '#30d158';   // Apple green
const COLOR_DETECTION = '#bf5af2';   // Apple purple
const VERDICT_COLORS  = {
  'Human':        '#30d158',         // Apple green
  'Mixed':        '#ff9f0a',         // Apple amber
  'AI-Generated': '#ff453a',         // Apple red
};
const BAR_COLOR       = '#0a84ff';

const TT_STYLE = {
  contentStyle: {
    background:   '#1c1c1e',
    border:       '1px solid rgba(255,255,255,0.09)',
    borderRadius: '10px',
    color:        '#f5f5f7',
    fontSize:     '12px',
    fontFamily:   '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Inter", sans-serif',
  },
  itemStyle:  { color: '#98989e' },
  cursor:     { fill: 'rgba(10,132,255,0.06)' },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function fmtMB(bytes) {
  return ((bytes || 0) / 1_048_576).toFixed(1) + ' MB';
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Skeleton({ height = 80 }) {
  return <div className={styles.skeleton} style={{ height }} />;
}

function SourceBadge({ source }) {
  const map = {
    hdfs:          { label: 'HDFS',        cls: styles.badgeHdfs    },
    local_cache:   { label: 'Local Cache', cls: styles.badgeLocal   },
    supabase_live: { label: 'Live',        cls: styles.badgeLive    },
    empty:         { label: 'No Data',     cls: styles.badgeUnknown },
  };
  const { label, cls } = map[source] || { label: source || '—', cls: styles.badgeUnknown };
  return <span className={`${styles.sourceBadge} ${cls}`}>{label}</span>;
}

function MetricCard({ label, value, danger, accent }) {
  return (
    <div className={`${styles.metricCard} ${danger ? styles.metricDanger : ''}`}
         style={accent ? { borderLeft: `3px solid ${accent}` } : {}}>
      <p className={styles.metricLabel}>{label}</p>
      <p className={styles.metricValue}>{value}</p>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

const AnalyticsDashboard = () => {
  const [data,       setData]       = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState(null);
  const [triggering, setTriggering] = useState(false);

  // ── Data fetch ─────────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchAnalytics();
      setData(result);
    } catch (err) {
      setError(err.message || 'Failed to load analytics');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Trigger job ────────────────────────────────────────────────────────────

  const handleTrigger = async () => {
    setTriggering(true);
    try {
      const res = await triggerAnalyticsJob();
      toast.success(res.message || 'Analytics job started');
    } catch (err) {
      toast.error(err.message || 'Failed to trigger analytics job');
    } finally {
      setTriggering(false);
    }
  };

  // ── Derived values — all memoised on `data` so downstream hooks get stable refs ──

  const da = useMemo(() => data?.daily_activity    || {}, [data]);
  const ad = useMemo(() => data?.anomaly_detection || {}, [data]);
  const ai = useMemo(() => data?.ai_usage_stats    || {}, [data]);
  const sa = useMemo(() => data?.storage_analytics || {}, [data]);
  const la = useMemo(() => data?.latency_analysis  || {}, [data]);

  const dates      = useMemo(() => da.dates               || [], [da]);
  const uploads    = useMemo(() => da.uploads             || [], [da]);
  const downloads  = useMemo(() => da.downloads           || [], [da]);
  const detections = useMemo(() => da.detections          || [], [da]);
  const bytesDay   = useMemo(() => da.total_bytes_per_day || [], [da]);

  // Today's metrics
  const todayIdx     = useMemo(() => dates.lastIndexOf(todayISO()), [dates]);
  const todayBytes   = todayIdx >= 0 ? (bytesDay[todayIdx]   || 0) : (bytesDay.at(-1)   || 0);
  const todayDetects = todayIdx >= 0 ? (detections[todayIdx] || 0) : (detections.at(-1) || 0);
  const anomalyCount = (ad.delete_spikes || []).length;

  // Line chart data — last 14 days
  const lineData = useMemo(() => {
    const last14 = dates.slice(-14);
    return last14.map((date, i) => {
      const offset = dates.length - last14.length + i;
      return {
        date:       date.slice(5),
        uploads:    uploads[offset]    || 0,
        downloads:  downloads[offset]  || 0,
        detections: detections[offset] || 0,
      };
    });
  }, [dates, uploads, downloads, detections]);

  // Pie chart data — verdicts
  const verdictData = useMemo(() => {
    const vc = ai.verdict_counts || {};
    return Object.entries(vc).map(([name, value]) => ({ name, value }));
  }, [ai]);

  // Horizontal bar — storage by file type (top 8)
  const storageBarData = useMemo(() => {
    const dist = sa.file_type_distribution || [];
    return dist.slice(0, 8).map(d => ({
      type: d.file_type || 'unknown',
      mb:   parseFloat(((d.total_bytes || 0) / 1_048_576).toFixed(1)),
    }));
  }, [sa]);

  // Latency table rows
  const latencyRows = useMemo(() => {
    const avg = la.avg_latency_by_type || {};
    const p95 = la.p95_latency        || {};
    return Object.keys(avg).map(et => ({
      eventType: et,
      avg:       avg[et],
      p95:       p95[et] ?? '—',
    }));
  }, [la]);

  // ── Vault file AI analysis state ────────────────────────────────────────
  const [vaultFiles,       setVaultFiles]       = useState([]);
  const [vaultLoading,     setVaultLoading]     = useState(false);
  const [vaultSearch,      setVaultSearch]      = useState('');
  const [selectedVaultIds, setSelectedVaultIds] = useState([]);
  const [vaultResults,     setVaultResults]     = useState(null);
  const [vaultAnalysing,   setVaultAnalysing]   = useState(false);
  const [vaultError,       setVaultError]       = useState('');

  const loadVaultFiles = useCallback(() => {
    setVaultLoading(true);
    fileService.getFiles(0)
      .then(d => setVaultFiles(d.files || []))
      .catch(() => setVaultFiles([]))
      .finally(() => setVaultLoading(false));
  }, []);

  useEffect(() => { loadVaultFiles(); }, [loadVaultFiles]);

  const filteredVault = useMemo(() =>
    vaultFiles.filter(f => f.filename.toLowerCase().includes(vaultSearch.toLowerCase()))
  , [vaultFiles, vaultSearch]);

  const toggleVaultSel = (id) => {
    setSelectedVaultIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : prev.length < 5 ? [...prev, id] : prev
    );
  };

  const handleVaultAnalyse = async () => {
    if (!selectedVaultIds.length) return;
    setVaultAnalysing(true);
    setVaultError('');
    setVaultResults(null);
    try {
      const data = await detectVaultFiles(selectedVaultIds);
      setVaultResults(data.results);
      toast.success('Vault file analysis complete');
    } catch (err) {
      setVaultError(err.message);
    } finally {
      setVaultAnalysing(false);
    }
  };

  const renderVerdictBadge = (verdict) => {
    const map = {
      human:        { label: 'Human',       color: '#30d158', bg: 'rgba(48,209,88,0.12)',  border: 'rgba(48,209,88,0.25)'  },
      mixed:        { label: 'Mixed',        color: '#ff9f0a', bg: 'rgba(255,159,10,0.12)', border: 'rgba(255,159,10,0.25)' },
      ai_generated: { label: 'AI Generated', color: '#ff453a', bg: 'rgba(255,69,58,0.12)',  border: 'rgba(255,69,58,0.25)'  },
    };
    const v = map[verdict] || map.mixed;
    return (
      <span style={{ background: v.bg, color: v.color, border: `1px solid ${v.border}`, padding: '3px 10px', borderRadius: 9999, fontWeight: 600, fontSize: '0.75rem', letterSpacing: '-0.1px' }}>
        {v.label}
      </span>
    );
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className={styles.page}>
      <Navbar />
      <main className={styles.main}>

        {/* ── A. Header (source badge + timestamp + trigger, no big title) ── */}
        <div className={styles.header}>
          <div>
            <div className={styles.titleRow}>
              {data && <SourceBadge source={data.source} />}
              <p className={styles.subtitle} style={{ margin: 0 }}>
                Last updated:&nbsp;{data ? fmtDate(data.generated_at) : '—'}
              </p>
            </div>
          </div>

          <button
            className={styles.primaryBtn}
            onClick={handleTrigger}
            disabled={triggering || loading}
            aria-label="Run analytics job"
          >
            {triggering ? 'Starting…' : '▶  Run Analytics Job'}
          </button>
        </div>

        {/* ── Loading skeletons ───────────────────────────────────────────── */}
        {loading && (
          <>
            <div className={styles.skeletonGrid}>
              <Skeleton height={88} />
              <Skeleton height={88} />
              <Skeleton height={88} />
              <Skeleton height={88} />
            </div>
            <Skeleton height={250} />
            <div className={styles.twoCol}>
              <Skeleton height={280} />
              <Skeleton height={280} />
            </div>
            <Skeleton height={220} />
            <Skeleton height={160} />
          </>
        )}

        {/* ── Error state ─────────────────────────────────────────────────── */}
        {!loading && error && (
          <div className={styles.errorBox} role="alert">
            <p className={styles.errorTitle}>
              {error.includes('503') || error.includes('unavailable')
                ? 'Analytics service unavailable. Run the analytics job or check your HDFS connection.'
                : error}
            </p>
            <p className={styles.errorMsg}>
              {error.includes('503') || error.includes('unavailable')
                ? ''
                : 'Check that the analytics job has run and HDFS is reachable.'}
            </p>
            <button className={styles.retryBtn} onClick={loadData}>
              Retry
            </button>
          </div>
        )}

        {/* ── Dashboard ───────────────────────────────────────────────────── */}
        {!loading && !error && data && (
          <>
            {/* ── B. Metric cards ─────────────────────────────────────────── */}
            <div className={styles.metricsGrid}>
              <MetricCard label="Total Vault Files"      value={(data._summary?.total_files ?? 0).toLocaleString()} accent="#0a84ff" />
              <MetricCard label="Storage Uploaded Today" value={fmtMB(todayBytes)} accent="#30d158" />
              <MetricCard label="AI Detections Today"    value={todayDetects.toLocaleString()} accent="#bf5af2" />
              <MetricCard
                label="Anomalies Detected"
                value={anomalyCount.toLocaleString()}
                danger={anomalyCount > 0}
                accent={anomalyCount > 0 ? '#ff453a' : 'rgba(255,255,255,0.09)'}
              />
            </div>

            {/* ── C. Daily activity line chart ─────────────────────────────── */}
            <div className={styles.chartCard}>
              <p className={styles.chartTitle}>Daily Activity</p>
              <p className={styles.chartSub}>Uploads, downloads, and AI detections — last 14 days</p>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={lineData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.07)" vertical={false} />
                  <XAxis dataKey="date"      stroke="#636366" tick={{ fontSize: 11, fill: '#636366' }} />
                  <YAxis                     stroke="#636366" tick={{ fontSize: 11, fill: '#636366' }} />
                  <Tooltip {...TT_STYLE} />
                  <Legend wrapperStyle={{ fontSize: 12, color: '#98989e' }} />
                  <Line type="monotone" dataKey="uploads"    stroke={COLOR_UPLOAD}    strokeWidth={2} dot={false} activeDot={{ r: 4 }} name="Uploads"       isAnimationActive={false} />
                  <Line type="monotone" dataKey="downloads"  stroke={COLOR_DOWNLOAD}  strokeWidth={2} dot={false} activeDot={{ r: 4 }} name="Downloads"    isAnimationActive={false} />
                  <Line type="monotone" dataKey="detections" stroke={COLOR_DETECTION} strokeWidth={2} dot={false} activeDot={{ r: 4 }} name="AI Detections" isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* ── D + E two-column row ─────────────────────────────────────── */}
            <div className={styles.twoCol}>

              {/* D. AI verdict distribution — pie chart */}
              <div className={styles.chartCard}>
                <p className={styles.chartTitle}>AI Verdict Distribution</p>
                <p className={styles.chartSub}>Human / Mixed / AI-Generated</p>
                {verdictData.length === 0 ? (
                  <p style={{ color: '#636366', fontSize: '0.8125rem' }}>No AI detection data yet.</p>
                ) : (
                  <ResponsiveContainer width="100%" height={240}>
                    <PieChart>
                      <Pie
                        data={verdictData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={90}
                        innerRadius={42}
                        paddingAngle={3}
                        isAnimationActive={false}
                        label={({ name, percent }) =>
                          `${name} ${(percent * 100).toFixed(0)}%`
                        }
                        labelLine={false}
                      >
                        {verdictData.map((entry) => (
                          <Cell
                            key={entry.name}
                            fill={VERDICT_COLORS[entry.name] || '#6b7280'}
                          />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={TT_STYLE.contentStyle}
                        formatter={(v, name) => [v.toLocaleString(), name]}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>

              {/* E. Storage by file type — horizontal bar chart */}
              <div className={styles.chartCard}>
                <p className={styles.chartTitle}>Storage by File Type</p>
                <p className={styles.chartSub}>Total MB uploaded per file type</p>
                {storageBarData.length === 0 ? (
                  <p style={{ color: '#636366', fontSize: '0.8125rem' }}>No upload data yet.</p>
                ) : (
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart
                      layout="vertical"
                      data={storageBarData}
                      margin={{ top: 0, right: 24, left: 4, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.07)" horizontal={false} />
                      <XAxis type="number" stroke="#636366" tick={{ fontSize: 11, fill: '#636366' }} unit=" MB" />
                      <YAxis
                        type="category"
                        dataKey="type"
                        width={60}
                        stroke="#636366"
                        tick={{ fontSize: 11, fill: '#636366' }}
                      />
                      <Tooltip {...TT_STYLE} formatter={(v) => [`${v} MB`, 'Storage']} />
                      <Bar dataKey="mb" fill={BAR_COLOR} radius={[0, 4, 4, 0]} name="MB" isAnimationActive={false} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>

            </div>

            {/* ── F. Anomaly alerts panel ──────────────────────────────────── */}
            <div className={styles.chartCard}>
              <p className={styles.chartTitle}>Anomaly Alerts</p>
              <p className={styles.chartSub}>Unusual deletion spikes and high-volume user activity</p>

              {(ad.delete_spikes || []).length === 0 ? (
                <div className={styles.noAnomaly} role="status">
                  <span>✓</span> No anomalies detected
                </div>
              ) : (
                <>
                  {(ad.delete_spikes || []).map((spike, i) => (
                    <div key={i} className={styles.anomalyAlert} role="alert">
                      ⚠ Unusual deletion activity on <strong>{spike.date}</strong>:&nbsp;
                      {spike.delete_count?.toLocaleString()} deletions
                    </div>
                  ))}
                </>
              )}

              {(ad.suspicious_users || []).length > 0 && (
                <>
                  <p className={styles.chartSub} style={{ marginTop: '1rem' }}>
                    High-volume users (&gt;50 events/hour):
                  </p>
                  {(ad.suspicious_users || []).map((u, i) => (
                    <div key={i} className={styles.suspiciousUser}>
                      User <strong>{u.user_id}</strong> — {u.event_count?.toLocaleString()} events at {u.hour}
                    </div>
                  ))}
                </>
              )}
            </div>

            {/* ── G. Latency metrics table ─────────────────────────────────── */}
            <div className={styles.chartCard}>
              <p className={styles.chartTitle}>Latency Metrics</p>
              <p className={styles.chartSub}>Average and p95 response times per event type</p>

              {latencyRows.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', fontSize: '0.8125rem' }}>No latency data yet.</p>
              ) : (
                <table className={styles.latencyTable}>
                  <thead>
                    <tr>
                      <th>Event Type</th>
                      <th>Avg (ms)</th>
                      <th>p95 (ms)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {latencyRows.map(row => (
                      <tr
                        key={row.eventType}
                        className={typeof row.p95 === 'number' && row.p95 > 2000 ? styles.highLatency : ''}
                      >
                        <td>{row.eventType}</td>
                        <td>{typeof row.avg === 'number' ? row.avg.toFixed(1) : '—'}</td>
                        <td>{typeof row.p95 === 'number' ? row.p95.toFixed(1) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}

        {/* ── H. Analyse Vault Files ───────────────────────────────────── */}
        <div className={styles.chartCard}>
          <p className={styles.chartTitle}>Analyse Vault Files</p>
          <p className={styles.chartSub}>
            Select up to 5 files from your vault and run AI-content detection without re-uploading.
          </p>

          {/* Search */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', marginBottom: 10, transition: 'border-color 0.2s' }}>
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="var(--text-muted)">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search vault files…"
              value={vaultSearch}
              onChange={e => setVaultSearch(e.target.value)}
              style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: 'var(--text-primary)', fontSize: '0.875rem', fontFamily: 'var(--font-sans)' }}
            />
          </div>

          {/* File list */}
          {vaultLoading ? (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.8125rem' }}>Loading vault files…</p>
          ) : filteredVault.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.8125rem' }}>
              {vaultSearch ? 'No files match your search.' : 'No vault files yet. Upload files from the Dashboard first.'}
            </p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 12px', display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 200, overflowY: 'auto' }}>
              {filteredVault.map(f => {
                const checked  = selectedVaultIds.includes(f.id);
                const disabled = !checked && selectedVaultIds.length >= 5;
                return (
                  <li
                    key={f.id}
                    onClick={() => !disabled && toggleVaultSel(f.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '9px 12px', borderRadius: 8,
                      border: `1px solid ${checked ? 'rgba(10,132,255,0.4)' : 'var(--border)'}`,
                      background: checked ? 'rgba(10,132,255,0.08)' : 'var(--bg-elevated)',
                      cursor: disabled ? 'not-allowed' : 'pointer',
                      opacity: disabled ? 0.4 : 1,
                      transition: 'all 0.2s',
                    }}
                  >
                    <input type="checkbox" checked={checked} readOnly disabled={disabled} style={{ accentColor: '#0a84ff' }} />
                    <span style={{ flex: 1, fontSize: '0.875rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.filename}</span>
                    <span style={{ fontSize: '0.6875rem', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', background: 'var(--bg-surface)', padding: '2px 6px', borderRadius: 4, border: '1px solid var(--border)' }}>
                      {f.mime_type?.split('/').pop()?.toUpperCase() || 'FILE'}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}

          {selectedVaultIds.length > 0 && (
            <p style={{ fontSize: '0.8125rem', color: 'var(--blue)', marginBottom: 10, fontWeight: 500 }}>
              {selectedVaultIds.length} file{selectedVaultIds.length > 1 ? 's' : ''} selected
            </p>
          )}

          <button
            onClick={handleVaultAnalyse}
            disabled={vaultAnalysing || selectedVaultIds.length === 0}
            style={{
              background: selectedVaultIds.length ? 'var(--blue)' : 'var(--bg-elevated)',
              color: selectedVaultIds.length ? '#fff' : 'var(--text-muted)',
              border: 'none', padding: '10px 20px', borderRadius: 10,
              fontWeight: 600, fontSize: '0.875rem', fontFamily: 'var(--font-sans)',
              cursor: selectedVaultIds.length ? 'pointer' : 'not-allowed',
              opacity: vaultAnalysing ? 0.6 : 1,
              transition: 'all 0.2s',
            }}
          >
            {vaultAnalysing ? 'Analysing…' : 'Run AI Analysis'}
          </button>

          {vaultError && (
            <div style={{ marginTop: 12, padding: 12, background: 'rgba(255,69,58,0.08)', color: 'var(--red)', border: '1px solid rgba(255,69,58,0.2)', borderRadius: 8, fontSize: '0.875rem', fontFamily: 'var(--font-sans)' }}>
              {vaultError}
            </div>
          )}

          {vaultResults && (
            <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {vaultResults.map((r, i) => (
                <div key={i} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 10, padding: 14 }}>
                  <p style={{ margin: '0 0 8px', fontWeight: 600, fontSize: '0.875rem', color: 'var(--text-primary)', letterSpacing: '-0.2px' }}>{r.filename}</p>
                  {r.status === 'error' ? (
                    <p style={{ color: 'var(--amber)', fontSize: '0.8125rem' }}>⚠ {r.error}</p>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '1.375rem', fontWeight: 700, letterSpacing: '-0.5px', color: 'var(--text-primary)' }}>{Math.round((r.score || 0) * 100)}%</span>
                      {renderVerdictBadge(r.verdict)}
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--font-sans)' }}>Confidence: {r.confidence}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

      </main>
    </div>
  );
};

export default AnalyticsDashboard;
