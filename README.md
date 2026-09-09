# StockSync — Distributed Inventory-Order Platform

A microservices-based inventory and order management system demonstrating event-driven architecture, the Saga pattern, and distributed transactions.

## Architecture

- **API Gateway** — Express.js, JWT auth, rate limiting (Redis)
- **Order Service** — Node.js + MongoDB
- **Inventory Service** — Node.js + PostgreSQL
- **Payment Service** — Mock payment processor
- **Saga Orchestrator** — Distributed transaction coordinator
- **Dashboard** — Next.js frontend


```mermaid
---
config:
  theme: redux-dark-color
  look: handDrawn
  fontFamily: '''Source Code Pro Variable'', monospace'
  themeVariables:
    fontFamily: '''Source Code Pro Variable'', monospace'
---
sequenceDiagram
    participant Client
    participant Gateway
    participant Order
    participant Kafka
    participant Inventory
    participant Payment
    participant Saga
    participant MongoDB
    participant PostgreSQL

    Client->>Gateway: POST /orders with JWT
    Gateway->>Order: Forward request
    Order->>MongoDB: Save PENDING order
    Order->>Kafka: order.created
    Order-->>Gateway: 201 Created
    Gateway-->>Client: PENDING order

    Kafka->>Inventory: order.created
    Inventory->>PostgreSQL: BEGIN + SELECT FOR UPDATE
    Inventory->>PostgreSQL: Reserve stock
    Inventory->>PostgreSQL: Insert reservation
    Inventory->>Kafka: inventory.reserved

    Kafka->>Saga: inventory.reserved
    Saga->>Saga: AWAITING_PAYMENT

    Kafka->>Payment: inventory.reserved

    alt Payment approved
        Payment->>Kafka: payment.processed
        Kafka->>Saga: payment.processed
        Saga->>Kafka: saga.order-completed
        Kafka->>Order: saga.order-completed
        Order->>MongoDB: CONFIRMED
    else Payment declined
        Payment->>Kafka: payment.failed
        Kafka->>Saga: payment.failed
        Saga->>Inventory: POST /inventory/release
        Inventory->>PostgreSQL: Release reservation
        Saga->>Kafka: saga.order-cancelled
        Kafka->>Order: saga.order-cancelled
        Order->>MongoDB: CANCELLED
    end
```

## Quick Start

```bash
# ==========================================
# 1. INFRASTRUCTURE & SERVICES SETUP
# ==========================================

# Start all Docker containers in detached mode
docker-compose up -d

# Create the required Kafka topics
./scripts/create-topics.sh


# ==========================================
# 2. SYSTEM DIAGNOSTICS & CHECKS (Optional)
# ==========================================

# Check PostgreSQL database tables
docker exec -it stocksync-postgres psql -U stocksync -d inventory -c "\dt"

# Test Kafka connection from YOUR local machine (External Listener)
docker exec stocksync-kafka kafka-broker-api-versions --bootstrap-server localhost:9092

# Test Kafka connection from INSIDE Docker (Internal Listener)
docker exec stocksync-kafka kafka-broker-api-versions --bootstrap-server kafka:29092


# ==========================================
# 3. LOG MONITORING
# ==========================================

# Stream live container logs. Replace <SERVICE_NAME> with one of the following:
# - stocksync-order-service
# - stocksync-inventory-service
# - stocksync-payment-service
# - stocksync-saga-orchestrator
# - stocksync-api-gateway
docker logs -f <SERVICE_NAME>

```

## Tech Stack

- Node.js, TypeScript, Express
- PostgreSQL, MongoDB, Redis
- Apache Kafka
- Docker, Docker Compose
- Next.js, React, Tailwind CSS
- Jest, Supertest

## Author

Pruthwiraj Nayak — Building this to demonstrate distributed systems expertise.
