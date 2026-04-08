"""
VaultIQ — Batch Analytics Job (Apache Spark)
Reads HDFS event logs and produces 6 analytics reports.
"""

from pyspark.sql import SparkSession
from pyspark.sql import functions as F
import json
import os
from datetime import datetime, timezone

HDFS_LOGS_PATH    = os.getenv('HDFS_LOGS_PATH',    'hdfs://localhost:9000/vaultiq/logs/')
HDFS_RESULTS_PATH = os.getenv('HDFS_RESULTS_PATH', 'hdfs://localhost:9000/vaultiq/results/')

spark = SparkSession.builder \
    .appName("VaultIQ-Analytics") \
    .config("spark.sql.session.timeZone", "UTC") \
    .getOrCreate()

spark.sparkContext.setLogLevel("WARN")


# ── Data Load ──────────────────────────────────────────────────────────────────

df = spark.read.json(HDFS_LOGS_PATH + "*/*")
df = df.withColumn("timestamp", F.to_timestamp("timestamp"))
df = df.withColumn("date", F.to_date("timestamp"))


# ── 1. Daily Activity ──────────────────────────────────────────────────────────

def daily_activity(df) -> dict:
    """Events per day per type + total bytes per day."""
    pivot = (
        df.groupBy("date", "event_type")
          .agg(F.count("*").alias("cnt"))
          .groupBy("date")
          .pivot("event_type", ["file_upload", "file_download", "ai_detection"])
          .agg(F.first("cnt"))
          .fillna(0)
          .orderBy("date")
    )

    bytes_per_day = (
        df.groupBy("date")
          .agg(F.sum("file_size_bytes").alias("total_bytes"))
          .orderBy("date")
    )

    pivot_rows  = pivot.collect()
    bytes_rows  = {str(r["date"]): (r["total_bytes"] or 0) for r in bytes_per_day.collect()}

    dates      = [str(r["date"]) for r in pivot_rows]
    uploads    = [int(r["file_upload"]   or 0) for r in pivot_rows]
    downloads  = [int(r["file_download"] or 0) for r in pivot_rows]
    detections = [int(r["ai_detection"]  or 0) for r in pivot_rows]
    total_bytes = [bytes_rows.get(d, 0) for d in dates]

    return {
        "dates":              dates,
        "uploads":            uploads,
        "downloads":          downloads,
        "detections":         detections,
        "total_bytes_per_day": total_bytes,
    }


# ── 2. Anomaly Detection ───────────────────────────────────────────────────────

def anomaly_detection(df) -> dict:
    """Flag delete spikes and suspicious high-volume users."""
    deletes = (
        df.filter(F.col("event_type") == "file_delete")
          .groupBy("date")
          .agg(F.count("*").alias("delete_count"))
    )

    stats = deletes.agg(
        F.mean("delete_count").alias("mean"),
        F.stddev("delete_count").alias("stddev")
    ).collect()[0]

    mean_val   = float(stats["mean"]   or 0)
    stddev_val = float(stats["stddev"] or 0)
    threshold  = mean_val + 2 * stddev_val

    spike_rows = deletes.filter(F.col("delete_count") > threshold).collect()
    delete_spikes = [
        {"date": str(r["date"]), "delete_count": int(r["delete_count"])}
        for r in spike_rows
    ]

    # Users with > 50 events in any single hour
    suspicious = (
        df.withColumn("hour_bucket", F.date_trunc("hour", F.col("timestamp")))
          .groupBy("user_id", "hour_bucket")
          .agg(F.count("*").alias("event_count"))
          .filter(F.col("event_count") > 50)
          .select("user_id", "hour_bucket", "event_count")
          .collect()
    )
    suspicious_users = [
        {
            "user_id":     r["user_id"],
            "hour":        str(r["hour_bucket"]),
            "event_count": int(r["event_count"]),
        }
        for r in suspicious
    ]

    return {
        "delete_spikes":    delete_spikes,
        "suspicious_users": suspicious_users,
    }


# ── 3. AI Usage Stats ─────────────────────────────────────────────────────────

def ai_usage_stats(df) -> dict:
    """Verdict distribution, avg score by file type, top detected types."""
    ai_df = df.filter(F.col("event_type") == "ai_detection")

    verdict_rows = (
        ai_df.groupBy("ai_verdict")
             .agg(F.count("*").alias("cnt"))
             .collect()
    )
    verdict_counts = {r["ai_verdict"]: int(r["cnt"]) for r in verdict_rows}

    score_rows = (
        ai_df.groupBy("file_type")
             .agg(F.avg("ai_score").alias("avg_score"))
             .orderBy("file_type")
             .collect()
    )
    avg_score_by_type = {r["file_type"]: round(float(r["avg_score"] or 0), 4) for r in score_rows}

    top_rows = (
        ai_df.groupBy("file_type")
             .agg(F.count("*").alias("cnt"))
             .orderBy(F.desc("cnt"))
             .limit(10)
             .collect()
    )
    top_file_types = [{"file_type": r["file_type"], "count": int(r["cnt"])} for r in top_rows]

    return {
        "verdict_counts":    verdict_counts,
        "avg_score_by_type": avg_score_by_type,
        "top_file_types":    top_file_types,
    }


# ── 4. Storage Analytics ──────────────────────────────────────────────────────

