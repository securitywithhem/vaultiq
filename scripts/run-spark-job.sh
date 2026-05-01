#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# VaultIQ — Daily Spark Analytics Job Runner
# Executes the analytics PySpark job inside the spark-master container.
# Add to crontab: 0 2 * * * /home/ubuntu/vaultiq/scripts/run-spark-job.sh
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

SPARK_CONTAINER="vaultiq-spark-master"
LOG_FILE="/var/log/vaultiq-analytics.log"
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

echo "[$TIMESTAMP] ── Starting VaultIQ Spark Analytics Job ──" >> "$LOG_FILE" 2>&1

# Check if Spark master container is running
if ! docker inspect -f '{{.State.Running}}' "$SPARK_CONTAINER" 2>/dev/null | grep -q true; then
  echo "[$TIMESTAMP] ERROR: $SPARK_CONTAINER is not running. Aborting." >> "$LOG_FILE" 2>&1
  exit 1
fi

# Ensure boto3 is installed for AWS S3 Backup
docker exec "$SPARK_CONTAINER" pip install boto3 requests python-dotenv || true

# Run the spark-submit job
docker exec "$SPARK_CONTAINER" \
  spark-submit \
  --master spark://spark-master:7077 \
  --executor-memory 512m \
  --driver-memory 512m \
  --conf spark.sql.session.timeZone=UTC \
  /opt/spark-jobs/analytics_job.py \
  >> "$LOG_FILE" 2>&1

EXIT_CODE=$?
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

if [ $EXIT_CODE -eq 0 ]; then
  echo "[$TIMESTAMP] ✅ Spark analytics job completed successfully" >> "$LOG_FILE" 2>&1
else
  echo "[$TIMESTAMP] ❌ Spark analytics job failed with exit code $EXIT_CODE" >> "$LOG_FILE" 2>&1
fi

echo "[$TIMESTAMP] ── End of Spark Analytics Job ──" >> "$LOG_FILE" 2>&1
