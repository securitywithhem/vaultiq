"""
VaultIQ — PySpark Analytics Unit Tests
=======================================
Tests each of the 7 analytic functions in analytics_job.py against a small
in-memory DataFrame.  No HDFS or live Spark cluster required — runs entirely
on local[*].

Run with:
    pip install pyspark pytest
    pytest backend/tests/test_spark_job.py -v
"""

import os
import sys
import pytest

# ── Make analytics_job importable from the spark-jobs directory ───────────────
_SPARK_JOBS_DIR = os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    "..", "scripts", "spark-jobs",
)
sys.path.insert(0, _SPARK_JOBS_DIR)

from analytics_job import (          # noqa: E402
    compute_daily_trend,
    compute_top_files,
    compute_user_storage,
    compute_event_breakdown,
    compute_hourly_pattern,
    compute_platform_totals,
    compute_anomalies,
)

from pyspark.sql import SparkSession
from pyspark.sql.types import (
    LongType, StringType, StructField, StructType,
)


# ─── Session-scoped SparkSession fixture ─────────────────────────────────────

@pytest.fixture(scope="session")
def spark():
    session = (
        SparkSession.builder
                    .master("local[*]")
                    .appName("VaultIQ-Test")
                    # Keep the shuffle partition count tiny for speed
                    .config("spark.sql.shuffle.partitions", "1")
                    # Silence Spark's verbose INFO logs during tests
                    .config("spark.driver.extraJavaOptions", "-Dlog4j.logLevel=WARN")
                    .getOrCreate()
    )
    session.sparkContext.setLogLevel("WARN")
    yield session
    session.stop()


# ─── Shared mock schema & data ────────────────────────────────────────────────

LOG_SCHEMA = StructType([
    StructField("event",     StringType(), True),
    StructField("user_id",   StringType(), True),
    StructField("filename",  StringType(), True),
    StructField("file_size", LongType(),   True),
    StructField("timestamp", LongType(),   True),
    StructField("ip",        StringType(), True),
])

# 10 regular daytime events (April 5 2024, hours 14-23 UTC)
# Plus 7 off-hours events for user-1 on April 6 to trigger the anomaly detector.
# Timestamps are millisecond epochs.
#   1712325600000 = 2024-04-05 14:00:00 UTC
#   1712329200000 = 2024-04-05 15:00:00 UTC  … etc.
#   Off-hours (hour >= 22 or hour <= 6):
#   1712358000000 = 2024-04-05 23:00:00 UTC
#   1712361600000 = 2024-04-06 00:00:00 UTC  … etc.

MOCK_ROWS = [
    # event       user_id   filename     file_size  timestamp          ip
    ("upload",   "user-1", "doc1.pdf",  1_024,  1_712_325_600_000, "127.0.0.1"),
    ("upload",   "user-1", "doc2.pdf",  2_048,  1_712_329_200_000, "127.0.0.1"),
    ("download", "user-2", "doc1.pdf",  1_024,  1_712_332_800_000, "192.168.1.1"),
    ("download", "user-1", "doc1.pdf",  1_024,  1_712_336_400_000, "127.0.0.1"),
    ("delete",   "user-1", "doc2.pdf",  2_048,  1_712_340_000_000, "127.0.0.1"),
    ("upload",   "user-2", "doc3.pdf",    512,  1_712_343_600_000, "192.168.1.1"),
    ("download", "user-2", "doc3.pdf",    512,  1_712_347_200_000, "192.168.1.1"),
    ("upload",   "user-3", "doc4.pdf",  4_096,  1_712_350_800_000, "10.0.0.1"),
    ("download", "user-3", "doc4.pdf",  4_096,  1_712_354_400_000, "10.0.0.1"),
    ("upload",   "user-2", "doc5.pdf",  2_048,  1_712_358_000_000, "192.168.1.1"),
    # --- off-hours events for user-1 on 2024-04-06 (hour 00-03) -----
    ("upload",   "user-1", "late1.pdf", 512,  1_712_361_600_000, "127.0.0.1"),  # 00:00
    ("upload",   "user-1", "late2.pdf", 512,  1_712_363_400_000, "127.0.0.1"),  # 00:30
    ("download", "user-1", "late1.pdf", 512,  1_712_365_200_000, "127.0.0.1"),  # 01:00
    ("upload",   "user-1", "late3.pdf", 512,  1_712_367_000_000, "127.0.0.1"),  # 01:30
    ("download", "user-1", "late2.pdf", 512,  1_712_368_800_000, "127.0.0.1"),  # 02:00
    ("delete",   "user-1", "late3.pdf", 512,  1_712_370_600_000, "127.0.0.1"),  # 02:30
    ("upload",   "user-1", "late4.pdf", 512,  1_712_372_400_000, "127.0.0.1"),  # 03:00
]


@pytest.fixture(scope="session")
def log_df(spark):
    return spark.createDataFrame(MOCK_ROWS, schema=LOG_SCHEMA)


