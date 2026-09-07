#!/bin/bash
set -e

CONTAINER_NAME="stocksync-kafka" 
BOOTSTRAP_SERVER="kafka:29092"
PARTITIONS=3
REPLICATION_FACTOR=1

echo "Creating Kafka topics inside Docker container '$CONTAINER_NAME'..."

TOPICS=(
  "order.created"
  "inventory.reserved"
  "inventory.reservation-failed"
  "payment.processed"
  "payment.failed"
  "saga.order-completed"
  "saga.order-cancelled"
)

for TOPIC in "${TOPICS[@]}"; do
  docker exec -i "$CONTAINER_NAME" kafka-topics \
               --bootstrap-server "$BOOTSTRAP_SERVER" \
               --create \
               --if-not-exists \
               --topic "$TOPIC" \
               --partitions "$PARTITIONS" \
               --replication-factor "$REPLICATION_FACTOR"
done

echo "Topics created successfully."

docker exec "$CONTAINER_NAME" kafka-topics --bootstrap-server "$BOOTSTRAP_SERVER" --list
