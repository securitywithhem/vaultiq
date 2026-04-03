#!/bin/bash

# validate_setup.sh - VaultIQ Health & Connectivity Validator

# Load environment variables
if [ -f backend/.env ]; then
  export $(grep -v '^#' backend/.env | xargs)
else
  echo "Error: backend/.env file not found."
  exit 1
fi

echo "--- VaultIQ Health Check ---"

# 1. AI Service Health
echo "1. Pinging AI Service (/health)..."
curl -s ${AI_SERVICE_URL:-http://localhost:8001}/health | grep -q "ok" && echo "PASS: AI Service is ONLINE" || echo "FAIL: AI Service unreachable"

# 2. Backend API Health
echo "2. Pinging Backend API (/api/health)..."
curl -s http://localhost:${PORT:-5000}/api/health | grep -q "ok" && echo "PASS: Backend is ONLINE" || echo "FAIL: Backend unreachable"

# 3. AI Detection Status (Proxy check)
echo "3. Checking AI Detection Status (/api/ai-detect/status)..."
curl -s http://localhost:${PORT:-5000}/api/ai-detect/status | grep -q "true" && echo "PASS: Backend-AI Proxy is active" || echo "FAIL: Backend-AI Proxy unreachable"

# 4. S3 Credentials Check (Dry-run logic check)
if [ -n "$AWS_ACCESS_KEY_ID" ] && [ -n "$AWS_SECRET_ACCESS_KEY" ]; then
    echo "4. S3 Configuration: FOUND"
else
    echo "4. S3 Configuration: MISSING"
fi

# 5. HDFS Credentials Check
if [ -n "$HDFS_WEBHDFS_URL" ]; then
    echo "5. HDFS Configuration: FOUND"
else
    echo "5. HDFS Configuration: MISSING"
fi

echo "--- Validation Complete ---"
