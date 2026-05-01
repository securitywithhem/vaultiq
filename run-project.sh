#!/bin/bash

# ════════════════════════════════════════════════════════════
#  VaultIQ — Master Startup Script
# ════════════════════════════════════════════════════════════

set -e

echo "🚀 Starting VaultIQ Ecosystem..."

# 1. Environment Check
if [ ! -f "backend/.env" ]; then
    echo "⚠️  backend/.env missing! Copying from .env.example..."
    cp backend/.env.example backend/.env
    echo "👉 Please edit backend/.env with your Supabase credentials later."
fi

# 2. Build and Start Services
echo "📦 Bringing up Docker containers..."
docker compose up -d

# 3. Wait for HDFS NameNode
echo "⏳ Waiting for HDFS NameNode to be healthy (this takes ~30-45s)..."
until [ "$(docker inspect -f {{.State.Health.Status}} vaultiq-namenode)" == "healthy" ]; do
    printf "."
    sleep 5
done
echo -e "\n✅ NameNode is healthy!"

# 4. Initialize HDFS Directories
echo "📂 Initializing HDFS directory structure..."
bash scripts/init-hdfs.sh

# 5. Final Status Check
echo "🔍 Final service status:"
docker compose ps

echo "════════════════════════════════════════════════════════════"
echo " ✅ VaultIQ is running!"
echo " 🌐 Frontend: http://localhost:3000"
echo " 🔌 Backend:  http://localhost:5000"
echo " 🐘 HDFS UI:  http://localhost:9870"
echo " ✨ Spark UI: http://localhost:8080"
echo "════════════════════════════════════════════════════════════"
echo "To view logs: docker compose logs -f"
echo "To stop:      docker compose down"
