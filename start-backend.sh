#!/bin/bash
# Start Backend Server on port 4000

echo "🔧 Starting Backend Server..."
echo "Port: 4000"
echo ""

cd backend

echo "Starting Express server..."
npm run dev

# Expected output:
# VaultIQ backend listening on port 4000 {
#   env: 'development'
# }
