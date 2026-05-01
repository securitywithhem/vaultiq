# Spark DAG Visualization for VaultIQ Analytics

## Typical Spark DAG for Analytics Job

```
┌──────────────────────────────────────┐
│  Stage 0: READ                       │
│  Read Supabase event_logs            │
│  Partition by date                   │
│  Tasks: 1 (single partition read)    │
└──────────────┬───────────────────────┘
               │
               ▼
┌──────────────────────────────────────┐
│  Stage 1: PARSE & ENRICH             │
│  JSON parsing, timestamp extraction  │
│  Tasks: 1 (single-threaded)          │
└──────────────┬───────────────────────┘
               │
        ┌──────┴──────┬──────────┬──────────┬──────────┐
        │             │          │          │          │
        ▼             ▼          ▼          ▼          ▼
    ┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐
    │Stage 2a│  │Stage 2b│  │Stage 2c│  │Stage 2d│  │Stage 2e│
    │ DAILY  │  │ANOMALY │  │  AI    │  │STORAGE │  │LATENCY │
    │ACTIVITY│  │DETECT  │  │ STATS  │  │METRICS │  │ANALYSIS│
    │        │  │        │  │        │  │        │  │        │
    │ Tasks: │  │ Tasks: │  │ Tasks: │  │ Tasks: │  │ Tasks: │
    │  4     │  │  3     │  │  4     │  │  3     │  │  4     │
    └────┬───┘  └────┬───┘  └────┬───┘  └────┬───┘  └────┬───┘
         │           │           │           │           │
         └───────────┴───────────┴───────────┴───────────┘
                        │
         ┌──────────────┴──────────────┐
         │                             │
         ▼                             ▼
    ┌─────────┐              ┌──────────────┐
    │Stage 2f │              │Stage 3:      │
    │ USER    │              │ COLLECT      │
    │BEHAVIOR │              │ Merge results│
    │ Tasks: 4│              │ Tasks: 1     │
    └────┬────┘              └──────┬───────┘
         │                          │
         └──────────────┬───────────┘
                        │
                        ▼
              ┌───────────────────┐
              │ OUTPUT            │
              │analytics_latest   │
              │.json (20KB)       │
              └───────────────────┘
```

## Execution Flow

1. **Input (Stage 0)**: 50,030 events from Supabase
2. **Parsing (Stage 1)**: Single task reads and parses JSON
3. **Parallel Analytics (Stages 2a-2f)**: 6 independent jobs run in parallel:
   - Daily Activity (4 tasks) - Group by date
   - Anomaly Detection (3 tasks) - Find spikes
   - AI Usage Stats (4 tasks) - Verdict distribution
   - Storage Analytics (3 tasks) - Top users
   - Latency Analysis (4 tasks) - Performance metrics
   - User Behavior (4 tasks) - Retention/DAU
4. **Merge (Stage 3)**: Single task combines all outputs
5. **Output**: analytics_latest.json ready for presentation

## Spark Optimizations Applied

- **Predicate Pushdown**: Filter events by date early
- **Column Pruning**: Select only needed columns
- **Partition Pruning**: Read only relevant date partitions
- **Broadcast Join**: Users dimension broadcast to all tasks
- **Shuffle Optimization**: Combine small partitions

## Performance Characteristics

```
Input Size:     50,030 events (~5 MB)
Shuffle Volume: ~10 MB (intermediate data)
Network Hops:   5-6 (for parallel analytics)
Total Runtime:  10-60 seconds (local[*] mode)
Peak Memory:    ~300 MB (per executor)
Parallelism:    8 tasks per job (on 8-core machine)
```
