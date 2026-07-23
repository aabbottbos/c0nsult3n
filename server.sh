#!/bin/bash
# Usage: ./server.sh start | stop | restart | status | logs

PID_FILE=".server.pid"
LOG_FILE=".server.log"

start() {
  if [ -f "$PID_FILE" ] && kill -0 "$(cat $PID_FILE)" 2>/dev/null; then
    echo "Server already running (PID $(cat $PID_FILE))"
    return
  fi
  echo "Starting dev server..."
  npm run dev > "$LOG_FILE" 2>&1 &
  echo $! > "$PID_FILE"
  echo "Started (PID $!). Logs: $LOG_FILE"
  echo "Waiting for server to be ready..."
  for i in $(seq 1 20); do
    sleep 1
    if grep -q "Local:" "$LOG_FILE" 2>/dev/null || grep -q "localhost" "$LOG_FILE" 2>/dev/null; then
      echo "Ready at http://localhost:3000"
      return
    fi
  done
  echo "Still starting — run: ./server.sh logs"
}

stop() {
  if [ ! -f "$PID_FILE" ]; then
    echo "No server running."
    return
  fi
  PID=$(cat "$PID_FILE")
  if kill -0 "$PID" 2>/dev/null; then
    kill "$PID"
    echo "Stopped (PID $PID)"
  else
    echo "Process $PID not found (already stopped)"
  fi
  rm -f "$PID_FILE"
}

status() {
  if [ -f "$PID_FILE" ] && kill -0 "$(cat $PID_FILE)" 2>/dev/null; then
    echo "Running (PID $(cat $PID_FILE))"
  else
    echo "Stopped"
    rm -f "$PID_FILE" 2>/dev/null
  fi
}

logs() {
  if [ ! -f "$LOG_FILE" ]; then
    echo "No log file yet."
    return
  fi
  tail -50 "$LOG_FILE"
}

case "$1" in
  start)   start ;;
  stop)    stop ;;
  restart) stop; sleep 1; start ;;
  status)  status ;;
  logs)    logs ;;
  *)       echo "Usage: ./server.sh start | stop | restart | status | logs" ;;
esac
