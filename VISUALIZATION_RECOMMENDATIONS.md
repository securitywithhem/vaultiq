# VaultIQ Visualization & Dashboard Strategy

**Purpose:** Map analytics data to optimal chart types, with implementation guidance for React + Recharts

---

## 1. DAILY ACTIVITY ANALYTICS

### Data Available
```json
{
  "dates": ["2026-05-01", "2026-05-02", ...],
  "uploads": [234, 256, ...],
  "downloads": [128, 145, ...],
  "detections": [45, 67, ...],
  "total_bytes_per_day": [2500000000, 3200000000, ...]
}
```

### Visualization Recommendations

#### 1.1 **Line Chart** (Primary) ⭐⭐⭐
**Why:** Shows trends over time; easy to spot patterns and anomalies

```jsx
<LineChart data={daily_activity}>
  <Line dataKey="uploads" stroke="#2563eb" name="Uploads" />
  <Line dataKey="downloads" stroke="#059669" name="Downloads" />
  <Line dataKey="detections" stroke="#dc2626" name="AI Detections" />
  <XAxis dataKey="dates" />
  <YAxis />
  <Tooltip />
  <Legend />
</LineChart>
```

**Best for:**
- Monitoring upload/download trends
- Detecting spike patterns
- Checking if system is getting more usage

**When to use:** Dashboard homepage, administrator view

---

#### 1.2 **Stacked Area Chart** (Alternative) ⭐⭐
**Why:** Shows composition AND total volume

```jsx
<AreaChart data={daily_activity}>
  <Area type="monotone" dataKey="uploads" stackId="1" fill="#2563eb" />
  <Area type="monotone" dataKey="downloads" stackId="1" fill="#059669" />
  <Area type="monotone" dataKey="detections" stackId="1" fill="#dc2626" />
</AreaChart>
```

**Best for:**
- Understanding event type mix (what % are uploads vs downloads?)
- Visual impact of growth

**When to use:** Monthly reports, stakeholder presentations

---

#### 1.3 **Bar Chart** (Alternative) ⭐⭐
**Why:** Easy to compare exact values across days

```jsx
<BarChart data={daily_activity}>
  <Bar dataKey="uploads" fill="#2563eb" />
  <Bar dataKey="downloads" fill="#059669" />
  <Bar dataKey="detections" fill="#dc2626" />
</BarChart>
```

**Best for:**
- Day-over-day comparisons
- Identifying specific high/low days

---

#### 1.4 **File Size Trend** (Separate chart) ⭐⭐⭐
**Why:** Shows storage growth independently

```jsx
<AreaChart data={daily_activity}>
  <Area 
    type="monotone" 
    dataKey="total_bytes_per_day" 
    fill="#f59e0b"
    stroke="#d97706"
  />
  <YAxis label={{ value: 'Total GB', angle: -90 }} />
</AreaChart>
```

**Why separate?** 
- Storage is in GB (millions); events in hundreds
- Two different scales confuse readers
- Teachers care about "How much disk space?", admins care about "event count"

**Metric to display:** Format as GB with tooltip showing actual bytes

---

### Dashboard Layout
```
┌─────────────────────────────────────────────┐
│  Daily Activity (Last 30 Days)              │
│  [Line Chart: uploads/downloads/detections] │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│  Total Storage Growth (Last 30 Days)        │
│  [Area Chart: GB over time]                 │
└─────────────────────────────────────────────┘
```

---

## 2. ANOMALY DETECTION

### Data Available
```json
{
  "delete_spikes": [
    { "date": "2026-05-01", "delete_count": 450 }
  ],
  "suspicious_users": [
    { "user_id": "abc123", "hour": "2026-05-01T14:00:00Z", "event_count": 67 }
  ]
}
```

### Visualization Recommendations

#### 2.1 **Table with Heatmap Background** (Primary) ⭐⭐⭐
**Why:** Anomalies are rare; table highlights exceptions

```jsx
<Table>
  <Column header="Date" />
  <Column header="Delete Count" />
  <Column 
    header="Status" 
    render={(row) => {
      if (row.deleteCount > threshold) {
        return <Chip color="red" label="🚨 SPIKE" />
      }
      return <Chip color="green" label="✓ Normal" />
    }}
  />
</Table>
```

**Display logic:**
- Normal deletions: gray background
- 2σ threshold exceeded: red background
- Show threshold line on hover

**When to use:** Admin panel, incident response

---

#### 2.2 **Time-series with Threshold Band** (Secondary) ⭐⭐⭐
**Why:** Visualize the threshold; see when anomalies occur

```jsx
<LineChart data={deletions_over_time}>
  <Line dataKey="delete_count" stroke="#dc2626" />
  <ReferenceLine 
    y={threshold} 
    stroke="#f97316" 
    strokeDasharray="5 5"
    label="Anomaly Threshold (mean + 2σ)"
  />
  <Area 
    dataKey="delete_count" 
    fill="#fecaca" 
    opacity={0.2}
    // Highlight anomalies
  />
</LineChart>
```

