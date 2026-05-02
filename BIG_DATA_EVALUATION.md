# VaultIQ Big Data Engineering Evaluation

**Evaluated by:** Big Data Engineer  
**Date:** May 2, 2026  
**Project:** VaultIQ - Secure Document Management with AI-Powered Analytics  
**Overall Score:** 7.5/10

---

## Executive Summary

VaultIQ demonstrates a **solid understanding of big data fundamentals** with a well-architected event-driven pipeline combining Apache Hadoop and Spark. However, the implementation has several scalability limitations and misses opportunities for modern big data patterns. The project is **production-ready for small-to-medium deployments** (< 100GB/month) but would require significant refactoring for enterprise scale.

---

## 1. BIG DATA ARCHITECTURE ASSESSMENT

### ✅ Strengths

#### 1.1 Correct Distributed System Topology
- **HDFS as primary storage** ✅ Appropriate for batch analytics workloads
- **Spark for batch processing** ✅ Proper use of MapReduce abstraction
- **Date partitioning** (`/vaultiq/logs/YYYY-MM-DD/`) ✅ Enables efficient partition pruning
- **Multi-tier read strategy** ✅ HDFS → Local Cache → Supabase (smart fallback pattern)
- **WebHDFS REST API** ✅ Allows non-JVM clients (Node.js) to write to HDFS without Hadoop client

#### 1.2 Event Logging Architecture
```
Application Events → Redis Queue → HDFS (primary) → Spark Analytics
                  ↓ (fallback)
                  Supabase PostgreSQL
```
This 3-tier logging pattern is **correct big data practice**:
- Asynchronous logging (fire-and-forget)
- Batch writes (100 events per 5 seconds)
- Graceful degradation (HDFS → Supabase)

#### 1.3 Analytics Pipeline
Six analytics functions computed in parallel:
- Daily activity trends
- Anomaly detection (statistical 2-sigma thresholds)
- AI usage statistics
- Storage analytics
- Latency analysis (including p95 percentile)
- User behavior tracking

**Verdict:** Solid core design.

---

### ❌ Weaknesses & Missed Concepts

#### 1.4 Missing Stream Processing
**Problem:** The pipeline is **batch-only**. No real-time analytics.

```
Current (Batch):
Events → Log Files → (Spark Job runs periodically) → Dashboard sees stale data

Recommended (Lambda Architecture):
Events → Kafka → Speed Layer (Storm/Flink) → Real-time dashboards
              ↓
            Batch Layer (Spark) → Historical analytics
```

**Impact:** 
- Analytics dashboard shows data with 5-30 minute latency
- Cannot detect anomalies in real-time
- No streaming triggers for alerts

**Example:** If a user deletes 1000 files at 3:00 PM, you won't detect the spike until the next Spark batch job runs (could be 15+ minutes).

---

#### 1.5 No Data Warehouse / Structured Query Layer
**Problem:** Results are written as a single JSON file, not a queryable database.

```
Current:
analytics_latest.json → Frontend reads → Fixed schema

Better:
Spark writes to Parquet → Presto/Trino queries → Ad-hoc analytics API
```

**Impact:**
- Cannot run ad-hoc queries (e.g., "How many users uploaded > 100 MB in the last week?")
- All analytics are pre-computed; new questions require code changes
- No data exploration capabilities for stakeholders

---

#### 1.6 No Distributed Caching Layer
**Problem:** Spark recomputes all aggregations from scratch on every job run.

```
Current:
Read all logs from HDFS → Compute daily_activity, anomalies, ai_usage_stats, ...
(Even if only 1% of data changed)

Better:
Cache aggregates incrementally:
- Day N-1: Precomputed (immutable)
- Today: Incremental update only
```

**Tools:** Apache Kudu, Delta Lake, or Iceberg tables.

**Impact:** 
- Job runtime scales linearly with data size
- Cannot handle petabyte-scale logs efficiently

---

#### 1.7 No Schema Evolution / Data Validation
**Problem:** HDFS JSONL is schemaless. No validation of incoming events.

