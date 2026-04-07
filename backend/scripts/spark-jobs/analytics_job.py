"""
VaultIQ — PySpark Analytics Job (Phase 2)
==========================================
Reads all event logs from HDFS, computes 7 analytics, and writes
each result back to HDFS as a single JSON part-file.

Usage
-----
  # Inside Docker (Spark master must reach HDFS namenode):
  docker exec spark-master spark-submit \\
      --master local[*] \\
      /opt/spark-jobs/analytics_job.py

  # Override the HDFS address:
  HDFS_URI=hdfs://namenode:9000 spark-submit ...

Environment variables
---------------------
  HDFS_URI   Base HDFS address.  Default: hdfs://localhost:9000
"""

import os
import sys
import logging

from pyspark.sql import SparkSession, DataFrame
from pyspark.sql import functions as F
from pyspark.sql.types import LongType

# ─── Logging ──────────────────────────────────────────────────────────────────
logging.basicConfig(level=logging.INFO, format="[%(levelname)s] %(message)s")
log = logging.getLogger(__name__)

# ─── Paths ────────────────────────────────────────────────────────────────────
HDFS_URI     = os.getenv("HDFS_URI", "hdfs://localhost:9000")
LOG_GLOB     = f"{HDFS_URI}/vaultiq/logs/*.json"
RESULTS_BASE = f"{HDFS_URI}/vaultiq/results"


# ─── Column helpers ───────────────────────────────────────────────────────────

def _as_timestamp(col_name: str = "timestamp"):
    """
    Convert a millisecond-epoch column to Spark TimestampType.

    Logs store epoch-milliseconds (e.g. Date.now() in JS).
    from_unixtime() requires seconds, so we divide by 1000 first.
    Handles both LongType and StringType source columns.
    """
    ms      = F.col(col_name).cast(LongType())              # null-safe cast
    sec_col = (ms / 1000).cast(LongType())                  # truncate to integer seconds
    return F.to_timestamp(F.from_unixtime(sec_col))         # → TimestampType


def _safe_size():
    """Coerce file_size to bigint, replacing NULL with 0."""
    return F.coalesce(F.col("file_size").cast("bigint"), F.lit(0))


# ─── Analytics ────────────────────────────────────────────────────────────────

def compute_daily_trend(df: DataFrame) -> DataFrame:
    """
    ANALYTIC 1 — daily_trend
    Uploads grouped by calendar day, ordered ascending.

    Output schema:
        date     date
        uploads  long
    """
    return (
        df.filter(F.col("event") == "upload")
          .withColumn("date", F.to_date(_as_timestamp()))
          .groupBy("date")
          .agg(F.count("*").alias("uploads"))
          .orderBy("date")
    )


def compute_top_files(df: DataFrame) -> DataFrame:
    """
    ANALYTIC 2 — top_files
    Top 10 most-downloaded filenames.

    Output schema:
        filename   string
        downloads  long
    """
    return (
        df.filter(F.col("event") == "download")
          .groupBy("filename")
          .agg(F.count("*").alias("downloads"))
          .orderBy(F.col("downloads").desc())
          .limit(10)
    )


def compute_user_storage(df: DataFrame) -> DataFrame:
    """
    ANALYTIC 3 — user_storage
    Bytes uploaded and file count per user (upload events only).

    Output schema:
        user_id      string
        total_bytes  long
        file_count   long
    """
    return (
        df.filter(F.col("event") == "upload")
          .groupBy("user_id")
          .agg(
              F.sum(_safe_size()).alias("total_bytes"),
              F.count("*").alias("file_count"),
          )
    )


def compute_event_breakdown(df: DataFrame) -> DataFrame:
    """
    ANALYTIC 4 — event_breakdown
    Row count for every distinct event type.

    Output schema:
        event  string
        count  long
    """
    return (
        df.groupBy("event")
          .agg(F.count("*").alias("count"))
    )


