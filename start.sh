#!/usr/bin/env bash
# Start EyeVio backend (port 5002) and frontend (port 3000)
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$ROOT_DIR/eyevio"
FRONTEND_DIR="$ROOT_DIR/eyevio-frontend"
BACKEND_PORT=5002
FRONTEND_PORT=3000
LOG_DIR="${TMPDIR:-/tmp}/eyevio-logs"
mkdir -p "$LOG_DIR"

BACKEND_LOG="$LOG_DIR/backend.log"
FRONTEND_LOG="$LOG_DIR/frontend.log"
MIGRATE_LOG="$LOG_DIR/migrate.log"

GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}Starting EyeVio...${NC}"

if [[ ! -d "$BACKEND_DIR" ]]; then
  echo -e "${RED}Backend folder not found: $BACKEND_DIR${NC}"
  exit 1
fi

if [[ ! -d "$FRONTEND_DIR" ]]; then
  echo -e "${RED}Frontend folder not found: $FRONTEND_DIR${NC}"
  exit 1
fi

PYTHON_BIN=""
if [[ -x "$BACKEND_DIR/venv/bin/python" ]]; then
  PYTHON_BIN="$BACKEND_DIR/venv/bin/python"
elif [[ -x "$BACKEND_DIR/venv/bin/python3" ]]; then
  PYTHON_BIN="$BACKEND_DIR/venv/bin/python3"
else
  echo -e "${RED}Python venv not found at $BACKEND_DIR/venv${NC}"
  echo "Create it with:"
  echo "  cd eyevio && python3 -m venv venv && source venv/bin/activate && pip install -r requirements.txt"
  exit 1
fi

free_port() {
  local port="$1"
  if lsof -ti:"$port" >/dev/null 2>&1; then
    echo -e "${BLUE}Stopping process on port $port...${NC}"
    lsof -ti:"$port" | xargs kill -9 2>/dev/null || true
  fi
}

free_port "$BACKEND_PORT"
free_port "$FRONTEND_PORT"
sleep 1

cleanup() {
  echo ""
  echo -e "${BLUE}Stopping EyeVio...${NC}"
  if [[ -n "${BACKEND_PID:-}" ]]; then
    kill "$BACKEND_PID" 2>/dev/null || true
  fi
  if [[ -n "${FRONTEND_PID:-}" ]]; then
    kill "$FRONTEND_PID" 2>/dev/null || true
  fi
  free_port "$BACKEND_PORT"
  free_port "$FRONTEND_PORT"
  echo -e "${GREEN}Stopped.${NC}"
}
trap cleanup EXIT INT TERM

echo -e "${BLUE}Applying database migrations...${NC}"
(
  cd "$BACKEND_DIR"
  FLASK_APP=run.py "$PYTHON_BIN" -m flask db upgrade >"$MIGRATE_LOG" 2>&1
) || {
  echo -e "${RED}Migration failed. Check $MIGRATE_LOG${NC}"
  exit 1
}

echo -e "${BLUE}Starting backend on port $BACKEND_PORT...${NC}"
(
  cd "$BACKEND_DIR"
  PORT="$BACKEND_PORT" FLASK_ENV=development "$PYTHON_BIN" run.py
) >"$BACKEND_LOG" 2>&1 &
BACKEND_PID=$!

sleep 2
if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
  echo -e "${RED}Backend failed to start. Check $BACKEND_LOG${NC}"
  exit 1
fi
echo -e "${GREEN}Backend running (PID $BACKEND_PID) → http://localhost:$BACKEND_PORT${NC}"

echo -e "${BLUE}Starting frontend on port $FRONTEND_PORT...${NC}"
(
  cd "$FRONTEND_DIR"
  npm run dev -- --port "$FRONTEND_PORT" --host
) >"$FRONTEND_LOG" 2>&1 &
FRONTEND_PID=$!

sleep 3
if ! kill -0 "$FRONTEND_PID" 2>/dev/null; then
  echo -e "${RED}Frontend failed to start. Check $FRONTEND_LOG${NC}"
  exit 1
fi
echo -e "${GREEN}Frontend running (PID $FRONTEND_PID) → http://localhost:$FRONTEND_PORT${NC}"

echo ""
echo -e "${GREEN}EyeVio is ready${NC}"
echo "  App:     http://localhost:$FRONTEND_PORT"
echo "  API:     http://localhost:$BACKEND_PORT"
echo "  Logs:    $LOG_DIR"
echo "  Backend: tail -f $BACKEND_LOG"
echo "  Frontend:tail -f $FRONTEND_LOG"
echo ""
echo "Press Ctrl+C to stop both servers."

wait