# ─── Helpers ──────────────────────────────────────────────────────────────────

def col_names(df) -> set[str]:
    return set(df.schema.fieldNames())


# ─── Tests ────────────────────────────────────────────────────────────────────

class TestDailyTrend:
    def test_schema(self, log_df):
        result = compute_daily_trend(log_df)
        assert col_names(result) == {"date", "uploads"}

    def test_only_uploads(self, log_df):
        result = compute_daily_trend(log_df)
        total  = result.agg({"uploads": "sum"}).collect()[0][0]
        upload_count = log_df.filter(log_df.event == "upload").count()
        assert total == upload_count

    def test_ordered_ascending(self, log_df):
        rows  = compute_daily_trend(log_df).collect()
        dates = [str(r["date"]) for r in rows]
        assert dates == sorted(dates)


class TestTopFiles:
    def test_schema(self, log_df):
        result = compute_top_files(log_df)
        assert col_names(result) == {"filename", "downloads"}

    def test_max_10_rows(self, log_df):
        result = compute_top_files(log_df)
        assert result.count() <= 10

    def test_only_downloads(self, log_df):
        result    = compute_top_files(log_df)
        total_dl  = result.agg({"downloads": "sum"}).collect()[0][0]
        actual_dl = log_df.filter(log_df.event == "download").count()
        assert total_dl == actual_dl

    def test_ordered_descending(self, log_df):
        rows   = compute_top_files(log_df).collect()
        counts = [r["downloads"] for r in rows]
        assert counts == sorted(counts, reverse=True)


class TestUserStorage:
    def test_schema(self, log_df):
        result = compute_user_storage(log_df)
        assert col_names(result) == {"user_id", "total_bytes", "file_count"}

    def test_total_bytes_non_negative(self, log_df):
        result = compute_user_storage(log_df)
        for row in result.collect():
            assert row["total_bytes"] >= 0

    def test_file_count_matches_uploads(self, log_df):
        result       = compute_user_storage(log_df)
        summed_count = result.agg({"file_count": "sum"}).collect()[0][0]
        actual       = log_df.filter(log_df.event == "upload").count()
        assert summed_count == actual


class TestEventBreakdown:
    def test_schema(self, log_df):
        result = compute_event_breakdown(log_df)
        assert col_names(result) == {"event", "count"}

    def test_total_matches_all_rows(self, log_df):
        result      = compute_event_breakdown(log_df)
        total_count = result.agg({"count": "sum"}).collect()[0][0]
        assert total_count == log_df.count()

    def test_all_event_types_present(self, log_df):
        result  = compute_event_breakdown(log_df)
        events  = {r["event"] for r in result.collect()}
        assert {"upload", "download", "delete"}.issubset(events)


class TestHourlyPattern:
    def test_schema(self, log_df):
        result = compute_hourly_pattern(log_df)
        assert col_names(result) == {"hour", "events"}

    def test_hours_in_valid_range(self, log_df):
        result = compute_hourly_pattern(log_df)
        for row in result.collect():
            assert 0 <= row["hour"] <= 23

    def test_ordered_ascending(self, log_df):
        rows  = compute_hourly_pattern(log_df).collect()
        hours = [r["hour"] for r in rows]
        assert hours == sorted(hours)

    def test_total_matches_all_rows(self, log_df):
        result = compute_hourly_pattern(log_df)
        total  = result.agg({"events": "sum"}).collect()[0][0]
        assert total == log_df.count()


class TestPlatformTotals:
    def test_schema(self, log_df):
        result = compute_platform_totals(log_df)
        assert col_names(result) == {
            "total_events", "active_users", "total_bytes_uploaded"
        }

    def test_single_row(self, log_df):
        result = compute_platform_totals(log_df)
        assert result.count() == 1

    def test_total_events(self, log_df):
        row = compute_platform_totals(log_df).collect()[0]
        assert row["total_events"] == log_df.count()

    def test_active_users(self, log_df):
        from pyspark.sql.functions import countDistinct
        expected = log_df.agg(countDistinct("user_id")).collect()[0][0]
        row      = compute_platform_totals(log_df).collect()[0]
        assert row["active_users"] == expected

    def test_total_bytes_uploaded_non_negative(self, log_df):
        row = compute_platform_totals(log_df).collect()[0]
        assert row["total_bytes_uploaded"] >= 0


class TestAnomalies:
    def test_schema(self, log_df):
        result = compute_anomalies(log_df)
        assert col_names(result) == {"user_id", "date", "off_hours_events"}

    def test_user1_flagged(self, log_df):
        """user-1 has 7 off-hours events on 2024-04-06, should be flagged."""
        result = compute_anomalies(log_df)
        rows   = result.collect()
        flagged_users = {r["user_id"] for r in rows}
        assert "user-1" in flagged_users

    def test_off_hours_events_above_threshold(self, log_df):
        result = compute_anomalies(log_df)
        for row in result.collect():
            assert row["off_hours_events"] > 5
