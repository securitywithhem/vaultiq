"""
Tests for bigdata/mapreduce_fallback.py analytics functions.
Run: pytest bigdata/tests/test_mapreduce_fallback.py -v
"""

import sys
import os
from datetime import datetime, timezone

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from mapreduce_fallback import (
    daily_activity_local,
    anomaly_detection_local,
    ai_usage_stats_local,
    storage_analytics_local,
    latency_analysis_local,
    user_behaviour_local,
)

# ── Fixture ────────────────────────────────────────────────────────────────────

SAMPLE_EVENTS = [
    # user_a — 3 uploads on day 1
    {"event_type": "file_upload",   "user_id": "user_a", "file_name": "doc1.pdf",  "file_size_bytes": 1_000_000, "file_type": "pdf",  "ai_verdict": None,           "ai_score": None,  "duration_ms": 120, "timestamp": "2026-03-01T09:00:00Z", "ip_address": "1.1.1.1", "metadata": {}},
    {"event_type": "file_upload",   "user_id": "user_a", "file_name": "doc2.pdf",  "file_size_bytes": 2_000_000, "file_type": "pdf",  "ai_verdict": None,           "ai_score": None,  "duration_ms": 140, "timestamp": "2026-03-01T10:00:00Z", "ip_address": "1.1.1.1", "metadata": {}},
    {"event_type": "file_upload",   "user_id": "user_a", "file_name": "img.png",   "file_size_bytes":   500_000, "file_type": "png",  "ai_verdict": None,           "ai_score": None,  "duration_ms": 80,  "timestamp": "2026-03-01T11:00:00Z", "ip_address": "1.1.1.1", "metadata": {}},

    # user_b — 2 uploads on day 2, 1 on day 3
    {"event_type": "file_upload",   "user_id": "user_b", "file_name": "report.docx","file_size_bytes": 3_000_000, "file_type": "docx","ai_verdict": None,           "ai_score": None,  "duration_ms": 200, "timestamp": "2026-03-02T08:00:00Z", "ip_address": "2.2.2.2", "metadata": {}},
    {"event_type": "file_upload",   "user_id": "user_b", "file_name": "data.csv",  "file_size_bytes":   750_000, "file_type": "csv", "ai_verdict": None,           "ai_score": None,  "duration_ms": 60,  "timestamp": "2026-03-02T09:00:00Z", "ip_address": "2.2.2.2", "metadata": {}},
    {"event_type": "file_upload",   "user_id": "user_b", "file_name": "notes.txt", "file_size_bytes":    10_000, "file_type": "txt", "ai_verdict": None,           "ai_score": None,  "duration_ms": 30,  "timestamp": "2026-03-03T14:00:00Z", "ip_address": "2.2.2.2", "metadata": {}},

    # downloads
    {"event_type": "file_download", "user_id": "user_a", "file_name": "doc1.pdf",  "file_size_bytes": None,      "file_type": "pdf",  "ai_verdict": None,           "ai_score": None,  "duration_ms": 50,  "timestamp": "2026-03-01T12:00:00Z", "ip_address": "1.1.1.1", "metadata": {}},
    {"event_type": "file_download", "user_id": "user_c", "file_name": "report.docx","file_size_bytes": None,     "file_type": "docx","ai_verdict": None,           "ai_score": None,  "duration_ms": 70,  "timestamp": "2026-03-02T15:00:00Z", "ip_address": "3.3.3.3", "metadata": {}},

    # ai_detection — 4 events, mixed verdicts
    {"event_type": "ai_detection",  "user_id": "user_a", "file_name": "doc1.pdf",  "file_size_bytes": None,      "file_type": "pdf",  "ai_verdict": "AI-Generated", "ai_score": 0.92,  "duration_ms": 350, "timestamp": "2026-03-01T13:00:00Z", "ip_address": "1.1.1.1", "metadata": {}},
    {"event_type": "ai_detection",  "user_id": "user_b", "file_name": "report.docx","file_size_bytes": None,     "file_type": "docx","ai_verdict": "Human",        "ai_score": 0.12,  "duration_ms": 280, "timestamp": "2026-03-02T10:00:00Z", "ip_address": "2.2.2.2", "metadata": {}},
    {"event_type": "ai_detection",  "user_id": "user_c", "file_name": "essay.pdf", "file_size_bytes": None,      "file_type": "pdf",  "ai_verdict": "Mixed",        "ai_score": 0.55,  "duration_ms": 310, "timestamp": "2026-03-03T11:00:00Z", "ip_address": "3.3.3.3", "metadata": {}},
    {"event_type": "ai_detection",  "user_id": "user_d", "file_name": "code.py",   "file_size_bytes": None,      "file_type": "py",   "ai_verdict": "AI-Generated", "ai_score": 0.88,  "duration_ms": 400, "timestamp": "2026-03-04T09:00:00Z", "ip_address": "4.4.4.4", "metadata": {}},

    # deletes (intentionally few — no spike)
    {"event_type": "file_delete",   "user_id": "user_a", "file_name": "old.pdf",   "file_size_bytes": None,      "file_type": "pdf",  "ai_verdict": None,           "ai_score": None,  "duration_ms": 20,  "timestamp": "2026-03-01T16:00:00Z", "ip_address": "1.1.1.1", "metadata": {}},
    {"event_type": "file_delete",   "user_id": "user_b", "file_name": "temp.csv",  "file_size_bytes": None,      "file_type": "csv",  "ai_verdict": None,           "ai_score": None,  "duration_ms": 15,  "timestamp": "2026-03-02T17:00:00Z", "ip_address": "2.2.2.2", "metadata": {}},

    # user_c and user_d — extra days so we can test returning users
    {"event_type": "file_upload",   "user_id": "user_c", "file_name": "img2.png",  "file_size_bytes":   200_000, "file_type": "png",  "ai_verdict": None,           "ai_score": None,  "duration_ms": 90,  "timestamp": "2026-03-05T08:00:00Z", "ip_address": "3.3.3.3", "metadata": {}},
    {"event_type": "file_upload",   "user_id": "user_c", "file_name": "img3.png",  "file_size_bytes":   300_000, "file_type": "png",  "ai_verdict": None,           "ai_score": None,  "duration_ms": 95,  "timestamp": "2026-03-06T08:00:00Z", "ip_address": "3.3.3.3", "metadata": {}},
    {"event_type": "file_upload",   "user_id": "user_c", "file_name": "img4.png",  "file_size_bytes":   400_000, "file_type": "png",  "ai_verdict": None,           "ai_score": None,  "duration_ms": 100, "timestamp": "2026-03-07T08:00:00Z", "ip_address": "3.3.3.3", "metadata": {}},
    {"event_type": "file_download", "user_id": "user_c", "file_name": "img4.png",  "file_size_bytes": None,      "file_type": "png",  "ai_verdict": None,           "ai_score": None,  "duration_ms": 40,  "timestamp": "2026-03-08T08:00:00Z", "ip_address": "3.3.3.3", "metadata": {}},

    # login event for variety
    {"event_type": "login",         "user_id": "user_d", "file_name": None,         "file_size_bytes": None,     "file_type": None,   "ai_verdict": None,           "ai_score": None,  "duration_ms": 25,  "timestamp": "2026-03-04T07:00:00Z", "ip_address": "4.4.4.4", "metadata": {}},
    {"event_type": "login",         "user_id": "user_a", "file_name": None,         "file_size_bytes": None,     "file_type": None,   "ai_verdict": None,           "ai_score": None,  "duration_ms": 22,  "timestamp": "2026-03-01T08:00:00Z", "ip_address": "1.1.1.1", "metadata": {}},
]


