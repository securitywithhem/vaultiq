"""
VaultIQ — MapReduce Fallback Analytics
Runs when Spark is unavailable. Reads from Supabase event_logs table
and produces the same output structure as analytics_job.py.
"""

import os
import json
import requests
from datetime import datetime, timezone
from collections import defaultdict, Counter

SUPABASE_URL = os.getenv('SUPABASE_URL')
SUPABASE_KEY = os.getenv('SUPABASE_SERVICE_KEY')


# ── Data Fetch ─────────────────────────────────────────────────────────────────

def fetch_all_events() -> list:
    """Fetch up to 50 000 events from Supabase, ordered by timestamp asc."""
    if not SUPABASE_URL or not SUPABASE_KEY:
        raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_KEY env vars are required")

    resp = requests.get(
        f"{SUPABASE_URL}/rest/v1/event_logs",
        params={"select": "*", "order": "timestamp.asc", "limit": 50000},
        headers={
            "apikey": SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
        },
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()


# ── Helpers ────────────────────────────────────────────────────────────────────

def _date(ts: str) -> str:
    """Return YYYY-MM-DD from an ISO timestamp string."""
    return ts[:10] if ts else ""


def _hour(ts: str) -> int:
    """Return hour (0-23) from an ISO timestamp string."""
    try:
        return int(ts[11:13])
    except Exception:
        return 0


# ── 1. Daily Activity ──────────────────────────────────────────────────────────

def daily_activity_local(events: list) -> dict:
    uploads_by_day    = Counter()
    downloads_by_day  = Counter()
    detections_by_day = Counter()
    bytes_by_day      = defaultdict(int)

    for e in events:
        d  = _date(e.get("timestamp", ""))
        et = e.get("event_type", "")
        if et == "file_upload":
            uploads_by_day[d] += 1
            bytes_by_day[d] += e.get("file_size_bytes") or 0
        elif et == "file_download":
            downloads_by_day[d] += 1
        elif et == "ai_detection":
            detections_by_day[d] += 1

    all_dates = sorted(
        set(uploads_by_day) | set(downloads_by_day) | set(detections_by_day) | set(bytes_by_day)
    )

    return {
        "dates":               all_dates,
        "uploads":             [uploads_by_day[d]    for d in all_dates],
        "downloads":           [downloads_by_day[d]  for d in all_dates],
        "detections":          [detections_by_day[d] for d in all_dates],
        "total_bytes_per_day": [bytes_by_day[d]       for d in all_dates],
    }


# ── 2. Anomaly Detection ───────────────────────────────────────────────────────

def anomaly_detection_local(events: list) -> dict:
    delete_counts = Counter()
    for e in events:
        if e.get("event_type") == "file_delete":
            delete_counts[_date(e.get("timestamp", ""))] += 1

    counts = list(delete_counts.values())
    if counts:
        mean_val   = sum(counts) / len(counts)
        variance   = sum((x - mean_val) ** 2 for x in counts) / len(counts)
        stddev_val = variance ** 0.5
        threshold  = mean_val + 2 * stddev_val
    else:
        mean_val = stddev_val = threshold = 0.0

    delete_spikes = [
        {"date": d, "delete_count": c}
        for d, c in sorted(delete_counts.items())
        if c > threshold
    ]

    # Users with > 50 events in any single hour
    user_hour_counts = Counter()
    for e in events:
        uid = e.get("user_id", "")
        ts  = e.get("timestamp", "")
        if uid and ts:
            bucket = ts[:13]  # YYYY-MM-DDTHH
            user_hour_counts[(uid, bucket)] += 1

    suspicious_users = [
        {"user_id": uid, "hour": bucket.replace("T", " ") + ":00", "event_count": cnt}
        for (uid, bucket), cnt in user_hour_counts.items()
        if cnt > 50
    ]

    return {
        "delete_spikes":    delete_spikes,
        "suspicious_users": suspicious_users,
    }


# ── 3. AI Usage Stats ─────────────────────────────────────────────────────────

def ai_usage_stats_local(events: list) -> dict:
    verdict_counts    = Counter()
    score_by_type     = defaultdict(list)
    file_type_counter = Counter()

    for e in events:
        if e.get("event_type") != "ai_detection":
            continue
        verdict = e.get("ai_verdict") or "Unknown"
        ft      = e.get("file_type") or "unknown"
        score   = e.get("ai_score")

        verdict_counts[verdict] += 1
        if score is not None:
            score_by_type[ft].append(float(score))
        file_type_counter[ft] += 1

    avg_score_by_type = {
        ft: round(sum(scores) / len(scores), 4)
        for ft, scores in score_by_type.items()
    }

    top_file_types = [
        {"file_type": ft, "count": cnt}
        for ft, cnt in file_type_counter.most_common(10)
    ]

    return {
        "verdict_counts":    dict(verdict_counts),
        "avg_score_by_type": avg_score_by_type,
        "top_file_types":    top_file_types,
    }


# ── 4. Storage Analytics ──────────────────────────────────────────────────────

def storage_analytics_local(events: list) -> dict:
    user_bytes        = defaultdict(int)
    type_count        = Counter()
    type_bytes        = defaultdict(int)

    for e in events:
        if e.get("event_type") != "file_upload":
            continue
        uid   = e.get("user_id") or "unknown"
        ft    = e.get("file_type") or "unknown"
        size  = e.get("file_size_bytes") or 0
        user_bytes[uid]  += size
        type_count[ft]   += 1
        type_bytes[ft]   += size

    top_uploaders = [
        {"user_id": uid, "total_bytes": b}
        for uid, b in sorted(user_bytes.items(), key=lambda x: -x[1])[:10]
    ]

    all_types = set(type_count) | set(type_bytes)
    file_type_distribution = sorted(
        [
            {
                "file_type":   ft,
                "count":       type_count[ft],
                "total_bytes": type_bytes[ft],
                "avg_bytes":   round(type_bytes[ft] / type_count[ft], 2) if type_count[ft] else 0.0,
            }
            for ft in all_types
        ],
        key=lambda x: -x["total_bytes"],
    )

    return {
        "top_uploaders":          top_uploaders,
        "file_type_distribution": file_type_distribution,
    }


# ── 5. Latency Analysis ───────────────────────────────────────────────────────

def latency_analysis_local(events: list) -> dict:
    latency_by_type = defaultdict(list)
    hour_counts     = Counter()

    for e in events:
        dur = e.get("duration_ms")
        et  = e.get("event_type") or "unknown"
        ts  = e.get("timestamp", "")
        if dur is not None:
            latency_by_type[et].append(float(dur))
        if ts:
            hour_counts[_hour(ts)] += 1

    avg_latency_by_type = {
        et: round(sum(vals) / len(vals), 2)
        for et, vals in latency_by_type.items()
    }

    p95_latency = {}
    for et, vals in latency_by_type.items():
        sorted_vals = sorted(vals)
        idx = max(0, int(len(sorted_vals) * 0.95) - 1)
        p95_latency[et] = round(sorted_vals[idx], 2)

    busiest_hours = [
        {"hour": h, "event_count": hour_counts.get(h, 0)}
        for h in range(24)
    ]

    return {
        "avg_latency_by_type": avg_latency_by_type,
        "p95_latency":         p95_latency,
        "busiest_hours":       busiest_hours,
    }


# ── 6. User Behaviour ─────────────────────────────────────────────────────────

def user_behaviour_local(events: list) -> dict:
    from datetime import date, timedelta

    cutoff = (datetime.now(timezone.utc).date() - timedelta(days=30)).isoformat()

    # DAU: distinct users per day (last 30 days)
    dau_users = defaultdict(set)
    user_days  = defaultdict(set)
    user_events = defaultdict(list)  # (timestamp, event_type) pairs

    for e in events:
        ts  = e.get("timestamp", "")
        uid = e.get("user_id") or "unknown"
        et  = e.get("event_type") or "unknown"
        d   = _date(ts)
        if d and d >= cutoff:
            dau_users[d].add(uid)
        if d:
            user_days[uid].add(d)
        user_events[uid].append((ts, et))

    daily_active_users = [
        {"date": d, "active_users": len(users)}
        for d, users in sorted(dau_users.items())
    ]

    returning_users_count = sum(
        1 for days in user_days.values() if len(days) > 3
    )

    # First 5 events per user ordered by timestamp
    common_sequences = []
    for uid, pairs in list(user_events.items())[:50]:
        seq = [et for _, et in sorted(pairs)[:5]]
        common_sequences.append({"user_id": uid, "sequence": seq})

    return {
        "daily_active_users":    daily_active_users,
        "returning_users_count": returning_users_count,
        "common_sequences":      common_sequences,
    }


# ── Main ───────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    print("[mapreduce_fallback] Fetching events from Supabase...")
    events = fetch_all_events()
    print(f"[mapreduce_fallback] Fetched {len(events)} events")

    results = {
        "generated_at":      datetime.now(timezone.utc).isoformat(),
        "daily_activity":    daily_activity_local(events),
        "anomaly_detection": anomaly_detection_local(events),
        "ai_usage_stats":    ai_usage_stats_local(events),
        "storage_analytics": storage_analytics_local(events),
        "latency_analysis":  latency_analysis_local(events),
        "user_behaviour":    user_behaviour_local(events),
    }

    out_dir = os.path.join(os.path.dirname(__file__), "results")
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, "analytics_latest.json")
    with open(out_path, "w") as f:
        json.dump(results, f, indent=2)

    print(f"[mapreduce_fallback] Results written to {out_path}")
    print("Analytics job complete.")
