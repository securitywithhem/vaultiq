"""
VaultIQ — Python MapReduce-style Analytics Fallback
====================================================
Used when Spark is not running.  Reads all event logs from the
Supabase `event_logs` table, computes the same 7 analytics as the
PySpark job using plain Python dicts/Counters, and writes each result
to  backend/analytics_cache/{name}.json.

Dependencies
------------
    pip install supabase python-dotenv

Usage
-----
    python scripts/process_logs.py
"""

import json
import logging
import os
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv
from supabase import Client, create_client

# ─── Bootstrap ────────────────────────────────────────────────────────────────
logging.basicConfig(level=logging.INFO, format="[%(levelname)s] %(message)s")
log = logging.getLogger(__name__)

_THIS_DIR  = Path(__file__).parent
_CACHE_DIR = _THIS_DIR.parent / "analytics_cache"

load_dotenv(_THIS_DIR.parent / ".env")

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")

if not SUPABASE_URL or not SUPABASE_KEY:
    log.error("SUPABASE_URL and SUPABASE_SERVICE_KEY must be set.")
    sys.exit(1)


# ─── Fetch ────────────────────────────────────────────────────────────────────

def fetch_all_logs(client: Client) -> list[dict]:
    """
    Page through the entire event_logs table and return a flat list
    of normalised event dicts.

    Each row's top-level columns take precedence; the embedded `payload`
    JSON is used as fallback for fields (especially `timestamp`) that
    are not promoted to top-level columns in the DB schema.
    """
    logs: list[dict] = []
    page_size        = 1000
    offset           = 0

    while True:
        resp = (
            client.table("event_logs")
                  .select("event_type, user_id, filename, file_size, ip, payload")
                  .range(offset, offset + page_size - 1)
                  .execute()
        )

        rows = resp.data or []
        if not rows:
            break

        for row in rows:
            payload = row.get("payload") or {}
            if isinstance(payload, str):          # Supabase may return raw JSON string
                try:
                    payload = json.loads(payload)
                except json.JSONDecodeError:
                    payload = {}

            logs.append({
                "event":     row.get("event_type")  or payload.get("event"),
                "user_id":   row.get("user_id")     or payload.get("user_id"),
                "filename":  row.get("filename")    or payload.get("filename"),
                "file_size": row.get("file_size")   or payload.get("file_size") or 0,
                "timestamp": payload.get("timestamp"),          # ms epoch
                "ip":        row.get("ip")          or payload.get("ip"),
            })

        if len(rows) < page_size:
            break
        offset += page_size

    log.info("Fetched %d event log rows from Supabase.", len(logs))
    return logs


# ─── Timestamp helpers ────────────────────────────────────────────────────────

def _ts_to_dt(ts_ms) -> datetime | None:
    """Convert a millisecond epoch (int or float) to a UTC datetime."""
    try:
        return datetime.fromtimestamp(int(ts_ms) / 1000, tz=timezone.utc)
    except (TypeError, ValueError, OSError):
        return None


def _date_str(ts_ms) -> str:
    dt = _ts_to_dt(ts_ms)
    return dt.strftime("%Y-%m-%d") if dt else "unknown"


def _hour(ts_ms) -> int | None:
    dt = _ts_to_dt(ts_ms)
    return dt.hour if dt else None


# ─── Analytics (Map-Reduce style) ────────────────────────────────────────────

def analytic_daily_trend(logs: list[dict]) -> list[dict]:
    """ANALYTIC 1: uploads per calendar day."""
    counts: Counter = Counter()
    for row in logs:
        if row["event"] == "upload":
            counts[_date_str(row["timestamp"])] += 1
    return sorted(
        [{"date": d, "uploads": c} for d, c in counts.items()],
        key=lambda x: x["date"],
    )