def compute_hourly_pattern(df: DataFrame) -> DataFrame:
    """
    ANALYTIC 5 — hourly_pattern
    Total events per hour-of-day (0–23), ordered ascending.

    Output schema:
        hour    int
        events  long
    """
    return (
        df.withColumn("hour", F.hour(_as_timestamp()))
          .groupBy("hour")
          .agg(F.count("*").alias("events"))
          .orderBy("hour")
    )


def compute_platform_totals(df: DataFrame) -> DataFrame:
    """
    ANALYTIC 6 — platform_totals
    Single-row platform-wide summary.

    Output schema:
        total_events         long
        active_users         long
        total_bytes_uploaded long
    """
    upload_bytes = F.when(
        F.col("event") == "upload", _safe_size()
    ).otherwise(F.lit(0))

    return df.agg(
        F.count("*").alias("total_events"),
        F.countDistinct("user_id").alias("active_users"),
        F.sum(upload_bytes).alias("total_bytes_uploaded"),
    )


def compute_anomalies(df: DataFrame) -> DataFrame:
    """
    ANALYTIC 7 — anomalies
    Users who perform more than 5 events during off-hours (22:00–06:00)
    within a single calendar day — potential suspicious activity.

    Output schema:
        user_id           string
        date              date
        off_hours_events  long
    """
    ts = _as_timestamp()
    return (
        df.withColumn("hour", F.hour(ts))
          .withColumn("date", F.to_date(ts))
          .filter((F.col("hour") >= 22) | (F.col("hour") <= 6))
          .groupBy("user_id", "date")
          .agg(F.count("*").alias("off_hours_events"))
          .filter(F.col("off_hours_events") > 5)
    )


# ─── Write helper ─────────────────────────────────────────────────────────────

def write_result(result_df: DataFrame, name: str) -> None:
    """
    Write a result DataFrame to HDFS as a single JSON file.

    coalesce(1) merges all partitions into one part-file so downstream
    consumers don't have to glob.  mode("overwrite") makes the job
    idempotent — safe to re-run without manual cleanup.
    """
    path = f"{RESULTS_BASE}/{name}"
    result_df.coalesce(1).write.mode("overwrite").json(path)
    log.info("Wrote %-20s → %s", name, path)


# ─── Core pipeline ────────────────────────────────────────────────────────────

def run(spark: SparkSession) -> None:
    log.info("Reading logs from: %s", LOG_GLOB)

    # ── Read ──────────────────────────────────────────────────────────────────
    # multiLine=false: each line is a complete JSON object (our write pattern).
    raw = (
        spark.read
             .option("multiLine", "false")
             .json(LOG_GLOB)
    )

    # Guard: nothing to process
    if raw.rdd.isEmpty():
        log.warning("No log files found at %s — exiting cleanly.", LOG_GLOB)
        sys.exit(0)

    # Normalise: cast timestamp to LongType regardless of what Spark inferred
    # (Spark may infer it as string if leading zeros or mixed types exist).
    df = raw.withColumn("timestamp", F.col("timestamp").cast(LongType()))

    total = df.count()
    log.info("Loaded %d log events.", total)

    # ── Execute all 7 analytics ───────────────────────────────────────────────
    write_result(compute_daily_trend(df),     "daily_trend")
    write_result(compute_top_files(df),       "top_files")
    write_result(compute_user_storage(df),    "user_storage")
    write_result(compute_event_breakdown(df), "event_breakdown")
    write_result(compute_hourly_pattern(df),  "hourly_pattern")
    write_result(compute_platform_totals(df), "platform_totals")
    write_result(compute_anomalies(df),       "anomalies")

    print("SUCCESS: analytics_job complete")


# ─── Entry point ──────────────────────────────────────────────────────────────

def main() -> None:
    spark = (
        SparkSession.builder
                    .appName("VaultIQ-Analytics")
                    # Keep shuffle partitions low for a single-node dev cluster;
                    # increase for production (e.g. 200 for large datasets).
                    .config("spark.sql.shuffle.partitions", "8")
                    .getOrCreate()
    )
    # Suppress verbose Spark INFO spam — our own log lines remain visible.
    spark.sparkContext.setLogLevel("WARN")

    try:
        run(spark)
    finally:
        spark.stop()


if __name__ == "__main__":
    main()
