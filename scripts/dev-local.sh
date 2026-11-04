#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# VaultIQ — run the whole stack locally
#   Docker : HDFS (namenode + datanode), Spark (master + worker)
#   Native : Redis, AI service (:8001), backend (:5000), frontend (:3000)
#
# Usage:  ./scripts/dev-local.sh          start everything, Ctrl+C stops app services
#         ./scripts/dev-local.sh spark    run the Spark analytics job once
#         ./scripts/dev-local.sh down     stop the Docker containers too
# Logs:   .dev-logs/{ai,backend,frontend}.log
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
COMPOSE="docker compose -f $ROOT/docker-compose.dev.yml"
LOGS="$ROOT/.dev-logs"

case "${1:-up}" in
  spark)
    mkdir -p "$LOGS"
    VAULTIQ_ANALYTICS_LOG="$LOGS/spark.log" exec bash "$ROOT/scripts/run-spark-job.sh" ;;
  down)
    $COMPOSE down
    exit 0 ;;
esac

[ -f "$ROOT/backend/.env" ] || { echo "backend/.env missing — copy backend/.env.example and fill it in"; exit 1; }
mkdir -p "$LOGS"

# 1. Docker infra
docker info >/dev/null 2>&1 || { echo "Starting Docker Desktop..."; open -a Docker; until docker info >/dev/null 2>&1; do sleep 2; done; }
$COMPOSE up -d
printf "Waiting for HDFS NameNode"
until [ "$(docker inspect -f '{{.State.Health.Status}}' vaultiq-namenode 2>/dev/null)" = healthy ]; do printf "."; sleep 3; done; echo
bash "$ROOT/scripts/init-hdfs.sh" >/dev/null && echo "HDFS ready"

# 2. Redis
redis-cli ping >/dev/null 2>&1 || { redis-server --daemonize yes >/dev/null; echo "Redis started"; }

# 3. App services
PIDS=()
cleanup() { echo; echo "Stopping app services..."; kill "${PIDS[@]}" 2>/dev/null || true; wait 2>/dev/null; echo "Done (Docker infra still running: ./scripts/dev-local.sh down)"; }
trap cleanup INT TERM

(cd "$ROOT/ai-service" && ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5000 \
  exec .venv/bin/uvicorn main:app --host 0.0.0.0 --port 8001) > "$LOGS/ai.log" 2>&1 & PIDS+=($!)
(cd "$ROOT/backend"  && exec npm run dev)                               > "$LOGS/backend.log"  2>&1 & PIDS+=($!)
(cd "$ROOT/frontend" && BROWSER=none PORT=3000 exec npm start)          > "$LOGS/frontend.log" 2>&1 & PIDS+=($!)

wait_for() { for _ in $(seq 1 90); do curl -sf -o /dev/null "$2" && { echo "  ✅ $1  $2"; return; }; sleep 2; done; echo "  ❌ $1 not up — see $LOGS"; }
echo "Waiting for services..."
wait_for "AI service" http://localhost:8001/health
wait_for "Backend   " http://localhost:5000/api/health
wait_for "Frontend  " http://localhost:3000/
echo "  HDFS UI   http://localhost:9870   ·   Spark UI http://localhost:8080"
echo "Ctrl+C to stop app services."
wait