```python
# Current: blindly reads any JSON
df = spark.read.json(HDFS_LOGS_PATH + "*/*")

# What if an event arrives with:
# - missing user_id?
# - misspelled event_type?
# - event_type as integer instead of string?
```

**Impact:**
- Silent data corruption
- Analytics silently exclude malformed records
- Debugging issues is difficult (no error logs)

**Better approach:** Define Spark schema + validate:
```python
from pyspark.sql.types import StructType, StructField, StringType, LongType

schema = StructType([
    StructField("event_type", StringType(), False),  # NOT NULL
    StructField("user_id", StringType(), False),
    StructField("timestamp", StringType(), False),
    StructField("file_size_bytes", LongType(), True),
])

df = spark.read.schema(schema).json(HDFS_LOGS_PATH + "*/*")
```

---

#### 1.8 No Data Partitioning Strategy for Computation
**Problem:** Analytics filter data **after reading everything**.

```python
# Current:
df = spark.read.json(HDFS_LOGS_PATH + "*/*")  # Read ALL dates
df = df.filter(F.col("date") >= F.date_sub(F.current_date(), 30))  # Then filter

# Better (Partition Pruning):
# Spark understands HDFS date partitioning
# Reads ONLY logs from last 30 days
```

**Impact:**
- Jobs read 100% of data even when needing 10%
- Wastes I/O and compute resources

---

#### 1.9 No Data Quality Checks
**Problem:** Analytics assume data is correct.

```python
# What if:
# - file_size_bytes = -1000?
# - ai_score = 5.2 (should be 0-1)?
# - user_id = null for 20% of records?

# Current: No validation, silently incorrect results
```

**Better approach:**
```python
# Data quality checks before analytics
assert (df.filter(F.col("file_size_bytes") < 0).count() == 0), "Negative file sizes!"
assert (df.filter((F.col("ai_score") < 0) | (F.col("ai_score") > 1)).count() == 0)
```

---

#### 1.10 HDFS Replication & Redundancy
**Problem:** HDFS stores logs on a single cluster.

```
Current:
HDFS Cluster 1 ← logs (replication factor = 3, but all on same cluster)

If entire AWS availability zone fails:
- All logs lost
- Cannot rebuild analytics
```

**Better approach:**
```
Primary HDFS Cluster → (async replication) → S3
                    → (geo-replicated) → Backup cluster in different AZ
```

**Current:** Project has S3 backup for **results** only, not primary logs. Good but incomplete.

---

## 2. SPARK JOB ANALYSIS

### ✅ Good Practices

```python
# Line 15-18: Proper SparkSession initialization
spark = SparkSession.builder \
    .appName("VaultIQ-Analytics") \
    .config("spark.sql.session.timeZone", "UTC") \  # Avoid time bugs
    .getOrCreate()

spark.sparkContext.setLogLevel("WARN")  # Reduce noise
```

✅ **UTC timezone handling** - prevents timezone-related bugs  
✅ **6 independent analytics** - easy to parallelize (missing opportunity)  
✅ **Collect to driver for JSON** - acceptable for small result sets  

### ❌ Performance Issues

#### 2.1 Redundant Shuffles
```python
# Line 34-41: daily_activity() — reads data multiple times
pivot = df.groupBy("date", "event_type").agg(...).groupBy("date").pivot(...)
bytes_per_day = df.groupBy("date").agg(F.sum("file_size_bytes")...)

# Problem: df is read twice, two separate shuffles
# Solution: Single pass with multiple aggregations
```

**Better:**
```python
result = df.groupBy("date").agg(
    F.count(F.when(F.col("event_type") == "file_upload", 1)).alias("uploads"),
    F.count(F.when(F.col("event_type") == "file_download", 1)).alias("downloads"),
    F.sum("file_size_bytes").alias("total_bytes")
)
```

#### 2.2 Approximate Quantiles with High Tolerance
```python
# Line 215: p95 percentile calculation
q = subset.stat.approxQuantile("duration_ms", [0.95], 0.01)  # ± 1% error
```

