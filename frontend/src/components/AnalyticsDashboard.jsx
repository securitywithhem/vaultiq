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
import toast from 'react-hot-toast';
import {
  LineChart, Line,
  BarChart, Bar,
  PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts';
import styles from './AnalyticsDashboard.module.css';

// ─── Palette ─────────────────────────────────────────────────────────────────

const COLOR_UPLOAD    = '#378ADD';
const COLOR_DOWNLOAD  = '#10B981';
const COLOR_DETECTION = '#8B5CF6';
const VERDICT_COLORS  = {
  'Human':        '#4ade80',
  'Mixed':        '#fbbf24',
  'AI-Generated': '#ef4444',
};
const BAR_COLOR       = '#378ADD';

const TT_STYLE = {
  contentStyle: {
    background:   '#1f2937',
    border:       '1px solid #374151',
    borderRadius: '8px',
    color:        '#f9fafb',
    fontSize:     '12px',
  },
  itemStyle:  { color: '#9ca3af' },
  cursor:     { fill: 'rgba(55,138,221,0.07)' },
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
    hdfs:          { label: 'HDFS',        cls: styles.badgeHdfs  },
    local_cache:   { label: 'Local Cache', cls: styles.badgeLocal },
    supabase_live: { label: 'Live',        cls: styles.badgeLive  },
  };
  const { label, cls } = map[source] || { label: source || '—', cls: styles.badgeUnknown };
  return <span className={`${styles.sourceBadge} ${cls}`}>{label}</span>;
}

function MetricCard({ label, value, danger }) {
  return (
    <div className={`${styles.metricCard} ${danger ? styles.metricDanger : ''}`}>
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

  // ── Derived values (safe optional chaining + fallbacks) ───────────────────

  const da     = data?.daily_activity    || {};
  const ad     = data?.anomaly_detection || {};
  const ai     = data?.ai_usage_stats    || {};
  const sa     = data?.storage_analytics || {};
  const la     = data?.latency_analysis  || {};

  const dates      = da.dates              || [];
  const uploads    = da.uploads            || [];
  const downloads  = da.downloads          || [];
  const detections = da.detections         || [];
  const bytesDay   = da.total_bytes_per_day || [];

  // Today's metrics
  const todayIdx       = useMemo(() => dates.lastIndexOf(todayISO()), [dates]);
  const todayUploads   = todayIdx >= 0 ? (uploads[todayIdx] || 0)   : (uploads.at(-1) || 0);
  const todayBytes     = todayIdx >= 0 ? (bytesDay[todayIdx] || 0)  : (bytesDay.at(-1) || 0);
  const todayDetects   = todayIdx >= 0 ? (detections[todayIdx] || 0): (detections.at(-1) || 0);
  const anomalyCount   = (ad.delete_spikes || []).length;

  // Line chart data — last 14 days
  const lineData = useMemo(() => {
    const last14 = dates.slice(-14);
    return last14.map((date, i) => {
      const offset = dates.length - last14.length + i;
      return {
        date:       date.slice(5),           // show MM-DD
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
  }, [ai.verdict_counts]);

  // Horizontal bar — storage by file type (top 8)
  const storageBarData = useMemo(() => {
    const dist = sa.file_type_distribution || [];
    return dist.slice(0, 8).map(d => ({
      type:  d.file_type || 'unknown',
      mb:    parseFloat(((d.total_bytes || 0) / 1_048_576).toFixed(1)),
    }));
  }, [sa.file_type_distribution]);

  // Latency table rows
  const latencyRows = useMemo(() => {
    const avg = la.avg_latency_by_type || {};
    const p95 = la.p95_latency        || {};
    return Object.keys(avg).map(et => ({
      eventType: et,
      avg:       avg[et],
      p95:       p95[et] ?? '—',
    }));
  }, [la.avg_latency_by_type, la.p95_latency]);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className={styles.page}>
      <Navbar />
      <main className={styles.main}>

        {/* ── A. Header ──────────────────────────────────────────────────── */}
        <div className={styles.header}>
          <div>
            <div className={styles.titleRow}>
              <h1 className={styles.title}>VaultIQ Analytics</h1>
              {data && <SourceBadge source={data.source} />}
            </div>
            <p className={styles.subtitle}>
              Last updated:&nbsp;{data ? fmtDate(data.generated_at) : '—'}
            </p>
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
              <MetricCard label="Events Today"           value={(todayUploads + todayDetects).toLocaleString()} />
              <MetricCard label="Storage Uploaded Today" value={fmtMB(todayBytes)} />
              <MetricCard label="AI Detections Today"    value={todayDetects.toLocaleString()} />
              <MetricCard
                label="Anomalies Detected"
                value={anomalyCount.toLocaleString()}
                danger={anomalyCount > 0}
              />
            </div>

            {/* ── C. Daily activity line chart ─────────────────────────────── */}
            <div className={styles.chartCard}>
              <p className={styles.chartTitle}>Daily Activity</p>
              <p className={styles.chartSub}>Uploads, downloads, and AI detections — last 14 days</p>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={lineData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
                  <XAxis dataKey="date"      stroke="#6b7280" tick={{ fontSize: 11 }} />
                  <YAxis                     stroke="#6b7280" tick={{ fontSize: 11 }} />
                  <Tooltip {...TT_STYLE} />
                  <Legend wrapperStyle={{ fontSize: 12, color: '#9ca3af' }} />
                  <Line type="monotone" dataKey="uploads"    stroke={COLOR_UPLOAD}    strokeWidth={2} dot={false} activeDot={{ r: 4 }} name="Uploads" />
                  <Line type="monotone" dataKey="downloads"  stroke={COLOR_DOWNLOAD}  strokeWidth={2} dot={false} activeDot={{ r: 4 }} name="Downloads" />
                  <Line type="monotone" dataKey="detections" stroke={COLOR_DETECTION} strokeWidth={2} dot={false} activeDot={{ r: 4 }} name="AI Detections" />
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
                  <p style={{ color: '#6b7280', fontSize: '0.85rem' }}>No AI detection data yet.</p>
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
                  <p style={{ color: '#6b7280', fontSize: '0.85rem' }}>No upload data yet.</p>
                ) : (
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart
                      layout="vertical"
                      data={storageBarData}
                      margin={{ top: 0, right: 24, left: 4, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" horizontal={false} />
                      <XAxis type="number" stroke="#6b7280" tick={{ fontSize: 11 }} unit=" MB" />
                      <YAxis
                        type="category"
                        dataKey="type"
                        width={60}
                        stroke="#6b7280"
                        tick={{ fontSize: 11 }}
                      />
                      <Tooltip {...TT_STYLE} formatter={(v) => [`${v} MB`, 'Storage']} />
                      <Bar dataKey="mb" fill={BAR_COLOR} radius={[0, 4, 4, 0]} name="MB" />
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
                <p style={{ color: '#6b7280', fontSize: '0.85rem' }}>No latency data yet.</p>
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

      </main>
    </div>
  );
};

export default AnalyticsDashboard;
