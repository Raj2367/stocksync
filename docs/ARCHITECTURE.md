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

The existing implementation uses JWT auth at the gateway, MongoDB for orders
and Saga state, PostgreSQL/Redis for inventory, and Kafka for the asynchronous
Saga flow.

## 2. Target architecture

The target adds only the minimum new responsibilities required for the demo:

- Mongo-backed auth in the gateway
- tenant-aware orders
- persisted tenant-aware Sagas
- demo-controlled payment behavior
- a Next.js frontend (Vercel-hosted, direct to API Gateway)
- an Order Operations Copilot

The Copilot is a hybrid RAG feature and lives as a module within the API Gateway service boundary. It does **not** use embeddings to answer exact transactional questions.

### 2.1 Request path

```text
Browser
  | HTTPS
  v
Vercel-hosted Next.js frontend
  |
  v
Render public API Gateway endpoint
  | HTTPS (TLS terminated by Render platform edge)
  | private network
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

The browser calls the API Gateway directly over HTTPS rather than routing requests server-side through a Next.js proxy layer. TLS is terminated by Render's platform edge, which serves as the public ingress.

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
2. Render's public edge is the public ingress; the API Gateway is the application authentication boundary.
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

The Copilot request shape is `POST /copilot/ask { question, orderId? }`. The UI passes an explicit `orderId` rather than relying on LLM extraction. The vector store uses the existing MongoDB deployment with Node-side cosine similarity ranking, as recorded in ADR-011.

The deployed API Gateway is publicly reachable through Render, with TLS terminated by Render's platform edge. The API Gateway is the public application entry point; internal backend services remain private to the deployment network. The browser-hosted Next.js frontend is deployed to Vercel and communicates directly with the API Gateway over HTTPS; the frontend does not proxy requests server-side.