def storage_analytics(df) -> dict:
    """Top uploaders, file type distribution by count and bytes."""
    upload_df = df.filter(F.col("event_type") == "file_upload")

    uploader_rows = (
        upload_df.groupBy("user_id")
                 .agg(F.sum("file_size_bytes").alias("total_bytes"))
                 .orderBy(F.desc("total_bytes"))
                 .limit(10)
                 .collect()
    )
    top_uploaders = [
        {"user_id": r["user_id"], "total_bytes": int(r["total_bytes"] or 0)}
        for r in uploader_rows
    ]

    dist_rows = (
        upload_df.groupBy("file_type")
                 .agg(
                     F.count("*").alias("count"),
                     F.sum("file_size_bytes").alias("total_bytes"),
                     F.avg("file_size_bytes").alias("avg_bytes"),
                 )
                 .orderBy(F.desc("total_bytes"))
                 .collect()
    )
    file_type_distribution = [
        {
            "file_type":  r["file_type"],
            "count":      int(r["count"]),
            "total_bytes": int(r["total_bytes"] or 0),
            "avg_bytes":   round(float(r["avg_bytes"] or 0), 2),
        }
        for r in dist_rows
    ]

    return {
        "top_uploaders":         top_uploaders,
        "file_type_distribution": file_type_distribution,
    }


# ── 5. Latency Analysis ───────────────────────────────────────────────────────

def latency_analysis(df) -> dict:
    """Avg + p95 latency per event type; busiest hours."""
    lat_df = df.filter(F.col("duration_ms").isNotNull())

    avg_rows = (
        lat_df.groupBy("event_type")
              .agg(F.avg("duration_ms").alias("avg_ms"))
              .collect()
    )
    avg_latency_by_type = {r["event_type"]: round(float(r["avg_ms"]), 2) for r in avg_rows}

    event_types = [r["event_type"] for r in avg_rows]
    p95_latency = {}
    for et in event_types:
        subset = lat_df.filter(F.col("event_type") == et).select("duration_ms")
        q = subset.stat.approxQuantile("duration_ms", [0.95], 0.01)
        p95_latency[et] = round(q[0], 2) if q else 0.0

    hour_rows = (
        df.withColumn("hour", F.hour("timestamp"))
          .groupBy("hour")
          .agg(F.count("*").alias("event_count"))
          .orderBy("hour")
          .collect()
    )
    hour_map = {r["hour"]: int(r["event_count"]) for r in hour_rows}
    busiest_hours = [
        {"hour": h, "event_count": hour_map.get(h, 0)}
        for h in range(24)
    ]

    return {
        "avg_latency_by_type": avg_latency_by_type,
        "p95_latency":         p95_latency,
        "busiest_hours":       busiest_hours,
    }


# ── 6. User Behaviour ─────────────────────────────────────────────────────────

def user_behaviour(df) -> dict:
    """DAU (last 30 days), returning users, common event sequences."""
    from pyspark.sql.window import Window

    last30 = df.filter(
        F.col("date") >= F.date_sub(F.current_date(), 30)
    )

    dau_rows = (
        last30.groupBy("date")
              .agg(F.countDistinct("user_id").alias("active_users"))
              .orderBy("date")
              .collect()
    )
    daily_active_users = [
        {"date": str(r["date"]), "active_users": int(r["active_users"])}
        for r in dau_rows
    ]

    returning = (
        df.groupBy("user_id")
          .agg(F.countDistinct("date").alias("active_days"))
          .filter(F.col("active_days") > 3)
          .count()
    )

    w = Window.partitionBy("user_id").orderBy("timestamp")
    seq_df = (
        df.withColumn("rn", F.row_number().over(w))
          .filter(F.col("rn") <= 5)
          .groupBy("user_id")
          .agg(F.collect_list("event_type").alias("sequence"))
    )
    seq_rows = seq_df.limit(50).collect()
    common_sequences = [
        {"user_id": r["user_id"], "sequence": r["sequence"]}
        for r in seq_rows
    ]

    return {
        "daily_active_users":   daily_active_users,
        "returning_users_count": int(returning),
        "common_sequences":     common_sequences,
    }


# ── Save Results ──────────────────────────────────────────────────────────────

results = {
    "generated_at":     datetime.now(timezone.utc).isoformat(),
    "daily_activity":   daily_activity(df),
    "anomaly_detection": anomaly_detection(df),
    "ai_usage_stats":   ai_usage_stats(df),
    "storage_analytics": storage_analytics(df),
    "latency_analysis": latency_analysis(df),
    "user_behaviour":   user_behaviour(df),
}

results_json = json.dumps(results, indent=2)

# Write to HDFS via Spark
rdd = spark.sparkContext.parallelize([results_json], 1)
hdfs_out = HDFS_RESULTS_PATH + "analytics_latest.json"
rdd.saveAsTextFile(hdfs_out)
print(f"[analytics_job] Wrote results to HDFS: {hdfs_out}")

# Write local copy
local_dir = os.path.join(os.path.dirname(__file__), "results")
os.makedirs(local_dir, exist_ok=True)
local_path = os.path.join(local_dir, "analytics_latest.json")
with open(local_path, "w") as f:
    f.write(results_json)
print(f"[analytics_job] Wrote local copy: {local_path}")

spark.stop()
print("Analytics job complete.")
