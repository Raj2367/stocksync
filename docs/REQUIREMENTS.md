# StockSync — Requirement Specification

**Version:** 1.0
**Baseline:** 2026-09-28
**Status:** Approved working specification

## 1. Objective

Extend the existing StockSync backend into a small, publicly demonstrable application with:

1. a minimal frontend,
2. credible tenant-scoped authentication and order isolation,
3. persistent Saga history,
4. deterministic demo behavior, and
5. a real RAG-based Order Operations Copilot.

The implementation must also remain small enough to finish within the phased plan; planned time is an estimate, not a reason to expand scope.

The project must remain small enough that the developer can explain every major line and architectural decision in an SDE 2 interview.

## 2. Existing system baseline

StockSync currently contains five application services:

- API Gateway
- Order Service
- Inventory Service
- Payment Service
- Saga Orchestrator

Infrastructure currently includes:

- MongoDB
- PostgreSQL
- Redis
- Kafka
- ZooKeeper

The gateway currently exposes port 3000 and the internal services are also host-published for local development. The current deployment-oriented work must remove public exposure of internal services and data stores.

The current gateway auth implementation is in-memory and stores plaintext passwords. Orders are MongoDB-backed but do not currently contain `tenantId`. Saga state is currently an in-memory `Map`. Payment approval is currently randomized.

## 3. Product feature

### 3.1 Minimal StockSync application

The frontend should provide a small, single-page experience containing:

- login,
- inventory lookup,
- place order,
- order status/history,
- Order Operations Copilot panel.

The UI is intentionally minimal. Visual polish is lower priority than reliability and clarity.

### 3.2 Order Operations Copilot

A tenant user can ask operational questions such as:

- Why did order `ORD-123` fail?
- What happened during the Saga for this order?
- What should an operator check after a payment failure?

The Copilot must combine:

1. **Live facts** from existing Order/Saga APIs; and
2. **Retrieved knowledge** from tenant-scoped operational documentation.

The LLM generates the natural-language explanation but is not the source of transactional truth.

## 4. Tenancy requirements

### 4.1 Identity

JWT must contain:

```json
{
  "userId": "...",
  "email": "...",
  "tenantId": "tenant-acme",
  "role": "USER"
}
```

### 4.2 Tenant propagation

- The client must not choose its effective tenant through a request header.
- The gateway must derive `tenantId` from the verified JWT.
- The gateway overwrites `X-Tenant-Id` before forwarding to downstream services.

### 4.3 Tenant scope

Tenant isolation is required for:

- users/authentication,
- orders,
- sagas,
- RAG documents/chunks.

The product catalog remains shared.

Inventory and Payment remain unchanged from a tenancy perspective.

### 4.4 Demo tenants

Seed:

```text
tenant-acme
  ADMIN user
  USER user

tenant-beta
  ADMIN user
  USER user
```

Open self-registration is disabled.

## 5. Authentication requirements

- Users are stored in MongoDB.
- Passwords are hashed with bcrypt.
- Login returns a JWT valid for 24 hours unless a later approved decision changes this.
- Unknown email and wrong password return the same generic authentication failure.
- Passwords and password hashes are never returned to clients or logged.
- Seed passwords come only from environment variables. Local development defaults may be documented in `.env.example`, but production/deployed startup must fail if required seed passwords are missing.
- `.env` and other real secret files must be ignored by Git; only `.env.example` templates may be committed.

## 6. Order requirements

- Every order stores `tenantId`.
- Every order read/list query is tenant-scoped.
- An order belonging to Tenant A must not be retrievable by a Tenant B user even if the caller knows the order ID.
- Cross-tenant order/Saga lookup by ID returns **404 Not Found**, not 403, so the API does not reveal that the resource exists in another tenant.
- The existing shared product catalog remains unchanged.

## 7. Saga requirements

- Saga records store `tenantId`.
- Saga state is persisted in MongoDB.
- `GET /sagas` and `GET /sagas/:orderId` are tenant-scoped.
- Saga history survives a restart of the Saga Orchestrator.

## 8. Demo-mode payment requirements

- The Kafka event chain carries `paymentMode`.
- `POST /orders` accepts an optional `paymentMode` field for demo control (for example `FAIL` or `SUCCESS`).
- Forced payment success/failure from `paymentMode` is honored only when `DEMO_MODE=true`; otherwise normal mock behavior remains.
- The Phase 1 frontend exposes a demo-only force-payment-failure control when `DEMO_MODE=true`.
- The demo must support a deterministic failure path for the interview.

