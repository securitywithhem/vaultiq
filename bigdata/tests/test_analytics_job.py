"""
Tests for bigdata/analytics_job.py — the Spark job docker-compose mounts at
/opt/spark-jobs and run-spark-job.sh submits. Runs on local[*]; no HDFS needed.
Run: pytest bigdata/tests/test_analytics_job.py -v
"""

import json
import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from pyspark.sql import SparkSession  # noqa: E402
from pyspark.sql import functions as F  # noqa: E402

import analytics_job as job  # noqa: E402


@pytest.fixture(scope="module")
def spark():
    session = (
        SparkSession.builder
                    .master("local[1]")
                    .appName("VaultIQ-AnalyticsJob-Test")
                    .config("spark.sql.shuffle.partitions", "1")
                    .config("spark.sql.session.timeZone", "UTC")
                    .config("spark.ui.enabled", "false")
                    .getOrCreate()
    )
    session.sparkContext.setLogLevel("ERROR")
    yield session
    session.stop()


def _logger_event(event_type, user_id, ts, latency_ms=None, **metadata):
    """Event exactly as backend/utils/hdfsLogger.js writes it to HDFS."""
    return {
        "event_type": event_type,
        "user_id":    user_id,
        "file_id":    None,
        "latency_ms": latency_ms,
        "timestamp":  ts,
        "metadata": {
            "file_name":       metadata.get("file_name"),
            "file_size_bytes": metadata.get("file_size_bytes"),
            "file_type":       metadata.get("file_type"),
            "ai_verdict":      metadata.get("ai_verdict"),
            "ai_score":        metadata.get("ai_score"),
            "ip_address":      "127.0.0.1",
        },
    }


LOGGER_EVENTS = [
    _logger_event("file_upload",   "u1", "2026-03-01T09:00:00.000Z", 120, file_name="a.pdf", file_size_bytes=1000, file_type="pdf"),
    _logger_event("file_upload",   "u1", "2026-03-01T10:00:00.000Z", 140, file_name="b.pdf", file_size_bytes=2000, file_type="pdf"),
    _logger_event("file_upload",   "u2", "2026-03-02T08:00:00.000Z", 60,  file_name="c.csv", file_size_bytes=500,  file_type="csv"),
    _logger_event("file_download", "u2", "2026-03-02T09:00:00.000Z", 50,  file_name="a.pdf", file_type="pdf"),
    _logger_event("ai_detection",  "u1", "2026-03-01T11:00:00.000Z", 350, file_name="a.pdf", file_type="pdf", ai_verdict="AI-Generated", ai_score=0.9),
    _logger_event("ai_detection",  "u2", "2026-03-02T10:00:00.000Z", 250, file_name="c.csv", file_type="csv", ai_verdict="Human", ai_score=0.1),
    _logger_event("file_delete",   "u1", "2026-03-01T12:00:00.000Z", 20,  file_name="b.pdf", file_type="pdf"),
]

# Row as stored in the flat Supabase event_logs table (create_event_logs.sql)
FLAT_EVENT = {
    "event_type": "file_upload", "user_id": "u3", "file_name": "d.png",
    "file_size_bytes": 4000, "file_type": "png", "ai_verdict": None, "ai_score": None,
    "ip_address": "10.0.0.1", "duration_ms": 90, "timestamp": "2026-03-03T07:00:00+00:00",
    "metadata": {},
}


def _read(spark, events):
    """Load events the way the job does: JSON lines through spark.read.json."""
    lines = spark.sparkContext.parallelize([json.dumps(e) for e in events])
    return job.normalize_events(spark.read.json(lines))


@pytest.fixture(scope="module")
def df(spark):
    return _read(spark, LOGGER_EVENTS).cache()


# ── normalize_events ──────────────────────────────────────────────────────────

def test_normalize_flattens_logger_metadata(df):
    # Read the hour inside Spark (session TZ = UTC); collect() converts to local time
    row = (df.filter("event_type = 'file_upload' AND user_id = 'u2'")
             .withColumn("hour", F.hour("timestamp")).collect()[0])
    assert row["file_name"] == "c.csv"
    assert row["file_size_bytes"] == 500
    assert row["file_type"] == "csv"
    assert row["duration_ms"] == 60          # from latency_ms
    assert str(row["date"]) == "2026-03-02"
    assert row["hour"] == 8


def test_normalize_accepts_flat_supabase_rows(spark):
    row = _read(spark, [FLAT_EVENT]).collect()[0]
    assert row["file_size_bytes"] == 4000
    assert row["file_type"] == "png"
    assert row["duration_ms"] == 90
    assert str(row["date"]) == "2026-03-03"


def test_normalize_tolerates_missing_fields(spark):
    row = _read(spark, [{"event_type": "login", "user_id": "u9", "timestamp": "2026-03-04T07:00:00Z"}]).collect()[0]
    assert row["event_type"] == "login"
    assert row["file_size_bytes"] is None
    assert row["duration_ms"] is None


# ── analytics ─────────────────────────────────────────────────────────────────

def test_daily_activity(df):
    out = job.daily_activity(df)
    assert out["dates"] == ["2026-03-01", "2026-03-02"]
    assert out["uploads"] == [2, 1]
    assert out["downloads"] == [0, 1]
    assert out["detections"] == [1, 1]
    assert out["total_bytes_per_day"] == [3000, 500]


def test_storage_analytics(df):
    out = job.storage_analytics(df)
    assert out["top_uploaders"][0] == {"user_id": "u1", "total_bytes": 3000}
    by_type = {d["file_type"]: d for d in out["file_type_distribution"]}
    assert by_type["pdf"]["count"] == 2
    assert by_type["csv"]["total_bytes"] == 500


def test_ai_usage_stats(df):
    out = job.ai_usage_stats(df)
    assert out["verdict_counts"] == {"AI-Generated": 1, "Human": 1}
    assert out["avg_score_by_type"]["pdf"] == pytest.approx(0.9)


def test_latency_analysis(df):
    out = job.latency_analysis(df)
    assert out["avg_latency_by_type"]["file_upload"] == pytest.approx((120 + 140 + 60) / 3, rel=1e-3)
    assert len(out["busiest_hours"]) == 24
    assert sum(h["event_count"] for h in out["busiest_hours"]) == len(LOGGER_EVENTS)


def test_anomaly_detection_runs_without_spikes(df):
    out = job.anomaly_detection(df)
    assert out["suspicious_users"] == []
    assert isinstance(out["delete_spikes"], list)


def test_user_behaviour_sequences(df):
    out = job.user_behaviour(df)
    seqs = {s["user_id"]: s["sequence"] for s in out["common_sequences"]}
    assert seqs["u1"] == ["file_upload", "file_upload", "ai_detection", "file_delete"]
    assert out["returning_users_count"] == 0