**Problem:** 0.01 relative error on latencies can misrepresent performance.
- If true p95 = 500ms, this gives 495-505ms (0.5s swing)
- For SLA monitoring, use exact quantiles:

```python
df.createOrReplaceTempView("latencies")
spark.sql("""
  SELECT PERCENTILE(duration_ms, 0.95) as p95_latency
  FROM latencies
""")
```

#### 2.3 Inefficient JSON Output Serialization
```python
# Line 301-303: Serialize to JSON via RDD
results_json = json.dumps(results, indent=2)
rdd = spark.sparkContext.parallelize([results_json], 1)
rdd.saveAsTextFile(hdfs_out)
```

**Problem:** Unnecessary RDD conversion. Use:
```python
# Write directly as JSON with Spark
df_results = spark.createDataFrame([results])
df_results.coalesce(1).write.format("json").save(hdfs_out)
```

---

## 3. DATA VOLUME & SCALABILITY ASSESSMENT

### Projected Capacity

**Assumptions:**
- 1,000 daily active users
- 50 events per user per day = 50,000 events/day
- ~5 KB per event (JSON serialized)

**Monthly:**
- 1.5M events
- 7.5 GB raw logs
- After Spark processing: ~50 MB compressed analytics results

**Verdict:** Current setup handles this comfortably.

### At 10x Scale (10,000 DAU)

- 500,000 events/day = 15M events/month
- 75 GB raw logs/month
- Job runtime: ~5-10 minutes (acceptable)

**Verdict:** Still feasible.

### At 100x Scale (100,000 DAU)

- 5M events/day = 150M events/month
- 750 GB raw logs/month
- Job runtime: ~30-60 minutes (getting slow)

**Problems emerge:**
- Spark job takes > 1 hour (users see stale analytics)
- HDFS storage costs spike
- All aggregations recomputed daily (wasteful)

**This is where your architecture breaks down.**

---

## 4. EVENT LOGGING BEST PRACTICES ASSESSMENT

### ✅ Strengths

```javascript
// Line 17-20: Resilient Redis connection
const redisClient = redis.createClient({
  url: REDIS_URL,
  socket: { reconnectStrategy: (retries) => Math.min(retries * 50, 500) }
});
```

✅ **Exponential backoff** - prevents thundering herd  
✅ **Asynchronous logging** - non-blocking  
✅ **Batch flushing** (100 events / 5 sec) - efficient network usage  

```javascript
// Line 189-203: Graceful shutdown
async function gracefulShutdown() {
  // Flush remaining events before exit
}
process.on('SIGTERM', gracefulShutdown);
```

✅ **Flushes on shutdown** - prevents data loss  

### ❌ Issues

#### 4.1 No Deduplication
**Problem:** If a log flush fails and retries, the same event may be logged twice.

```javascript
// Line 122-125: Puts events back in queue on failure
for (const event of events) {
  await redisClient.lPush('event_queue', JSON.stringify(event));
}
// But if redisClient.lPush fails midway, you have duplicates
```

**Impact:** Analytics counts may be off by a few percent.

**Solution:** Add idempotent event IDs:
```javascript
const event = {
  event_id: uuid.v4(),  // Unique ID
  event_type: eventType,
  timestamp: Date.now(),
  ...
};
```

#### 4.2 No Ordering Guarantees
**Problem:** Events may arrive out of order at Spark.

```
Event A (t=10:00:00) → Redis
Event B (t=10:00:01) → Redis
On flush: [B, A] ← Wrong order!
```

**Impact:** Analytics like "user_behaviour" sequences may be incorrect.

**Solution:** Use timestamp-based reconstruction in Spark:
```python
df = df.orderBy("timestamp", "event_id")  # Reconstruct correct order
```

---

## 5. MISSING BIG DATA BEST PRACTICES

### 5.1 No Data Lineage / Metadata Tracking
**Problem:** Can't easily answer:
- Where did this number come from?
- Which events were included in this analytic?
- Who changed the threshold?

