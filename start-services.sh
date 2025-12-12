#!/bin/bash

# Start all services in parallel
echo "Starting all BookSpace services..."

# Kill existing node processes to be safe
pkill -f "npm run dev" || true
pkill -f "tsx watch" || true

mkdir -p logs

# Function to start a service in subshell to preserve CWD
start_service() {
  service=$1
  echo "Starting $service..."
  (
    cd services/$service && \
    npm run dev > ../../logs/$service.log 2>&1 & \
    echo "$service started (PID $!)"
  )
}

start_service "auth"
start_service "user"
start_service "document"
start_service "upload"
start_service "search"

# Give services a moment to initialize
echo "Waiting for microservices to start..."
sleep 5

# Start Gateway last
echo "Starting gateway..."
(
  cd services/gateway && \
  npm run dev > ../../logs/gateway.log 2>&1 & \
  echo "gateway started (PID $!)"
)

echo "All services start command issued! Logs are in ./logs directory."
echo "Tail logs using: tail -f logs/*.log"
echo "Run ./test-apis.sh to verify everything is working."
