# StockSync — High-Level Architecture

## 1. Current baseline

StockSync is a microservice application with:

- API Gateway
- Order Service
- Inventory Service
- Payment Service
- Saga Orchestrator
- MongoDB
- PostgreSQL
- Redis
- Kafka + ZooKeeper

The existing implementation uses JWT auth at the gateway, MongoDB for orders, PostgreSQL/Redis for inventory, Kafka for the asynchronous Saga flow, and an in-memory Saga store.

## 2. Target architecture

The target adds only the minimum new responsibilities required for the demo:

- Mongo-backed auth in the gateway
- tenant-aware orders
- persisted tenant-aware Sagas
- demo-controlled payment behavior
- minimal frontend
- an Order Operations Copilot

The Copilot is a hybrid RAG feature and lives as a module within the API Gateway service boundary. It does **not** use embeddings to answer exact transactional questions.

### Request path

```text
Browser
  | HTTPS
  v
Public TLS Edge / Reverse Proxy
  | private network
  v
API Gateway
  |-- JWT authentication
  |-- tenant derivation
  |-- trusted X-Tenant-Id propagation
  |
  +------------------> Order Service --------> MongoDB (orders)
  |
  +------------------> Saga Orchestrator ----> MongoDB (sagas)
  |
  +--> Copilot module
         |\
         | +--------> Order Service (live order facts)
         |
         +----------> Saga Orchestrator (live Saga facts)
         |
         +----------> RAG knowledge store (vector search, tenant filtered)
         |
         +----------> Redis rate limiter (stricter Copilot per-tenant limit)
         |
         +----------> LLM API
         |
         v
      grounded answer
```

### Async transaction path

```text
Order Service
   |
   v
order.created
   |
   v
Inventory Service
   |
   +---- inventory.reserved ----> Payment Service
   |                                  |
   |                                  +-- payment.processed
   |                                  |
   |                                  +-- payment.failed
   |
   v
Saga Orchestrator
   |
   +---- saga.order-completed
   |
   +---- saga.order-cancelled

Saga Orchestrator --(HTTP compensation)--> Inventory Service `/inventory/release`

The event bus is bidirectional: Order, Inventory, Payment, and Saga can publish/consume relevant events.
```

`tenantId` and `paymentMode` travel through the relevant event chain. Inventory and Payment remain shared/global services.

## 3. Trust boundaries

1. The browser is untrusted.
2. The public TLS edge is the public ingress; the gateway is the application authentication boundary behind it.
3. Internal services trust the gateway-provided tenant context only when they are private to the deployment network.
4. Transactional services remain the source of truth for order/Saga state.
5. RAG retrieval cannot override authorization.
6. The LLM sees only already-authorized context.
7. HTTPS terminates at the public edge; the gateway and internal services are not directly internet-facing.

## 4. Tenant isolation rule

The effective tenant comes only from the verified JWT:

```text
JWT -> gateway -> X-Tenant-Id -> Order/Saga query filters
                         |
                         +-> RAG retrieval filter
```

A client-supplied `X-Tenant-Id` is overwritten, never trusted.

## 5. Data ownership

| Data | Owner | Tenant-scoped? |
|---|---|---|
| Users | API Gateway auth module | Yes |
| Orders | Order Service | Yes |
| Sagas | Saga Orchestrator | Yes |
| Products/catalog | Inventory Service | No — shared |
| Inventory stock | Inventory Service | No — shared |
| Payments | Payment Service | No — shared |
| RAG knowledge | Copilot/RAG module | Yes |

## 6. RAG flow

```text
Question
   |
   +--> authenticated tenant
   |
   +--> resolve requested order (optional)
   |       |
   |       +--> exact live facts from Order/Saga APIs
   |
   +--> embed question
   |
   +--> vector similarity search
           WHERE tenantId = authenticated tenant
           TOP K relevant chunks
   |
   +--> construct grounded prompt
           live facts + retrieved knowledge + user question
   |
   +--> LLM
   |
   v
Answer
```

## 7. Architectural simplification

The first release should avoid introducing a standalone agent platform or RAG microservice unless deployment or isolation requires it. The preferred implementation is a small Copilot/RAG module within an existing Node.js service boundary, backed by existing infrastructure.

The Copilot request shape is `POST /copilot/ask { question, orderId? }`. The UI passes an explicit `orderId` rather than relying on LLM extraction. The exact vector-store wiring remains a Phase 2 decision under ADR-011.

The public deployment uses a TLS edge in front of the private gateway as defined by ADR-012.