## 9. RAG requirements

### 9.1 Retrieval

The system must implement:

1. document ingestion,
2. chunking,
3. embeddings,
4. vector similarity retrieval,
5. tenant filtering before retrieval results reach the LLM,
6. prompt construction using live facts + retrieved context,
7. LLM generation.

### 9.2 Knowledge scope

Initial knowledge should be small and controlled, for example:

- payment failure runbook,
- Saga compensation rules,
- inventory reservation behavior,
- troubleshooting guidance,
- StockSync architecture/operational notes where useful.

At least one knowledge item is tenant-specific for `tenant-acme` and at least one is tenant-specific for `tenant-beta`, with materially different content. Shared operational documents use `tenantId = "shared"` and are explicitly included for both tenants.

This ensures the cross-tenant retrieval negative test proves actual isolation rather than returning identical documents.

### 9.3 Copilot API contract

The first release exposes one authenticated endpoint:

```http
POST /copilot/ask
Content-Type: application/json

{
  "question": "Why did this order fail?",
  "orderId": "ORD-123"
}
```

`orderId` is optional, but when the UI is discussing a specific order it passes the explicit ID instead of asking an LLM to extract it from free text.

The Copilot is implemented as a small module within the API Gateway service boundary; it is not a new microservice in the first release.

### 9.4 Grounding

The Copilot should prefer explicit evidence in its context and state when the available context is insufficient. It must not invent order states, payment IDs, inventory values, or tenant data.

Stored transactional values are untrusted data, not instructions. Prompt construction must delimit live facts/retrieved chunks and explicitly instruct the model to ignore any instructions embedded inside retrieved or stored content.

Copilot requests must be protected by a stricter per-tenant Redis rate limit to control free-tier LLM abuse and quota consumption.

## 10. Deployment requirements

- Public frontend and public HTTPS API endpoint.
- A small public TLS edge/reverse proxy is the only internet-facing backend component.
- The API Gateway and all internal services/data stores are private to the deployment network.
- Secrets are supplied through deployment environment variables.
- No paid dependency is required for normal development/demo usage.
- The final deployment stack must use currently available free tiers and document their quotas/limitations before deployment is finalized.
- Deployment must not expose internal application ports or infrastructure ports to the public internet.
- HTTPS must terminate at the public edge so the browser does not make mixed-content requests to a plain-HTTP private/internal gateway.
- Deployment secrets include JWT secret, Mongo/Postgres/Redis credentials, LLM credentials, and demo passwords; none may be committed.

## 11. Technology constraints

- Node.js + TypeScript only for application code.
- Existing services and infrastructure should be reused wherever reasonable.
- No new database server unless explicitly justified.
- No Python.
- No agent framework in the first release.
- No unnecessary abstraction layer around the LLM.

## 12. Quality requirements

The final system must demonstrate:

- tenant isolation,
- deterministic failure/success path,
- Saga persistence,
- working asynchronous Kafka flow,
- a working RAG retrieval pipeline,
- deployment health/availability,
- reasonable error handling,
- no secret leakage,
- tests for important security and data-boundary behavior.

## 13. Non-goals

Not required for the first release:

- full enterprise RBAC,
- refresh token rotation,
- password reset/email verification,
- full multi-tenant Inventory/Payment partitioning,
- Kubernetes,
- Terraform,
- DLQ/retry platform redesign,
- multi-agent AI,
- conversational long-term memory,
- real payment provider integration,
- production-grade billing/quotas.

## 14. Phase 0 security/quality gate

Before leaving Phase 0:

- Existing service tests still pass.
- Cross-tenant order/Saga lookups return 404.
- No hardcoded JWT/database/demo passwords remain in tracked deployment configuration; `.env` is ignored and `.env.example` contains placeholders only.
- Local Compose still starts successfully.

## 15. Final acceptance test

A reviewer should be able to:

1. log in as an Acme user;
2. place an order;
3. force a payment failure in demo mode;
4. observe inventory compensation and Saga cancellation;
5. restart the Saga service;
6. still retrieve the Saga history;
7. log in as a Beta user;
8. receive 404 when attempting to retrieve Acme's order/Saga by ID;
9. open the Copilot;
10. ask why the order failed;
11. receive an answer grounded in live order/Saga facts plus retrieved operational knowledge.

If all of the above works, the project has reached the **showable checkpoint**. Further polish is optional.