# ── Test 1: daily_activity_local ───────────────────────────────────────────────

def test_daily_activity_returns_required_keys():
    result = daily_activity_local(SAMPLE_EVENTS)
    for key in ("dates", "uploads", "downloads", "detections", "total_bytes_per_day"):
        assert key in result, f"Missing key: {key}"


def test_daily_activity_lists_are_same_length():
    result = daily_activity_local(SAMPLE_EVENTS)
    n = len(result["dates"])
    assert len(result["uploads"])             == n
    assert len(result["downloads"])           == n
    assert len(result["detections"])          == n
    assert len(result["total_bytes_per_day"]) == n


def test_daily_activity_upload_counts():
    result = daily_activity_local(SAMPLE_EVENTS)
    idx_2026_03_01 = result["dates"].index("2026-03-01")
    assert result["uploads"][idx_2026_03_01] == 3

    idx_2026_03_02 = result["dates"].index("2026-03-02")
    assert result["uploads"][idx_2026_03_02] == 2


# ── Test 2: ai_usage_stats_local ──────────────────────────────────────────────

def test_ai_usage_stats_verdict_counts():
    result = ai_usage_stats_local(SAMPLE_EVENTS)
    vc = result["verdict_counts"]
    assert vc.get("AI-Generated") == 2
    assert vc.get("Human")        == 1
    assert vc.get("Mixed")        == 1


