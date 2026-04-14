#!/bin/bash
# Start AI Detection Service on port 8001

echo "🤖 Starting AI Detection Service..."
echo "Port: 8001"
echo ""

cd ai-service

echo "Activating Python environment and starting server..."
python3 main.py

# Expected output:
# Server running on http://localhost:8001
# INFO:     Uvicorn running on http://127.0.0.1:8001 (Press CTRL+C to quit)