**When to use:** Operational dashboard, trend analysis

---

#### 2.3 **Suspicious Users List** (Table) ⭐⭐
**Why:** Actionable list for investigation

```jsx
<Table sortable filterable>
  <Column header="User ID" searchable />
  <Column header="Time (UTC)" />
  <Column header="Event Count" sortable />
  <Column 
    header="Action" 
    render={(row) => (
      <Button onClick={() => viewUserHistory(row.userId)}>
        View History
      </Button>
    )}
  />
</Table>
```

**Recommended actions:**
- Click → View user's event sequence
- Click → Check if legitimate (batch operation?)
- Click → Temporarily throttle user if abusive

---

## 3. AI USAGE STATISTICS

### Data Available
```json
{
  "verdict_counts": {
    "human_written": 1250,
    "ai_generated": 340,
    "mixed": 89
  },
  "avg_score_by_type": {
    "pdf": 0.52,
    "docx": 0.48,
    "txt": 0.61
  },
  "top_file_types": [
    { "file_type": "pdf", "count": 892 },
    { "file_type": "docx", "count": 654 }
  ]
}
```

### Visualization Recommendations

#### 3.1 **Pie Chart / Donut Chart** (Primary) ⭐⭐⭐
**Why:** Shows proportion of verdicts at a glance

```jsx
<PieChart>
  <Pie 
    data={[
      { name: "Human-Written", value: verdict_counts.human_written, fill: "#10b981" },
      { name: "AI-Generated", value: verdict_counts.ai_generated, fill: "#ef4444" },
      { name: "Mixed/Uncertain", value: verdict_counts.mixed, fill: "#f59e0b" }
    ]}
    cx="50%"
    cy="50%"
    labelLine={false}
    label={({ name, value, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
  />
</PieChart>
```

**Display:**
- Green = Safe (Human-written)
- Red = Risky (AI-generated)
- Orange = Review (Mixed)

**When to use:** Dashboard summary, stakeholder updates, teacher briefings

---

#### 3.2 **Bar Chart: AI Score by File Type** (Secondary) ⭐⭐⭐
**Why:** Teachers want to know "which file types are most suspicious?"

```jsx
<BarChart data={avg_score_by_type}>
  <Bar dataKey="value" fill="#ef4444" />
  <XAxis dataKey="file_type" />
  <YAxis domain={[0, 1]} label="Avg AI Score" />
  <ReferenceLine 
    y={0.55} 
    stroke="#f59e0b" 
    label="Threshold"
  />
</BarChart>
```

**Insight:** If PDFs average 0.75 but TXTs average 0.25, users might be uploading PDFs written by AI, but TXTs manually written.

**When to use:** Report for curriculum designers

---

#### 3.3 **Horizontal Bar: Top File Types** (Tertiary) ⭐⭐
**Why:** Ranked list; easy to scan

```jsx
<BarChart 
  data={top_file_types} 
  layout="vertical"
  height={300}
>
  <Bar dataKey="count" fill="#3b82f6" />
  <XAxis type="number" />
  <YAxis dataKey="file_type" type="category" />
</BarChart>
```

**When to use:** Monthly reports

---

#### 3.4 **Gauge Chart** (Summary Metric) ⭐⭐⭐
**Why:** KPI visualization; "What % of submissions are human-written?"

```jsx
const humanWrittenPercent = 
  (verdict_counts.human_written / total_submissions) * 100;

<Gauge 
  value={humanWrittenPercent}
  min={0}
  max={100}
  label={`${humanWrittenPercent.toFixed(1)}% Human`}
  color={humanWrittenPercent > 80 ? "green" : "orange"}
/>
```

**When to use:** Executive dashboard, teacher dashboard top card

---

## 4. STORAGE ANALYTICS

### Data Available
```json
{
  "top_uploaders": [
    { "user_id": "user123", "total_bytes": 5000000000 }
  ],
  "file_type_distribution": [
    { "file_type": "pdf", "count": 892, "total_bytes": 2500000000, "avg_bytes": 2801000 }
  ]
}
```

### Visualization Recommendations

#### 4.1 **Horizontal Bar: Top Uploaders** (Primary) ⭐⭐⭐
**Why:** Shows "who's using the most space?"

```jsx
<BarChart 
  data={top_uploaders} 
  layout="vertical"
  height={300}
>
  <Bar dataKey="total_bytes" fill="#8b5cf6" />
  <XAxis 
    type="number" 
    label={{ value: 'Total GB', offset: 10 }}
    tickFormatter={(value) => (value / 1e9).toFixed(1)}
  />
  <YAxis dataKey="user_id" type="category" width={100} />
  <Tooltip 
    formatter={(value) => [(value / 1e9).toFixed(2), 'GB']}
  />
</BarChart>
```

