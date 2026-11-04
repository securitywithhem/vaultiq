#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# VaultIQ — Daily Spark Analytics Job Runner
# Executes the analytics PySpark job inside the spark-master container.
# Add to crontab: 0 2 * * * /home/ubuntu/vaultiq/scripts/run-spark-job.sh
# Log file: $VAULTIQ_ANALYTICS_LOG, else /var/log/vaultiq-analytics.log if
# writable, else <repo>/logs/vaultiq-analytics.log
# ─────────────────────────────────────────────────────────────────────────────

set -uo pipefail

SPARK_CONTAINER="vaultiq-spark-master"
SPARK_SUBMIT="/opt/spark/bin/spark-submit"   # apache/spark image doesn't put it on PATH
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if [ -n "${VAULTIQ_ANALYTICS_LOG:-}" ]; then
  LOG_FILE="$VAULTIQ_ANALYTICS_LOG"
elif touch /var/log/vaultiq-analytics.log 2>/dev/null; then
  LOG_FILE="/var/log/vaultiq-analytics.log"
else
  mkdir -p "$ROOT/logs"
  LOG_FILE="$ROOT/logs/vaultiq-analytics.log"
fi

ts() { date '+%Y-%m-%d %H:%M:%S'; }
log() { echo "[$(ts)] $*" | tee -a "$LOG_FILE"; }

log "── Starting VaultIQ Spark Analytics Job ──"

# Check if Spark master container is running
if ! docker inspect -f '{{.State.Running}}' "$SPARK_CONTAINER" 2>/dev/null | grep -q true; then
  log "ERROR: $SPARK_CONTAINER is not running. Aborting."
  exit 1
fi

# boto3 for the S3 archive step (container runs as the non-root 'spark' user, so install as root)
# Wheels are downloaded on the host (bigdata/ is mounted at /opt/spark-jobs) and installed
# offline: container-side PyPI access can be very slow (e.g. Docker Desktop networking).
WHEELS_DIR="$ROOT/bigdata/.wheels"
if ! docker exec "$SPARK_CONTAINER" python3 -c "import boto3" 2>/dev/null; then
  log "Installing boto3 in $SPARK_CONTAINER..."
  if command -v python3 >/dev/null && python3 -m pip download -q -d "$WHEELS_DIR" \
       --only-binary=:all: --python-version 3.8 boto3 "urllib3<1.27" >> "$LOG_FILE" 2>&1 \
     && docker exec -u root "$SPARK_CONTAINER" pip install -q --no-index \
       --find-links /opt/spark-jobs/.wheels boto3 >> "$LOG_FILE" 2>&1; then
    log "boto3 installed from host-downloaded wheels"
  else
    docker exec -u root "$SPARK_CONTAINER" pip install -q --timeout 120 --retries 5 boto3 >> "$LOG_FILE" 2>&1 \
      || log "WARN: boto3 install failed — S3 archive step will be skipped"
  fi
fi

# Run the spark-submit job
docker exec "$SPARK_CONTAINER" \
  "$SPARK_SUBMIT" \
  --master spark://spark-master:7077 \
  --executor-memory 512m \
  --driver-memory 512m \
  --conf spark.sql.session.timeZone=UTC \
  /opt/spark-jobs/analytics_job.py \
  >> "$LOG_FILE" 2>&1
EXIT_CODE=$?

if [ $EXIT_CODE -eq 0 ]; then
  log "✅ Spark analytics job completed successfully"
else
  log "❌ Spark analytics job failed with exit code $EXIT_CODE (see $LOG_FILE)"
fi

log "── End of Spark Analytics Job ──"
exit $EXIT_CODE
