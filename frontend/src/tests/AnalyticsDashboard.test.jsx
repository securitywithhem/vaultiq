/**
 * Tests for AnalyticsDashboard component
 * Run: npm test -- --testPathPattern=AnalyticsDashboard
 */

import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';

// ── Mock the analytics API module ──────────────────────────────────────────────
jest.mock('../api/analyticsApi');
import { fetchAnalytics, triggerAnalyticsJob } from '../api/analyticsApi';

// ── Mock Navbar (avoids needing AuthProvider / useAuth context) ────────────────
jest.mock('../components/Navbar', () => () => <nav data-testid="navbar" />);

// ── Mock recharts (avoids ResizeObserver errors in JSDOM) ─────────────────────
jest.mock('recharts', () => {
  const React = require('react');
  const Passthrough = ({ children }) => React.createElement('div', null, children);
  return {
    ResponsiveContainer: Passthrough,
    LineChart:           Passthrough,
    BarChart:            Passthrough,
    PieChart:            Passthrough,
    Line:                () => null,
    Bar:                 () => null,
    Pie:                 () => null,
    Cell:                () => null,
    XAxis:               () => null,
    YAxis:               () => null,
    CartesianGrid:       () => null,
    Tooltip:             () => null,
    Legend:              () => null,
  };
});

// ── Sample fixture (10 days, 3 verdicts, 2 file types, no anomalies) ──────────

const TODAY = new Date().toISOString().slice(0, 10);

function buildDates(n) {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (n - 1 - i));
    return d.toISOString().slice(0, 10);
  });
}

const DATES = buildDates(10);

const FIXTURE = {
  source:       'local_cache',
  generated_at: '2026-04-08T10:00:00.000Z',
  daily_activity: {
    dates:               DATES,
    uploads:             [5,  3,  7,  2,  8,  4,  6,  9,  1,  4],
    downloads:           [2,  1,  3,  1,  4,  2,  3,  5,  0,  2],
    detections:          [1,  2,  0,  3,  1,  2,  4,  1,  2,  3],
    total_bytes_per_day: [
      1_048_576, 2_097_152, 3_145_728, 524_288,
      4_194_304, 1_572_864, 2_621_440, 5_242_880, 262_144, 1_310_720,
    ],
  },
  anomaly_detection: {
    delete_spikes:    [],
    suspicious_users: [],
  },
  ai_usage_stats: {
    verdict_counts:    { Human: 12, Mixed: 5, 'AI-Generated': 8 },
    avg_score_by_type: { pdf: 0.62, docx: 0.41 },
    top_file_types:    [
      { file_type: 'pdf',  count: 15 },
      { file_type: 'docx', count: 10 },
    ],
  },
  storage_analytics: {
    top_uploaders: [
      { user_id: 'user_a', total_bytes: 5_242_880 },
      { user_id: 'user_b', total_bytes: 3_145_728 },
    ],
    file_type_distribution: [
      { file_type: 'pdf',  count: 10, total_bytes: 10_485_760, avg_bytes: 1_048_576 },
      { file_type: 'docx', count:  6, total_bytes:  6_291_456, avg_bytes: 1_048_576 },
    ],
  },
  latency_analysis: {
    avg_latency_by_type: { file_upload: 145.2, ai_detection: 320.8 },
    p95_latency:         { file_upload: 890.0, ai_detection: 2_450.0 },
    busiest_hours:       Array.from({ length: 24 }, (_, h) => ({ hour: h, event_count: h * 3 })),
  },
  user_behaviour: {
    daily_active_users:    DATES.map(d => ({ date: d, active_users: 4 })),
    returning_users_count: 3,
    common_sequences:      [],
  },
};

// ── Render helper ──────────────────────────────────────────────────────────────

function renderDashboard() {
  const { default: AnalyticsDashboard } = require('../components/AnalyticsDashboard');
  return render(
    <BrowserRouter>
      <AnalyticsDashboard />
    </BrowserRouter>
  );
}

// ── Tests ──────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
});

// test_1 — metric cards render correct values from fixture
test('renders metric cards with correct values from fixture', async () => {
  fetchAnalytics.mockResolvedValueOnce(FIXTURE);

  await act(async () => { renderDashboard(); });

  await waitFor(() => {
    // "Events Today" = uploads[today] + detections[today]
    expect(screen.getByText('VaultIQ Analytics')).toBeInTheDocument();
    expect(screen.getByText('Events Today')).toBeInTheDocument();
    expect(screen.getByText('Storage Uploaded Today')).toBeInTheDocument();
    expect(screen.getByText('AI Detections Today')).toBeInTheDocument();
    expect(screen.getByText('Anomalies Detected')).toBeInTheDocument();
  });
});

// test_2 — "No anomalies detected" when delete_spikes is empty
test('renders "No anomalies detected" when delete_spikes is []', async () => {
  fetchAnalytics.mockResolvedValueOnce(FIXTURE);

  await act(async () => { renderDashboard(); });

  await waitFor(() => {
    expect(screen.getByText(/No anomalies detected/i)).toBeInTheDocument();
  });
});

// test_3 — shows loading skeleton before data resolves
test('shows loading skeleton before data resolves', async () => {
  // Never resolve so we can inspect the loading state
  fetchAnalytics.mockReturnValueOnce(new Promise(() => {}));

  await act(async () => { renderDashboard(); });

  // Button should be disabled during load
  const btn = screen.getByRole('button', { name: /run analytics job/i });
  expect(btn).toBeDisabled();

  // Main analytics sections should NOT be rendered yet
  expect(screen.queryByText('Daily Activity')).not.toBeInTheDocument();
  expect(screen.queryByText('Anomaly Alerts')).not.toBeInTheDocument();
});

// test_4 — shows error message when fetchAnalytics rejects
test('shows error message when fetchAnalytics rejects', async () => {
  fetchAnalytics.mockRejectedValueOnce(new Error('503 Analytics service unavailable'));

  await act(async () => { renderDashboard(); });

  await waitFor(() => {
    expect(
      screen.getByText(/Analytics service unavailable/i)
    ).toBeInTheDocument();
  });

  // Retry button should appear
  expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
});

// test_5 — all 6 top-level section headings are present
test('all 6 analytics section headings are rendered when data loads', async () => {
  fetchAnalytics.mockResolvedValueOnce(FIXTURE);

  await act(async () => { renderDashboard(); });

  await waitFor(() => {
    expect(screen.getByText('Daily Activity')).toBeInTheDocument();
    expect(screen.getByText('AI Verdict Distribution')).toBeInTheDocument();
    expect(screen.getByText('Storage by File Type')).toBeInTheDocument();
    expect(screen.getByText('Anomaly Alerts')).toBeInTheDocument();
    expect(screen.getByText('Latency Metrics')).toBeInTheDocument();
  });
});

// test_6 — source badge renders for local_cache
test('renders "Local Cache" source badge', async () => {
  fetchAnalytics.mockResolvedValueOnce(FIXTURE);

  await act(async () => { renderDashboard(); });

  await waitFor(() => {
    expect(screen.getByText('Local Cache')).toBeInTheDocument();
  });
});