**Action:** Click user → Quota management

---

#### 4.2 **Treemap: File Type Distribution** (Primary) ⭐⭐⭐
**Why:** Shows both count AND size in one view

```jsx
<Treemap
  data={file_type_distribution}
  dataKey="total_bytes"
  stroke="#fff"
  fill="#3b82f6"
  content={({ x, y, width, height, name, value }) => (
    <text 
      x={x + width / 2}
      y={y + height / 2}
      textAnchor="middle"
    >
      {name}: {(value / 1e9).toFixed(1)}GB
    </text>
  )}
/>
```

**Why Treemap?**
- Traditional pie/bar shows count but not total bytes
- Treemap shows both: size of rectangle = bytes, label = type
- Instantly see "PDFs use the most storage"

**When to use:** Storage optimization, capacity planning

---

#### 4.3 **Table: Detailed Breakdown** (Secondary) ⭐⭐
```jsx
<Table sortable>
  <Column header="File Type" />
  <Column header="Count" sortable />
  <Column header="Total GB" sortable />
  <Column header="Avg File Size" sortable />
</Table>
```

---

## 5. LATENCY ANALYSIS

### Data Available
```json
{
  "avg_latency_by_type": {
    "file_upload": 234.5,
    "file_download": 145.2,
    "ai_detection": 1230.0
  },
  "p95_latency": {
    "file_upload": 890.3,
    "file_download": 456.1,
    "ai_detection": 3450.0
  },
  "busiest_hours": [
    { "hour": 9, "event_count": 2345 },
    { "hour": 10, "event_count": 3456 }
  ]
}
```

### Visualization Recommendations

#### 5.1 **Grouped Bar Chart: Avg vs P95** (Primary) ⭐⭐⭐
**Why:** Shows both average AND worst-case performance

```jsx
<BarChart data={latency_data}>
  <Bar dataKey="avg_ms" fill="#3b82f6" name="Average" />
  <Bar dataKey="p95_ms" fill="#ef4444" name="95th Percentile" />
  <XAxis dataKey="event_type" />
  <YAxis label="Latency (ms)" />
  <Tooltip formatter={(value) => `${value.toFixed(0)} ms`} />
  <Legend />
</BarChart>
```

**Why both?**
- Avg = typical experience
- P95 = worst-case experience
- Shows variance: if avg=500 but p95=3000, something is causing spikes

**When to use:** SLA monitoring, performance debugging

---

#### 5.2 **Heatmap: Busiest Hours** (Primary) ⭐⭐⭐
**Why:** Shows "when is the system busiest?"

```jsx
const heatmapData = busiest_hours.map(({ hour, event_count }) => ({
  hour,
  value: event_count,
  fill: getColorForIntensity(event_count, max_count)
}));

<BarChart data={heatmapData} layout="vertical">
  <Bar 
    dataKey="value" 
    fill="#f59e0b"
    radius={[0, 8, 8, 0]}
  />
  <XAxis type="number" />
  <YAxis 
    dataKey="hour" 
    type="category"
    tickFormatter={(h) => `${h}:00`}
  />
</BarChart>
```

**Insights:**
- Peak at 10:00-12:00 (morning uploads)
- Dip at 18:00-20:00 (evening low usage)
- Plan maintenance windows during low periods

**When to use:** Operations team, capacity planning

---

#### 5.3 **Line Chart: P95 Over Time** (Trending) ⭐⭐
**Why:** Detect performance degradation

```jsx
<LineChart data={p95_latency_daily}>
  <Line 
    dataKey="p95_ms" 
    stroke="#ef4444"
    strokeWidth={2}
  />
  <ReferenceLine 
    y={sla_threshold}  // e.g., 2000ms
    stroke="#fbbf24"
    label="SLA Threshold"
  />
</LineChart>
```

**Alert:** If P95 crosses SLA threshold for 3 consecutive days → trigger investigation

---

## 6. USER BEHAVIOR

### Data Available
```json
{
  "daily_active_users": [
    { "date": "2026-05-01", "active_users": 245 }
  ],
  "returning_users_count": 1823,
  "common_sequences": [
    { "user_id": "user123", "sequence": ["file_upload", "ai_detect", "file_download"] }
  ]
}
```

### Visualization Recommendations

#### 6.1 **Area Chart: DAU Trend** (Primary) ⭐⭐⭐
**Why:** Shows engagement over time

```jsx
<AreaChart data={daily_active_users}>
  <Area 
    type="monotone" 
    dataKey="active_users" 
    fill="#06b6d4" 
    stroke="#0891b2"
  />
  <XAxis dataKey="date" />
  <YAxis label="Daily Active Users" />
</AreaChart>
```

