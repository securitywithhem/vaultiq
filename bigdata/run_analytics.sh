#!/bin/bash

# VaultIQ Analytics Runner (Option A - Simplified)
# Runs the Pandas-based analytics job daily
# Schedule with cron: 0 2 * * * /path/to/bigdata/run_analytics.sh

set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENV_PATH="${PROJECT_ROOT}/.venv"
ANALYTICS_SCRIPT="${PROJECT_ROOT}/bigdata/analytics_simple.py"
LOG_DIR="${PROJECT_ROOT}/bigdata/logs"
LOG_FILE="${LOG_DIR}/analytics.log"

# Create logs directory
mkdir -p "$LOG_DIR"

# Log helper function
log_msg() {
  local msg="[$(date '+%Y-%m-%d %H:%M:%S')] $1"
  echo "$msg" | tee -a "$LOG_FILE"
}

log_msg "Analytics job started"

# Check if venv exists
if [ ! -d "$VENV_PATH" ]; then
  log_msg "ERROR: Virtual environment not found at $VENV_PATH"
  log_msg "Setup: python3 -m venv $VENV_PATH && $VENV_PATH/bin/pip install -r bigdata/requirements.txt"
  exit 1
fi

# Check if analytics script exists
if [ ! -f "$ANALYTICS_SCRIPT" ]; then
  log_msg "ERROR: Analytics script not found at $ANALYTICS_SCRIPT"
  exit 1
fi

# Load environment from backend/.env
cd "$PROJECT_ROOT" || exit 1
if [ -f "backend/.env" ]; then
  export $(grep -v '^#' backend/.env | xargs) || true
fi

# Run analytics
log_msg "Running analytics..."

if "$VENV_PATH/bin/python" "$ANALYTICS_SCRIPT" >> "$LOG_FILE" 2>&1; then
  log_msg "✓ Analytics job completed successfully"
  exit 0
else
  log_msg "✗ Analytics job failed (check $LOG_FILE for details)"
  exit 1
fi
