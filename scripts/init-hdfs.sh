#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# VaultIQ — HDFS Directory Initialization
# Run ONCE after first `docker compose up` to create the HDFS directory tree.
# Usage: ./scripts/init-hdfs.sh
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

NAMENODE_CONTAINER="vaultiq-namenode"
MAX_RETRIES=30
RETRY_INTERVAL=5

echo "════════════════════════════════════════════════════════════"
echo " VaultIQ — HDFS Initialization"
echo "════════════════════════════════════════════════════════════"

# ── Wait for NameNode to leave Safe Mode ─────────────────────────────────────

echo "[init-hdfs] Waiting for NameNode to become ready..."

for i in $(seq 1 $MAX_RETRIES); do
  if docker exec "$NAMENODE_CONTAINER" hdfs dfs -ls / &>/dev/null; then
    echo "[init-hdfs] NameNode is ready (attempt $i/$MAX_RETRIES)"
    break
  fi

  if [ "$i" -eq "$MAX_RETRIES" ]; then
    echo "[init-hdfs] ERROR: NameNode did not become ready after $((MAX_RETRIES * RETRY_INTERVAL))s"
    echo "[init-hdfs] Check logs: docker logs $NAMENODE_CONTAINER"
    exit 1
  fi

  echo "[init-hdfs] NameNode not ready yet... retrying in ${RETRY_INTERVAL}s (attempt $i/$MAX_RETRIES)"
  sleep $RETRY_INTERVAL
done

# ── Create Directory Structure ───────────────────────────────────────────────

echo "[init-hdfs] Creating HDFS directories..."

docker exec "$NAMENODE_CONTAINER" hdfs dfs -mkdir -p /vaultiq/logs
docker exec "$NAMENODE_CONTAINER" hdfs dfs -mkdir -p /vaultiq/results

# ── Set Permissions ──────────────────────────────────────────────────────────

echo "[init-hdfs] Setting permissions..."

docker exec "$NAMENODE_CONTAINER" hdfs dfs -chmod -R 777 /vaultiq/logs
docker exec "$NAMENODE_CONTAINER" hdfs dfs -chmod -R 777 /vaultiq/results

# ── Verify ───────────────────────────────────────────────────────────────────

echo "[init-hdfs] Verifying directory structure..."

docker exec "$NAMENODE_CONTAINER" hdfs dfs -ls -R /vaultiq/

echo ""
echo "════════════════════════════════════════════════════════════"
echo " ✅ HDFS initialized successfully!"
echo "   /vaultiq/logs/     — event log storage"
echo "   /vaultiq/results/  — Spark analytics output"
echo "════════════════════════════════════════════════════════════"
