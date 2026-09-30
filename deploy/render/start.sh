#!/bin/sh
set -e

# Internal service URLs for inter-process communication within the container.
export ORDER_SERVICE_URL="${ORDER_SERVICE_URL:-http://127.0.0.1:3001}"
export INVENTORY_SERVICE_URL="${INVENTORY_SERVICE_URL:-http://127.0.0.1:3002}"
export SAGA_SERVICE_URL="${SAGA_SERVICE_URL:-http://127.0.0.1:3004}"

# StockSync deployment launcher — single-container mode.
# Starts all five services in the background and keeps the container
# alive while the API Gateway process runs.

echo "Starting StockSync in single-container mode..."

# Launch worker services in the background
echo "Starting Order Service..."
PORT="${ORDER_SERVICE_PORT:-3001}" MONGO_URI="${ORDER_MONGO_URI:-mongodb://mongodb:27017/orders}" node services/order-service/dist/index.js &
ORDER_PID=$!

echo "Starting Inventory Service..."
PORT="${INVENTORY_SERVICE_PORT:-3002}" node services/inventory-service/dist/index.js &
INVENTORY_PID=$!

echo "Starting Payment Service..."
PORT="${PAYMENT_SERVICE_PORT:-3003}" node services/payment-service/dist/index.js &
PAYMENT_PID=$!

echo "Starting Saga Orchestrator..."
PORT="${SAGA_SERVICE_PORT:-3004}" MONGO_URI="${SAGA_MONGO_URI:-mongodb://mongodb:27017/sagas}" node services/saga-orchestrator/dist/index.js &
SAGA_PID=$!

# Graceful shutdown handler: send SIGTERM to all children and wait.
shutdown() {
  echo "Shutting down StockSync services..."
  for pid in $CHILD_PIDS; do
    kill -TERM "$pid" 2>/dev/null || true
  done
  for pid in $CHILD_PIDS; do
    wait "$pid" 2>/dev/null || true
  done
  echo "All services stopped."
}

trap 'shutdown; exit 0' INT TERM

echo "Starting API Gateway..."
PORT="${PORT:-${API_GATEWAY_PORT:-3000}}" MONGO_URI="${API_GATEWAY_MONGO_URI:-mongodb://mongodb:27017/auth}" node services/api-gateway/dist/index.js &
GATEWAY_PID=$!

# Capture all child PIDs (must be set after all PIDs are assigned)
CHILD_PIDS="$ORDER_PID $INVENTORY_PID $PAYMENT_PID $SAGA_PID $GATEWAY_PID"

# Wait for the Gateway to exit, then shut down all services.
wait "$GATEWAY_PID" || EXIT_CODE=$?
EXIT_CODE=${EXIT_CODE:-0}

shutdown
exit "$EXIT_CODE"