**Solution:** Implement data lineage (Apache Atlas, OpenMetadata):
```json
{
  "job_id": "analytics_2026-05-02_14:30:00",
  "input_tables": ["hdfs://vaultiq/logs/2026-05-01, 2026-05-02"],
  "output": "s3://analytics/analytics_latest.json",
  "transformation": "daily_activity",
  "timestamp": "2026-05-02T14:30:00Z"
}
```

---

### 5.2 No Data Governance / Access Control
**Problem:** Anyone with Supabase access can read all event logs.

**Solution:** 
- HDFS ACLs for log files
- Supabase RLS policies
- Data classification (PII, sensitive, public)

---

### 5.3 No Incremental Processing
**Problem:** Every Spark job reprocesses all historical data.

**Solution:** Implement Delta Lake or similar:
```python
from delta.tables import DeltaTable

# Write incrementally
df_new.write.format("delta").mode("append").save("analytics_table")

# Merge on-update
DeltaTable.forPath(spark, "analytics_table").delete(...)
```

---

### 5.4 No Monitoring / Alerting
**Problem:** Job failures are silent.

```javascript
// hdfsLogger.js: Error is logged but no alert sent
} catch (hdfsErr) {
  console.error('[logEvent] HDFS write failed...', hdfsErr.message);
  // Should email ops team, trigger PagerDuty, etc.
}
```

**Solution:** Integrate monitoring:
- Prometheus for metrics
- ELK Stack for log aggregation
- Alerts for job failures

---

## 6. DETAILED SCORING BREAKDOWN

| Category | Score | Comments |
|----------|-------|----------|
| **Architecture** | 8/10 | Solid distributed system design; missing streaming layer |
| **Scalability** | 6/10 | Works for < 100GB/month; doesn't scale beyond |
| **Data Quality** | 5/10 | No validation, schema, or quality checks |
| **Fault Tolerance** | 7/10 | Good fallbacks; missing redundancy at scale |
| **Code Quality** | 7/10 | Readable, documented; some inefficiencies |
| **Big Data Concepts** | 7.5/10 | Understands fundamentals; misses modern patterns |
| **Production Readiness** | 7/10 | Good for MVP; needs hardening for scale |

**Overall: 7.5/10**

---

## 7. RECOMMENDATIONS FOR IMPROVEMENT

### Phase 1: Foundation (Now)
- [ ] Add schema validation in Spark (prevents silent data corruption)
- [ ] Implement data quality checks (assertions on events)
- [ ] Add monitoring/alerting on job failures
- [ ] Document all assumptions (data volume, event schema)

### Phase 2: Mid-Term (3-6 months)
- [ ] Migrate to Delta Lake for incremental processing
- [ ] Add query layer (Presto/Trino) for ad-hoc analytics
- [ ] Implement streaming analytics (Kafka + Flink for real-time dashboards)
- [ ] Add data lineage tracking

### Phase 3: Long-Term (6-12 months)
- [ ] Implement data governance (Atlas/OpenMetadata)
- [ ] Multi-region replication for disaster recovery
- [ ] Migrate to cloud-native big data (Databricks, BigQuery)
- [ ] Advanced analytics (ML pipeline for churn prediction, anomaly ML, etc.)

---

## 8. CONCLUSION

**VaultIQ correctly implements core big data concepts** (distributed logging, batch analytics, fallback resilience) for a small-scale educational platform. The architecture is **well-thought-out** and demonstrates understanding of:
- Event-driven architectures
- Distributed data processing
- Resilience and fallback patterns
- Analytics pipelines

However, **the implementation is not production-grade for scale** due to:
- Lack of streaming (real-time analytics)
- No data warehouse layer (ad-hoc queries)
- Missing schema validation and data quality
- Inefficient recomputation on every job run

**Recommendation:** This is **excellent work for a minor project**. The student demonstrates solid fundamentals. For production scale (100k+ DAU), a major refactor to include streaming, incremental processing, and a query layer would be necessary.

### Key Takeaway for Engineer:

> **You've built a correct foundation. Now learn the next layer: streaming architectures, data warehousing, and incremental processing. These are what separates "works for prototypes" from "works for production at scale."**

---

**Evaluated:** May 2, 2026  
**By:** Senior Big Data Engineer  
