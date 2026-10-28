#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# VaultIQ — EC2 Production Deployment Script
# Run on EC2 to deploy or update VaultIQ.
# Usage: ./scripts/deploy.sh
#        DEPLOY_REF=<commit-sha> ./scripts/deploy.sh   # deploy/roll back to an exact commit
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

PROJECT_DIR="${PROJECT_DIR:-/home/ubuntu/vaultiq}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DEPLOY_REF="${DEPLOY_REF:-}"

echo "════════════════════════════════════════════════════════════"
echo " VaultIQ — Production Deployment"
echo " $(date '+%Y-%m-%d %H:%M:%S')"
echo "════════════════════════════════════════════════════════════"

# ── Pull Latest Code ─────────────────────────────────────────────────────────

echo ""
cd "$PROJECT_DIR"
if [ -n "$DEPLOY_REF" ]; then
  echo "[deploy] Checking out ${DEPLOY_REF}..."
  git fetch --quiet --tags origin
  # Branch names resolve to the freshly fetched remote branch; SHAs/tags as-is
  git checkout --quiet --detach "$(git rev-parse --verify --quiet "origin/$DEPLOY_REF" || echo "$DEPLOY_REF")"
else
  echo "[deploy] Pulling latest code from main..."
  git checkout --quiet main && git pull origin main
fi
echo "[deploy] Deploying commit $(git rev-parse --short HEAD)"

# ── Stop Old Containers ──────────────────────────────────────────────────────

echo ""
echo "[deploy] Stopping existing services..."
docker compose down --remove-orphans || true

# ── Build & Start Services ───────────────────────────────────────────────────

echo ""
echo "[deploy] Building and starting services..."
docker compose up -d --build

# ── Wait for HDFS NameNode ───────────────────────────────────────────────────

echo ""
echo "[deploy] Waiting for HDFS NameNode to become healthy..."
ATTEMPTS=0
MAX_ATTEMPTS=60
until docker exec vaultiq-namenode hdfs dfs -ls / &>/dev/null; do
  ATTEMPTS=$((ATTEMPTS + 1))
  if [ $ATTEMPTS -ge $MAX_ATTEMPTS ]; then
    echo "[deploy] WARNING: NameNode did not become healthy in 5 minutes."
    echo "[deploy] Check: docker logs vaultiq-namenode"
    break
  fi
  sleep 5
done

# ── Initialize HDFS Directories ─────────────────────────────────────────────

echo ""
echo "[deploy] Initializing HDFS directories..."
bash "$SCRIPT_DIR/init-hdfs.sh"

# ── Service Status ───────────────────────────────────────────────────────────

echo ""
echo "[deploy] Checking service status..."
docker compose ps

# ── Print Access URLs ────────────────────────────────────────────────────────

EC2_IP=$(curl -s --connect-timeout 3 http://169.254.169.254/latest/meta-data/public-ipv4 2>/dev/null || echo "localhost")

echo ""
echo "════════════════════════════════════════════════════════════"
echo " ✅ Deployment Complete!"
echo ""
echo " Backend API:  http://${EC2_IP}:5000"
echo " HDFS UI:      http://${EC2_IP}:9870"
echo " Spark UI:     http://${EC2_IP}:8080"
echo " Frontend:     http://${EC2_IP}:3000"
echo ""
echo " Next steps:"
echo "   1. Verify HDFS UI shows 1 DataNode"
echo "   2. Verify Spark UI shows 1 Worker"
echo "   3. Run: curl http://${EC2_IP}:5000/api/health"
echo "   4. Set up cron: crontab -e"
echo "      0 2 * * * ${PROJECT_DIR}/scripts/run-spark-job.sh"
echo "════════════════════════════════════════════════════════════"
