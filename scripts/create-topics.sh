#!/bin/bash
set -e

echo "Creating Kafka topics..."

kafka-topics --bootstrap-server localhost:9092 --create --if-not-exists --topic order.created --partitions 3 --replication-factor 1
kafka-topics --bootstrap-server localhost:9092 --create --if-not-exists --topic inventory.reserved --partitions 3 --replication-factor 1
kafka-topics --bootstrap-server localhost:9092 --create --if-not-exists --topic inventory.reservation-failed --partitions 3 --replication-factor 1
kafka-topics --bootstrap-server localhost:9092 --create --if-not-exists --topic payment.processed --partitions 3 --replication-factor 1
kafka-topics --bootstrap-server localhost:9092 --create --if-not-exists --topic payment.failed --partitions 3 --replication-factor 1
kafka-topics --bootstrap-server localhost:9092 --create --if-not-exists --topic saga.order-completed --partitions 3 --replication-factor 1
kafka-topics --bootstrap-server localhost:9092 --create --if-not-exists --topic saga.order-cancelled --partitions 3 --replication-factor 1

echo "Topics created successfully."