def test_ai_usage_stats_structure():
    result = ai_usage_stats_local(SAMPLE_EVENTS)
    assert "verdict_counts"    in result
    assert "avg_score_by_type" in result
    assert "top_file_types"    in result


# ── Test 3: storage_analytics_local ───────────────────────────────────────────

def test_storage_top_uploaders_sorted_descending():
    result = storage_analytics_local(SAMPLE_EVENTS)
    uploaders = result["top_uploaders"]
    assert len(uploaders) > 0
    bytes_seq = [u["total_bytes"] for u in uploaders]
    assert bytes_seq == sorted(bytes_seq, reverse=True), "top_uploaders must be sorted by bytes DESC"


def test_storage_analytics_structure():
    result = storage_analytics_local(SAMPLE_EVENTS)
    assert "top_uploaders"          in result
    assert "file_type_distribution" in result


def test_storage_top_uploader_is_user_b():
    # user_b uploaded 3 000 000 + 750 000 + 10 000 = 3 760 000 bytes
    # user_a uploaded 1 000 000 + 2 000 000 + 500 000 = 3 500 000 bytes
    result = storage_analytics_local(SAMPLE_EVENTS)
    top_uid = result["top_uploaders"][0]["user_id"]
    assert top_uid == "user_b"


# ── Test 4: latency_analysis_local ────────────────────────────────────────────

def test_latency_busiest_hours_has_24_entries():
    result = latency_analysis_local(SAMPLE_EVENTS)
    assert len(result["busiest_hours"]) == 24


def test_latency_busiest_hours_covers_all_hours():
    result = latency_analysis_local(SAMPLE_EVENTS)
    hours = [entry["hour"] for entry in result["busiest_hours"]]
    assert hours == list(range(24)), "busiest_hours must have one entry per hour 0-23"


def test_latency_analysis_structure():
    result = latency_analysis_local(SAMPLE_EVENTS)
    assert "avg_latency_by_type" in result
    assert "p95_latency"         in result
    assert "busiest_hours"       in result


# ── Test 5: output structure matches frontend expectations ────────────────────

def test_all_six_top_level_keys_present():
    """Frontend expects these exact 6 keys plus generated_at."""
    results = {
        "generated_at":      datetime.now(timezone.utc).isoformat(),
        "daily_activity":    daily_activity_local(SAMPLE_EVENTS),
        "anomaly_detection": anomaly_detection_local(SAMPLE_EVENTS),
        "ai_usage_stats":    ai_usage_stats_local(SAMPLE_EVENTS),
        "storage_analytics": storage_analytics_local(SAMPLE_EVENTS),
        "latency_analysis":  latency_analysis_local(SAMPLE_EVENTS),
        "user_behaviour":    user_behaviour_local(SAMPLE_EVENTS),
    }

    expected_keys = {
        "generated_at",
        "daily_activity",
        "anomaly_detection",
        "ai_usage_stats",
        "storage_analytics",
        "latency_analysis",
        "user_behaviour",
    }
    assert set(results.keys()) == expected_keys


def test_user_behaviour_structure():
    result = user_behaviour_local(SAMPLE_EVENTS)
    assert "daily_active_users"    in result
    assert "returning_users_count" in result
    assert "common_sequences"      in result
    assert isinstance(result["returning_users_count"], int)


def test_anomaly_detection_structure():
    result = anomaly_detection_local(SAMPLE_EVENTS)
    assert "delete_spikes"    in result
    assert "suspicious_users" in result
    assert isinstance(result["delete_spikes"],    list)
    assert isinstance(result["suspicious_users"], list)
