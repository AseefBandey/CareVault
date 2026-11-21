#!/usr/bin/env bash
set -e

# CareVault unified development launcher
# Starts both the Node.js API server and the Vite frontend

cleanup() {
  echo ""
  echo "Shutting down CareVault development servers..."
  kill $(jobs -p) 2>/dev/null || true
  exit 0
}

trap cleanup SIGINT SIGTERM EXIT

echo "============================================="
echo "   Starting CareVault Hybrid Stack           "
echo "============================================="

# 1. Start Node.js API server
echo "-> Starting Node.js API server on port 8787..."
node server/index.mjs &
API_PID=$!

# Wait briefly for API server to bind
sleep 1

# 2. Check if Python Pipeline microservice is running
if curl -s http://localhost:8000/health >/dev/null 2>&1; then
  echo "-> Connected to Python OpenCV+PaddleOCR service on port 8000 (Active)"
else
  echo "-> Python CV service not running on port 8000 (Node in-process fallback enabled)"
fi

# 3. Start Vite frontend
echo "-> Starting Vite web frontend on port 3000..."
npx vite --port 3000

wait $API_PID
