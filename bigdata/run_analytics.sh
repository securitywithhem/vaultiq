#!/bin/bash
# VaultIQ — Analytics runner with automatic Spark/fallback switching

echo "[VaultIQ Analytics] Starting at $(date -u)"

if command -v spark-submit &>/dev/null; then
  echo "[VaultIQ Analytics] Spark found — running Spark job"
  spark-submit bigdata/analytics_job.py
  EXIT_CODE=$?
  if [ $EXIT_CODE -ne 0 ]; then
    echo "[VaultIQ Analytics] Spark failed (exit $EXIT_CODE) — switching to fallback"
    python3 bigdata/mapreduce_fallback.py
  fi
else
  echo "[VaultIQ Analytics] Spark not found — running Python fallback"
  python3 bigdata/mapreduce_fallback.py
fi

echo "[VaultIQ Analytics] Done at $(date -u)"