def analytic_top_files(logs: list[dict]) -> list[dict]:
    """ANALYTIC 2: top 10 most-downloaded filenames."""
    counts: Counter = Counter()
    for row in logs:
        if row["event"] == "download" and row.get("filename"):
            counts[row["filename"]] += 1
    return [
        {"filename": fn, "downloads": cnt}
        for fn, cnt in counts.most_common(10)
    ]


def analytic_user_storage(logs: list[dict]) -> list[dict]:
    """ANALYTIC 3: total bytes uploaded + file count per user."""
    totals: dict[str, dict] = defaultdict(lambda: {"total_bytes": 0, "file_count": 0})
    for row in logs:
        if row["event"] == "upload" and row.get("user_id"):
            uid = row["user_id"]
            totals[uid]["total_bytes"] += int(row.get("file_size") or 0)
            totals[uid]["file_count"]  += 1
    return [
        {"user_id": uid, **stats}
        for uid, stats in totals.items()
    ]


def analytic_event_breakdown(logs: list[dict]) -> list[dict]:
    """ANALYTIC 4: row count per event type."""
    counts: Counter = Counter(
        row["event"] for row in logs if row.get("event")
    )
    return [{"event": ev, "count": cnt} for ev, cnt in counts.items()]


def analytic_hourly_pattern(logs: list[dict]) -> list[dict]:
    """ANALYTIC 5: total events per hour-of-day (0–23)."""
    counts: Counter = Counter()
    for row in logs:
        h = _hour(row["timestamp"])
        if h is not None:
            counts[h] += 1
    return sorted(
        [{"hour": h, "events": c} for h, c in counts.items()],
        key=lambda x: x["hour"],
    )


def analytic_platform_totals(logs: list[dict]) -> list[dict]:
    """ANALYTIC 6: single-row platform-wide summary."""
    total_events         = len(logs)
    active_users         = len({r["user_id"] for r in logs if r.get("user_id")})
    total_bytes_uploaded = sum(
        int(r.get("file_size") or 0)
        for r in logs if r["event"] == "upload"
    )
    return [{
        "total_events":         total_events,
        "active_users":         active_users,
        "total_bytes_uploaded": total_bytes_uploaded,
    }]


def analytic_anomalies(logs: list[dict]) -> list[dict]:
    """
    ANALYTIC 7: users with >5 off-hours events (22:00–06:00) on a single day.
    """
    counts: Counter = Counter()
    for row in logs:
        h = _hour(row["timestamp"])
        if h is not None and (h >= 22 or h <= 6) and row.get("user_id"):
            key = (row["user_id"], _date_str(row["timestamp"]))
            counts[key] += 1
    return [
        {"user_id": uid, "date": date, "off_hours_events": cnt}
        for (uid, date), cnt in counts.items()
        if cnt > 5
    ]


# ─── Write helper ─────────────────────────────────────────────────────────────

def write_cache(name: str, data: list[dict]) -> None:
    """Write analytics result to backend/analytics_cache/{name}.json."""
    _CACHE_DIR.mkdir(parents=True, exist_ok=True)
    out_path = _CACHE_DIR / f"{name}.json"
    out_path.write_text(json.dumps(data, indent=2, default=str))
    log.info("Wrote %-20s → %s  (%d rows)", name, out_path, len(data))


# ─── Entry point ──────────────────────────────────────────────────────────────

def main() -> None:
    client = create_client(SUPABASE_URL, SUPABASE_KEY)
    logs   = fetch_all_logs(client)

    if not logs:
        log.warning("No logs found in event_logs table — writing empty caches.")

    write_cache("daily_trend",      analytic_daily_trend(logs))
    write_cache("top_files",        analytic_top_files(logs))
    write_cache("user_storage",     analytic_user_storage(logs))
    write_cache("event_breakdown",  analytic_event_breakdown(logs))
    write_cache("hourly_pattern",   analytic_hourly_pattern(logs))
    write_cache("platform_totals",  analytic_platform_totals(logs))
    write_cache("anomalies",        analytic_anomalies(logs))

    print("SUCCESS: process_logs complete")


if __name__ == "__main__":
    main()
