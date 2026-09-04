# StockSync — Distributed Inventory-Order Platform

A microservices-based inventory and order management system demonstrating event-driven architecture, the Saga pattern, and distributed transactions.

## Architecture

- **API Gateway** — Express.js, JWT auth, rate limiting (Redis)
- **Order Service** — Node.js + MongoDB
- **Inventory Service** — Node.js + PostgreSQL
- **Payment Service** — Mock payment processor
- **Saga Orchestrator** — Distributed transaction coordinator
- **Dashboard** — Next.js frontend

## Quick Start

```bash
# 1. Start infrastructure
docker-compose up -d

# 2. Verify Kafka is ready
docker exec -it stocksync-kafka-1 kafka-topics --bootstrap-server localhost:9092 --list

# 3. Create Kafka topics
./scripts/create-topics.sh
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
