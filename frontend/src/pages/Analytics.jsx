import React, { useState, useEffect } from 'react';
import api from '../services/api';
import Navbar from '../components/Navbar';

export default function Analytics() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function fetchAnalytics() {
      setLoading(true);
      setError(null);
      try {
        const response = await api.get('/analytics');
        setData(response.data);
      } catch (err) {
        // TODO: remove in prod
        console.log('Analytics error:', err);
        setError(
          'Analytics service is unavailable. Make sure Spark is running and try again.'
        );
      } finally {
        setLoading(false);
      }
    }
    fetchAnalytics();
  }, []);

  /**
   * Format bytes to human-readable.
   */
  function formatBytes(bytes) {
    if (bytes == null) return '—';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  }

  /**
   * Build an SVG polyline from daily trend data points.
   */
  function renderTrendChart(dailyTrend) {
    if (!dailyTrend || dailyTrend.length === 0) {
      return <p className="text-muted">No trend data available</p>;
    }

    const width = 600;
    const height = 200;
    const padding = 40;
    const chartW = width - padding * 2;
    const chartH = height - padding * 2;

    const maxCount = Math.max(...dailyTrend.map((d) => d.count), 1);
    const points = dailyTrend.map((d, i) => {
      const x = padding + (i / Math.max(dailyTrend.length - 1, 1)) * chartW;
      const y = padding + chartH - (d.count / maxCount) * chartH;
      return `${x},${y}`;
    });

    const areaPoints = [
      `${padding},${padding + chartH}`,
      ...points,
      `${padding + chartW},${padding + chartH}`,
    ].join(' ');

    return (
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="trend-chart"
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((pct) => {
          const y = padding + chartH - pct * chartH;
          return (
            <g key={pct}>
              <line
                x1={padding}
                y1={y}
                x2={padding + chartW}
                y2={y}
                stroke="var(--border)"
                strokeWidth="1"
                strokeDasharray={pct === 0 ? 'none' : '4 3'}
              />
              <text
                x={padding - 8}
                y={y + 4}
                textAnchor="end"
                fill="var(--text-muted)"
                fontSize="10"
              >
                {Math.round(maxCount * pct)}
              </text>
            </g>
          );
        })}

        {/* Area fill */}
        <polygon
          points={areaPoints}
          fill="url(#trendGradient)"
          opacity="0.3"
        />

        {/* Gradient def */}
        <defs>
          <linearGradient id="trendGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.4" />
            <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Line */}
        <polyline
          points={points.join(' ')}
          fill="none"
          stroke="var(--primary)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Data points */}
        {dailyTrend.map((d, i) => {
          const x = padding + (i / Math.max(dailyTrend.length - 1, 1)) * chartW;
          const y = padding + chartH - (d.count / maxCount) * chartH;
          return (
            <g key={i}>
              <circle cx={x} cy={y} r="4" fill="var(--primary)" />
              <circle cx={x} cy={y} r="6" fill="var(--primary)" opacity="0.2" />
            </g>
          );
        })}

        {/* X-axis labels */}
        {dailyTrend.map((d, i) => {
          if (dailyTrend.length > 10 && i % Math.ceil(dailyTrend.length / 7) !== 0) return null;
          const x = padding + (i / Math.max(dailyTrend.length - 1, 1)) * chartW;
          const label = new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          return (
            <text
              key={i}
              x={x}
              y={height - 8}
              textAnchor="middle"
              fill="var(--text-muted)"
              fontSize="10"
            >
              {label}
            </text>
          );
        })}
      </svg>
    );
  }

  return (
    <div className="page-layout">
      <Navbar />
      <main className="page-content">
        <div className="page-header">
          <div>
            <h1 className="page-title">Analytics</h1>
            <p className="page-desc">Insights from your storage activity</p>
          </div>
        </div>

        {loading ? (
          <div className="analytics-grid">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="analytics-card">
                <div className="skeleton skeleton--title" />
                <div className="skeleton skeleton--chart" />
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="empty-state">
            <div className="empty-state-icon">
              <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
                <circle cx="24" cy="24" r="20" stroke="var(--warning)" strokeWidth="2" />
                <path d="M24 16V26M24 32V32.5" stroke="var(--warning)" strokeWidth="2.5" strokeLinecap="round" />
              </svg>
            </div>
            <h3>Analytics Unavailable</h3>
            <p>{error}</p>
          </div>
        ) : (
          <div className="analytics-grid">
            {/* Top Accessed Files */}
            <div className="analytics-card analytics-card--wide">
              <h3 className="analytics-card-title">
                <span className="analytics-card-dot analytics-card-dot--primary" />
                Top Accessed Files
              </h3>
              {data?.topFiles && data.topFiles.length > 0 ? (
                <div className="bar-chart">
                  {data.topFiles.map((file, i) => {
                    const maxAccess = Math.max(
                      ...data.topFiles.map((f) => f.access_count),
                      1
                    );
                    const widthPct = (file.access_count / maxAccess) * 100;
                    return (
                      <div className="bar-row" key={i}>
                        <span className="bar-label" title={file.filename}>
                          {file.filename}
                        </span>
                        <div className="bar-track">
                          <div
                            className="bar-fill"
                            style={{ width: `${widthPct}%` }}
                          />
                        </div>
                        <span className="bar-value">{file.access_count}</span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-muted">No file access data yet</p>
              )}
            </div>

            {/* Storage per User */}
            <div className="analytics-card">
              <h3 className="analytics-card-title">
                <span className="analytics-card-dot analytics-card-dot--success" />
                Storage Usage
              </h3>
              {(data?.userStorage || data?.storagePerUser) && (data.userStorage || data.storagePerUser).length > 0 ? (
                <div className="storage-list">
                  {(data.userStorage || data.storagePerUser).map((entry, i) => (
                    <div className="storage-item" key={i}>
                      <div className="storage-item-avatar">
                        {String(entry.user_id).charAt(0).toUpperCase()}
                      </div>
                      <div className="storage-item-info">
                        <span className="storage-item-id">
                          User {String(entry.user_id).substring(0, 8)}…
                        </span>
                        <span className="storage-item-size">
                          {formatBytes(entry.total_bytes)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted">No storage data yet</p>
              )}
            </div>

            {/* Daily Upload Trend */}
            <div className="analytics-card analytics-card--wide">
              <h3 className="analytics-card-title">
                <span className="analytics-card-dot analytics-card-dot--primary" />
                Daily Upload Trend
              </h3>
              {renderTrendChart(data?.dailyTrend)}
            </div>

            {/* Anomalies */}
            <div className="analytics-card">
              <h3 className="analytics-card-title">
                <span className="analytics-card-dot analytics-card-dot--danger" />
                Anomalies Detected
              </h3>
              {data?.anomalies && data.anomalies.length > 0 ? (
                <div className="anomaly-list">
                  {data.anomalies.map((a, i) => (
                    <div className="anomaly-item" key={i}>
                      <div className="anomaly-badge">
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                          <path d="M7 1L13 12H1L7 1Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
                          <path d="M7 5.5V8.5M7 10V10.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                        </svg>
                      </div>
                      <div className="anomaly-info">
                        <span className="anomaly-hour">
                          Hour {a.hour}:00
                        </span>
                        <span className="anomaly-count">
                          {a.event_count} events
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="anomaly-clear">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="var(--success)" strokeWidth="1.5" />
                    <path d="M8 12L11 15L16 9" stroke="var(--success)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <p>No anomalies detected</p>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
