#!/bin/sh
set -e

# StockSync deployment launcher — single-container mode.
# Starts all five services in the background and keeps the container
# alive while the API Gateway process runs.

echo "Starting StockSync in single-container mode..."

# Launch worker services in the background
echo "Starting Order Service..."
node services/order-service/dist/index.js &
ORDER_PID=$!

echo "Starting Inventory Service..."
node services/inventory-service/dist/index.js &
INVENTORY_PID=$!

echo "Starting Payment Service..."
node services/payment-service/dist/index.js &
PAYMENT_PID=$!

echo "Starting Saga Orchestrator..."
node services/saga-orchestrator/dist/index.js &
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
node services/api-gateway/dist/index.js &
GATEWAY_PID=$!

# Capture all child PIDs (must be set after all PIDs are assigned)
CHILD_PIDS="$ORDER_PID $INVENTORY_PID $PAYMENT_PID $SAGA_PID $GATEWAY_PID"

# Wait for the Gateway to exit, then shut down all services.
wait "$GATEWAY_PID" || EXIT_CODE=$?
EXIT_CODE=${EXIT_CODE:-0}

shutdown
exit "$EXIT_CODE"
