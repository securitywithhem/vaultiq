#!/bin/bash

# start.sh - VaultIQ Day 1 Orchestrator
# Starts Node.js Backend and Python AI Service concurrently

# Load environment variables
if [ -f backend/.env ]; then
  export $(grep -v '^#' backend/.env | xargs)
else
  echo "Error: backend/.env file not found. Please create it first."
  exit 1
fi

# Validation logic
validate_env() {
  local vars=("AI_SERVICE_URL" "PORT" "AWS_REGION" "HDFS_WEBHDFS_URL")
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
  echo "Stopping services..."
  kill $BACKEND_PID $AI_PID 2>/dev/null
  exit 0
}

trap cleanup SIGINT SIGTERM

echo "Starting VaultIQ AI Service (FastAPI)..."
cd ai-service
uvicorn main:app --host 0.0.0.0 --port ${PORT_AI:-8001} &
AI_PID=$!
cd ..

echo "Starting VaultIQ Backend (Express)..."
cd backend
npm run dev &
BACKEND_PID=$!
cd ..

echo "VaultIQ Day 1 Services Running!"
echo "AI Service PID: $AI_PID"
echo "Backend PID: $BACKEND_PID"

wait $BACKEND_PID $AI_PID
