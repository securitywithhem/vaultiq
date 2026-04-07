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
import Navbar from '../components/Navbar';
import api from '../services/api';
import {
  AreaChart, Area,
  BarChart, Bar,
  PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { formatRelativeTime } from '../utils/format';
import styles from './Analytics.module.css';

// ─── Constants ────────────────────────────────────────────────────────────────
const BLUE         = '#378ADD';
const RED          = '#E24B4A';
const PIE_PALETTE  = ['#378ADD', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899'];

const TIME_RANGES = [
  { label: '7d',  days: 7  },
  { label: '14d', days: 14 },
  { label: '30d', days: 30 },
];

const SPARK_CMD =
  'docker exec spark-master spark-submit --master local[*] /opt/spark-jobs/analytics_job.py';

// Recharts shared tooltip style — references CSS vars set in global.css
const TT = {
  contentStyle: {
    background:   'var(--bg-elevated)',
    border:       '1px solid var(--bg-border)',
    borderRadius: '8px',
    color:        'var(--text-primary)',
    fontSize:     '12px',
  },
  itemStyle:  { color: 'var(--text-secondary)' },
  cursor:     { fill: 'rgba(55,138,221,0.07)' },
};

// ─── Formatters ───────────────────────────────────────────────────────────────
const fmtGB  = bytes  => `${((bytes || 0) / 1e9).toFixed(1)} GB`;
const fmtNum = n      => (n   || 0).toLocaleString();

// ─── Sub-components ───────────────────────────────────────────────────────────

/** Animated shimmer placeholder */
const Skeleton = ({ height = 80, style }) => (
  <div className={styles.skeleton} style={{ height, ...style }} />
);

/** Single KPI card in the metrics row */
const MetricCard = ({ label, value, icon, danger }) => (
  <div className={`${styles.metricCard} ${danger ? styles.metricCardDanger : ''}`}>
    <span className={styles.metricIcon} aria-hidden="true">{icon}</span>
    <div>
      <p className={styles.metricValue}>{value}</p>
      <p className={styles.metricLabel}>{label}</p>
    </div>
  </div>
);

/** Custom legend row rendered below the pie chart */
const PieLegend = ({ entries }) => (
  <div className={styles.pieLegend}>
    {entries.map((entry, i) => (
      <div key={entry.event || i} className={styles.pieLegendRow}>
        <span
          className={styles.pieDot}
          style={{ background: PIE_PALETTE[i % PIE_PALETTE.length] }}
        />
        <span className={styles.pieLegendLabel}>{entry.event}</span>
        <span className={styles.pieLegendCount}>{fmtNum(entry.count)}</span>
      </div>
    ))}
  </div>
);

// ─── Analytics (main component) ───────────────────────────────────────────────
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

  // ── Run Spark job (Python fallback) ────────────────────────────────────────
  const handleSparkRun = async () => {
    setSparkRunning(true);
    try {
      await api.post('/api/analytics/refresh');
      // Give the background script ~3 s to write cache files, then refetch
      setTimeout(() => {
        fetchData();
        setSparkRunning(false);
      }, 3_000);
    } catch {
      setSparkRunning(false);
    }
  };

  // ── Derived / memoised values ──────────────────────────────────────────────
  const pt = data?.platform_totals || {};

  /** daily_trend sliced to the selected time window */
  const filteredTrend = useMemo(() => {
    const all = data?.daily_trend || [];
    return all.slice(-timeRange);
  }, [data?.daily_trend, timeRange]);

  const topFiles  = data?.top_files        || [];
  const breakdown = data?.event_breakdown  || [];
  const hourly    = data?.hourly_pattern   || [];
  const anomalies = data?.anomalies        || [];

  /** True when data loaded successfully but every analytic is empty (Spark never ran) */
  const isNoData = data !== null &&
    !filteredTrend.length &&
    !breakdown.length &&
    !(pt.total_events);

  // ── HDFS / Spark status grid ───────────────────────────────────────────────
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
    <div className={styles.page}>
      <Navbar />

      <main className={styles.main}>

        {/* ── 1. Header ───────────────────────────────────────────────────── */}
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <div className={styles.titleRow}>
              <h1 className={styles.title}>Big Data Analytics</h1>
              <span className={styles.badgeLive}>● Live</span>
              {data?._source === 'cache' && (
                <span className={styles.badgeDanger}>cache</span>
              )}
            </div>
            {lastFetched && (
              <p className={styles.subtitle}>
                Last Spark run:&nbsp;{formatRelativeTime(lastFetched.toISOString())}
              </p>
            )}
          </div>

          <button
            className={styles.primaryBtn}
            onClick={handleSparkRun}
            disabled={sparkRunning || loading}
          >
            {sparkRunning ? 'Starting…' : '▶  Run Spark Job'}
          </button>
        </div>

        {/* ── 2. Time-range filter ─────────────────────────────────────────── */}
        {!loading && data && (
          <div className={styles.rangeBar}>
            {TIME_RANGES.map(r => (
              <button
                key={r.days}
                className={`${styles.rangeBtn} ${timeRange === r.days ? styles.rangeBtnActive : ''}`}
                onClick={() => setTimeRange(r.days)}
              >
                {r.label}
              </button>
            ))}
          </div>
        )}

        {/* ── Loading skeletons ────────────────────────────────────────────── */}
        {loading && (
          <>
            <div className={styles.metricsGrid}>
              <Skeleton height={86} />
              <Skeleton height={86} />
              <Skeleton height={86} />
              <Skeleton height={86} />
            </div>
            <Skeleton height={250} />
            <div className={styles.twoCol}>
              <Skeleton height={310} />
              <Skeleton height={310} />
            </div>
            <Skeleton height={250} />
          </>
        )}

        {/* ── Network / server error ───────────────────────────────────────── */}
        {!loading && error && (
          <div className={styles.errorBox}>
            <p className={styles.errorTitle}>Could not load analytics</p>
            <p className={styles.errorMsg}>{error}</p>
          </div>
        )}

        {/* ── No data — Spark hasn't been run yet ──────────────────────────── */}
        {!loading && !error && isNoData && (
          <div className={styles.emptyBox}>
            <p className={styles.emptyTitle}>No analytics data yet</p>
            <p className={styles.emptyMsg}>
              Run the Spark job first to populate results:
            </p>
            <div className={styles.codeBlock}>{SPARK_CMD}</div>
            <button
              className={styles.copyBtn}
              onClick={() => navigator.clipboard?.writeText(SPARK_CMD)}
            >
              Copy command
            </button>
          </div>
        )}

        {/* ── Dashboard ────────────────────────────────────────────────────── */}
        {!loading && !error && !isNoData && data && (
          <>
            {/* ── 3. Metric cards ──────────────────────────────────────────── */}
            <div className={styles.metricsGrid}>
              <MetricCard
                icon="⚡"
                label="Total Events"
                value={fmtNum(pt.total_events)}
              />
              <MetricCard
                icon="👥"
                label="Active Users"
                value={fmtNum(pt.active_users)}
              />
              <MetricCard
                icon="💾"
                label="Storage Used"
                value={fmtGB(pt.total_bytes_uploaded)}
              />
              <MetricCard
                icon="🚨"
                label="Anomaly Alerts"
                value={fmtNum(anomalies.length)}
                danger={anomalies.length > 0}
              />
            </div>

            {/* ── 4. Daily upload trend (area chart) ───────────────────────── */}
            <div className={styles.chartCard}>
              <p className={styles.chartTitle}>Daily Upload Trend</p>
              <p className={styles.chartSub}>
                Uploads per day&nbsp;·&nbsp;showing last {timeRange} days
                &nbsp;({filteredTrend.length} data points)
              </p>
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart
                  data={filteredTrend}
                  margin={{ top: 4, right: 16, left: 0, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="uploadGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor={BLUE} stopOpacity={0.15} />
                      <stop offset="95%" stopColor={BLUE} stopOpacity={0}    />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="var(--bg-border)"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="date"
                    stroke="var(--text-muted)"
                    tick={{ fontSize: 11 }}
                    tickFormatter={d => d?.slice(5) || d}   // show MM-DD only
                  />
                  <YAxis stroke="var(--text-muted)" tick={{ fontSize: 11 }} />
                  <Tooltip {...TT} />
                  <Area
                    type="monotone"
                    dataKey="uploads"
                    stroke={BLUE}
                    strokeWidth={2}
                    fill="url(#uploadGrad)"
                    dot={false}
                    activeDot={{ r: 4, fill: BLUE }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* ── 5. Two-column: top files (bar) + event breakdown (pie) ───── */}
            <div className={styles.twoCol}>

              {/* Horizontal bar — top 10 downloaded files */}
              <div className={styles.chartCard}>
                <p className={styles.chartTitle}>Top 10 Downloaded Files</p>
                <p className={styles.chartSub}>Ranked by download count</p>
                <ResponsiveContainer width="100%" height={290}>
                  <BarChart
                    layout="vertical"
                    data={topFiles}
                    margin={{ top: 0, right: 16, left: 4, bottom: 0 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="var(--bg-border)"
                      horizontal={false}
                    />
                    <XAxis
                      type="number"
                      stroke="var(--text-muted)"
                      tick={{ fontSize: 11 }}
                    />
                    <YAxis
                      type="category"
                      dataKey="filename"
                      width={115}
                      stroke="var(--text-muted)"
                      tick={{ fontSize: 10 }}
                      tickFormatter={v =>
                        v && v.length > 14 ? `${v.slice(0, 12)}…` : v
                      }
                    />
                    <Tooltip {...TT} />
                    <Bar dataKey="downloads" fill={BLUE} radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Donut pie — event type breakdown with custom legend */}
              <div className={styles.chartCard}>
                <p className={styles.chartTitle}>Event Type Breakdown</p>
                <p className={styles.chartSub}>Uploads · Downloads · Deletes</p>
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
                        <Cell
                          key={`pie-${i}`}
                          fill={PIE_PALETTE[i % PIE_PALETTE.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={TT.contentStyle}
                      formatter={v => [v.toLocaleString(), 'events']}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <PieLegend entries={breakdown} />
              </div>

            </div>

            {/* ── 6. Hourly activity (bar, anomaly colouring) ──────────────── */}
            <div className={styles.chartCard}>
              <p className={styles.chartTitle}>Hourly Activity Pattern</p>
              <p className={styles.chartSub}>
                Hours 22–06 shown in&nbsp;
                <span className={styles.redLabel}>anomaly red</span>
              </p>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart
                  data={hourly}
                  margin={{ top: 4, right: 16, left: 0, bottom: 0 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="var(--bg-border)"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="hour"
                    stroke="var(--text-muted)"
                    tick={{ fontSize: 11 }}
                    tickFormatter={h => `${h}h`}
                  />
                  <YAxis stroke="var(--text-muted)" tick={{ fontSize: 11 }} />
                  <Tooltip {...TT} />
                  <Bar dataKey="events" radius={[3, 3, 0, 0]}>
                    {hourly.map(entry => (
                      <Cell
                        key={`h-${entry.hour}`}
                        fill={(entry.hour >= 22 || entry.hour <= 6) ? RED : BLUE}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* ── 7. Anomaly alerts (only when there are anomalies) ────────── */}
            {anomalies.length > 0 && (
              <div className={styles.chartCard}>
                <div className={styles.anomalyHeader}>
                  <p className={styles.chartTitle}>Anomaly Alerts</p>
                  <span className={styles.badgeDanger}>
                    {anomalies.length} alert{anomalies.length > 1 ? 's' : ''}
                  </span>
                </div>
                <p className={styles.chartSub}>
                  Users with more than 5 off-hours events (22:00–06:00) on a single day
                </p>
                <div className={styles.anomalyList}>
                  {anomalies.map((a, i) => (
                    <div key={i} className={styles.anomalyRow}>
                      <span className={styles.redDot} aria-hidden="true" />
                      <span className={styles.anomalyUser}>{a.user_id}</span>
                      <span className={styles.anomalyCount}>
                        {fmtNum(a.off_hours_events)} events
                      </span>
                      <span className={styles.anomalyDate}>{a.date}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── 8. HDFS + Spark status grid ──────────────────────────────── */}
            <div className={styles.statusGrid}>
              {STATUS_ITEMS.map(item => (
                <div key={item.label} className={styles.statusCard}>
                  <span
                    className={`${styles.statusDot} ${item.ok ? styles.dotGreen : styles.dotRed}`}
                    aria-hidden="true"
                  />
                  <div>
                    <p className={styles.statusLabel}>{item.label}</p>
                    <p className={styles.statusValue}>{item.value}</p>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
};

export default Analytics;
