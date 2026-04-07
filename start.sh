#!/bin/bash

# start.sh - VaultIQ Full Stack Orchestrator
# Starts Node.js Backend, Python AI Service, and React Frontend concurrently

# Environment Setup
export BROWSER=none
export CI=true

# Load environment variables
if [ -f backend/.env ]; then
  export $(grep -v '^#' backend/.env | xargs)
else
  echo "Error: backend/.env file not found. Please create it first."
  exit 1
fi

# Validation logic
validate_env() {
  local vars=("AI_SERVICE_URL" "PORT" "AWS_REGION" "S3_BUCKET_NAME")
  for var in "${vars[@]}"; do
    if [ -z "${!var}" ]; then
      echo "Error: $var is not set in backend/.env"
      exit 1
    fi
  done
}

validate_env

# Cleanup logic on exit
cleanup() {
  echo ""
  echo "Stopping all VaultIQ services..."
  kill $BACKEND_PID $AI_PID $FRONTEND_PID 2>/dev/null
  exit 0
}

trap cleanup SIGINT SIGTERM

echo "--- Starting VaultIQ Ecosystem ---"

# 1. AI Service (Port 8001)
echo "[AI] Starting VaultIQ AI Service..."
cd ai_service
if [ -d "venv" ]; then
    ./venv/bin/python3 -m uvicorn main:app --host 0.0.0.0 --port ${PORT_AI:-8001} > server.log 2>&1 &
    AI_PID=$!
else
    echo "Warning: AI venv not found. Attempting global uvicorn..."
    python3 -m uvicorn main:app --host 0.0.0.0 --port ${PORT_AI:-8001} > server.log 2>&1 &
    AI_PID=$!
fi
cd ..

# 2. Backend (Port 5000)
echo "[BE] Starting VaultIQ Backend..."
cd backend
npm run dev > server.log 2>&1 &
BACKEND_PID=$!
cd ..

# 3. Frontend (Port 3000)
echo "[FE] Starting VaultIQ Frontend..."
cd frontend
# Ensure dependencies are linked if needed, but assuming they are
npm start > /dev/null 2>&1 &
FRONTEND_PID=$!
cd ..

echo ""
echo "VaultIQ Services are launching!"
echo "--------------------------------"
echo "AI Service PID: $AI_PID (Port: ${PORT_AI:-8001})"
echo "Backend PID:    $BACKEND_PID (Port: ${PORT:-5000})"
echo "Frontend PID:   $FRONTEND_PID (Port: 3000)"
echo "--------------------------------"
echo "Wait 5-10s for full readiness..."
echo "Press Ctrl+C to stop all services."

# Wait for processes
wait $BACKEND_PID $AI_PID $FRONTEND_PID