**Interpretation:**
- Rising trend = growing adoption ✅
- Declining trend = churn risk ⚠️
- Spiky = event-driven (course deadline)

**When to use:** Executive dashboard, retention analysis

---

#### 6.2 **KPI Cards: Retention Metric** (Summary) ⭐⭐⭐
**Why:** Quick snapshot for teachers/admins

```jsx
<Card>
  <Metric label="Returning Users" value={1823} />
  <Subtitle>Users active > 3 days in last 30 days</Subtitle>
</Card>
```

**Also show:**
- % Retention: `(returning_users / total_users) * 100`
- Trend: vs last month (↑ 12% or ↓ 5%)

---

#### 6.3 **Sankey Diagram: Event Sequences** (Exploratory) ⭐⭐
**Why:** Shows "what do users do after uploading?"

```jsx
const sankey_data = {
  nodes: [
    { name: "file_upload" },
    { name: "ai_detect" },
    { name: "file_download" }
  ],
  links: [
    { source: 0, target: 1, value: 450 },  // 450 users: upload → detect
    { source: 0, target: 2, value: 320 }   // 320 users: upload → download
  ]
};

<Sankey data={sankey_data}>...</Sankey>
```

**Insight:** If most users upload then immediately download, they might not be using AI detection. Consider making it more prominent.

**When to use:** Product optimization, UX research

---

## IMPLEMENTATION ROADMAP

### Phase 1: Essential Dashboards (MVP)
```
Teacher Dashboard:
├── Verdict Summary (Pie chart)
├── Daily Activity (Line chart)
└── AI Score by File Type (Bar)

Admin Dashboard:
├── Daily Activity (Stacked area)
├── Suspicious Activity (Table)
├── Latency (Grouped bar)
└── DAU Trend (Area chart)
```

### Phase 2: Advanced Insights (Next Release)
```
Analytics Dashboard:
├── Storage Breakdown (Treemap)
├── Top Uploaders (Horizontal bar)
├── Busiest Hours (Heatmap)
├── P95 Latency Trend (Line)
└── Returning Users (KPI card)
```

### Phase 3: Exploratory (Future)
```
Research Dashboard:
├── Event Sequences (Sankey)
├── User Cohorts (Cohort analysis)
├── Anomaly Alerts (Alert system)
└── Custom Queries (Ad-hoc analytics)
```

---

## VISUALIZATION BEST PRACTICES FOR YOUR PROJECT

### Colors: Meaning Matters
```
Green (#10b981)  = Safe, Positive (human-written)
Red (#ef4444)    = Risky, Negative (AI-generated)
Blue (#3b82f6)   = Neutral, Data (uploads/downloads)
Yellow (#f59e0b) = Warning, Threshold (anomaly line)
```

### Formatting: Units & Labels
```javascript
// Latency
234.5 ms → "235 ms"

// File size
2500000000 bytes → "2.5 GB"

// Percentages
0.52 → "52%"

// Timestamps
"2026-05-01T14:30:00Z" → "May 1, 2:30 PM"
```

### Interactivity: What Users Need
```jsx
// Hover → Tooltip with exact values
<Tooltip 
  formatter={(value) => value.toFixed(2)}
  labelFormatter={(label) => formatDate(label)}
/>

// Click → Drill down or navigate
<Bar onClick={(data) => navigate(`/user/${data.user_id}`)} />

// Legend → Toggle series on/off
<Legend 
  onClick={(e) => toggleSeries(e.dataKey)}
/>
```

### Mobile Responsiveness
```jsx
// Desktop: 4 charts side-by-side
// Tablet: 2x2 grid
// Mobile: 1 chart per row (stacked)

<ResponsiveContainer width="100%" height={400}>
  <LineChart data={data}>...</LineChart>
</ResponsiveContainer>
```

---

## SUMMARY TABLE: Quick Reference

| Analytics | Chart Type | Why | When |
|-----------|-----------|-----|------|
| Daily activity | Line | Trends over time | Dashboard, trending |
| Anomalies | Table + threshold band | Highlight exceptions | Admin panel |
| AI verdicts | Pie/Donut | Proportion at glance | Summary KPI |
| AI scores by type | Grouped bar | Comparison | Report |
| Storage by type | Treemap | Both count & size | Capacity planning |
| Top users | Horizontal bar | Ranked list | Monitoring |
| Latency: avg vs p95 | Grouped bar | Show variance | SLA monitoring |
| Busiest hours | Heatmap | Pattern visualization | Operations |
| DAU trend | Area | Engagement over time | Executive dashboard |
| User sequences | Sankey | Flow visualization | Product research |

---

**Recommended Library:** You're already using **Recharts** in your project — excellent choice for VaultIQ. It integrates seamlessly with React 19, has responsive containers, and supports all visualizations above.

