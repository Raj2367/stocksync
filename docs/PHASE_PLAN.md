# StockSync — Phase Plan

This is the execution-level roadmap. Kilo tasks must be kept small for token efficiency, but multiple small tasks are grouped into a single coherent Git commit. Do not create a commit after every Kilo task. Later-phase prompts are intentionally not pre-written; they are generated when that phase is reached so they reflect the actual implementation and deployment findings.

## Phase 0 — Demo credibility hardening

**Target:** 6–8 focused hours

Plan a full working day if returning to the codebase after a break; the estimate is a planning range, not a deadline.

### 0A — Mongo-backed gateway authentication

**Task 0A.1 — Dependencies + Mongo connection + User model**
- Add `mongoose` and `bcryptjs` to the API Gateway.
- Add the Mongo connection module and connect before HTTP startup.
- Create the `User` model with `userId`, `email`, `passwordHash`, `tenantId`, `role`, and timestamps.

**Task 0A.2 — Login + JWT + remove registration**
- Move login from the in-memory user map to Mongo + bcrypt.
- Put `userId`, `email`, `tenantId`, and `role` in the JWT.
- Update JWT types/middleware so `req.user` contains `tenantId` and `role`.
- Remove public self-registration.

**Task 0A.3 — Seed demo users**
- Seed two tenants (`tenant-acme`, `tenant-beta`) with one `ADMIN` and one `USER` each when the collection is empty.
- Read seed passwords from environment variables; do not log them or their hashes.
- Missing required seed passwords must fail startup rather than invent credentials.

**Task 0A.4 — Auth verification**
- Add/update focused tests for successful login, wrong password, unknown email, JWT `tenantId`/`role`, no plaintext password persistence, and unavailable registration.
- Run the gateway build and Jest command from `AGENTS.md`.

**Git checkpoint:** `feat(auth): move gateway users to MongoDB`

### 0B — Tenant-scoped Orders + Kafka event contract

**Task 0B.1 — Trusted tenant propagation + Order isolation**
- Gateway derives `tenantId` from the verified JWT and overwrites client-supplied `X-Tenant-Id`.
- Order Service stores `tenantId` and filters all order reads by it.
- Cross-tenant order lookup returns **404**, not 403.

**Task 0B.2 — Shared event payload changes**
- Add `tenantId` and `paymentMode` to the `order.created` payload.
- Carry both fields through the existing Kafka event chain wherever needed by Saga/Payment.
- Keep the product catalog shared; do not add tenancy to Inventory or Payment data models.

**Task 0B.3 — Tenant/event tests**
- Verify a client cannot override the tenant context.
- Verify Acme/Beta order isolation and 404 behavior.
- Verify the updated event payload contract.

**Git checkpoint:** `feat(auth): enforce tenant-scoped order access`

### 0C — Persistent, tenant-scoped Saga

**Task 0C.1 — Mongo Saga persistence**
- Replace the in-memory Saga `Map` with a Mongo-backed model/store.
- Persist `tenantId` and the payment/demo fields required by the event contract.

**Task 0C.2 — Tenant-scoped Saga API + restart verification**
- Scope `GET /sagas` and `GET /sagas/:orderId` by `tenantId`.
- Cross-tenant lookups return **404**.
- Verify durability with `docker compose restart saga-orchestrator`, not just a process kill, because Compose restart policy affects lifecycle behavior.

**Rollback note:** if Mongo persistence causes an unexpected regression, revert only the Saga persistence change and preserve the already-completed auth/order changes; do not broaden the rollback.

**Git checkpoint:** `feat(saga): persist tenant-scoped saga history`

### 0D — Deterministic payment demo

**Task 0D.1 — Demo-mode payment behavior**
- Honor `paymentMode` only when `DEMO_MODE=true`.
- Support deterministic failure for the interview demo while preserving normal mock behavior outside demo mode.
- Configure `DEMO_MODE` for Order and Payment services.
- Add focused tests for forced failure and normal behavior.

**Git checkpoint:** `feat(payment): add deterministic demo payment mode`

### 0E — Secrets + deployment-safe Compose

**Task 0E.1 — Remove committed secrets**
- Replace committed `JWT_SECRET`, Postgres credentials, and other deployment-sensitive values in the Order Service, Inventory Service, Saga Orchestrator, and root Postgres/Kafka/Mongo/Redis Compose blocks with environment references.
- Keep development examples only in `.env.example`.
- Confirm `.env` is ignored.

**Task 0E.2 — Deployment Compose topology**
- Prepare the deployment configuration so only the public TLS edge is externally reachable.
- Internal services and infrastructure remain private to the container/network boundary.
- Do not redesign the TLS edge itself here; ADR-012 covers that.

**Git checkpoint:** `chore(infra): secure deployment configuration`

### 0F — Phase 0 acceptance check

Run the complete path:

1. Login as Acme.
2. Create an order.
3. Force payment failure.
4. Verify inventory compensation and Saga cancellation.
5. Run `docker compose restart saga-orchestrator`.
6. Verify Saga history still exists.
7. Login as Beta.
8. Attempt to access the Acme order/Saga and verify **404**.
9. Run the existing test suite/builds required by the source of truth.

### Phase 0 STOP checkpoint

Once the acceptance path passes, **stop infrastructure hardening**. Do not continue improving the microservices before moving to frontend/RAG work.

---

## Phase 0.5 — Deployment feasibility spike

**Target:** 1–2 focused hours

Do this immediately after Phase 0, while the stack is still small.

### Scope

- Select a realistic no-cost deployment target.
- Deploy or bootstrap the Phase 0 stack.
- Verify available memory/CPU and container limits.
- Verify the public TLS edge can terminate HTTPS and forward to the private gateway.
- Verify Mongo/Postgres/Redis/Kafka connectivity inside the private network.
- Record the chosen host/proxy and free-tier constraints.

### Exit gate

A minimal Phase 0 deployment is technically feasible. If it is not, change the deployment target before frontend polish.

---

## Phase 1 — Frontend

This phase implements the StockSync frontend as defined by
[docs/ADR-013-FRONTEND-ARCHITECTURE.md](docs/ADR-013-FRONTEND-ARCHITECTURE.md).

### Scope

- Separate top-level `frontend/` application.
- Next.js App Router + TypeScript.
- Tailwind CSS + shadcn/ui.
- Direct browser-to-existing API Gateway communication (no BFF).
- JWT login through `POST /auth/login`.
- Tenant context derived exclusively from the authenticated backend JWT/session flow.
- Authenticated Orders list.
- Order Detail page with order status/saga status details and handoff to the Order Operations Copilot via optional `orderId` context.
- Single-shot Order Operations Copilot page with optional `orderId` context.
- Live order/saga fact indicators and source attribution on Copilot answers.
- Demo-only force-payment-failure control when `DEMO_MODE=true` — deferred; not implemented in the current frontend phase.
- 401/403 session invalidation handling.
- Production deployment to Vercel.

### Exit gate

**Implemented.** A new browser session can complete the ADR-013 demo journey:

Login → Orders list → Order detail → Ask Copilot → grounded answer with live-fact indicators and source attribution

The frontend is deployed at https://stocksync-nine.vercel.app, communicating directly with the existing public API Gateway at https://stocksync-a8qw.onrender.com.

---

## Phase 2 — RAG foundation

**Target:** 3–4 hours

### Scope

- define a small operational knowledge corpus
- include at least one materially different tenant-specific document for each demo tenant plus shared docs
- implement a simple chunking helper
- choose embedding and LLM providers after checking current free-tier quotas/terms
- choose vector storage under ADR-011 after the same feasibility check
- attach tenant metadata to knowledge chunks
- implement similarity retrieval
- add retrieval tests

### Provider fallback rule

Before implementation, identify **one primary and one fallback** for the LLM and embedding provider. Record both in ADR-011/Phase 2 notes. If the primary free tier is unsuitable for testing because of quota, signup, or availability constraints, switch to the fallback without redesigning the application contract.

### Exit gate

A test query returns the expected tenant-scoped knowledge chunks, and the chosen provider can support repeated development/testing without requiring paid usage.

---

## Phase 3 — Order Operations Copilot

**Target:** 4–5 hours

### Scope

- authenticated `POST /copilot/ask` endpoint
- request shape: `{ question, orderId? }`
- fetch live order/Saga facts through existing service APIs
- perform tenant-scoped semantic retrieval
- build a grounded prompt with explicit data delimiters
- call the selected free-tier LLM from Node/TypeScript
- return a concise explanation with operational guidance
- negative tests for cross-tenant order/retrieval access
- stricter per-tenant Copilot rate limit via Redis

### Exit gate

A question about a real order produces a grounded response using both live transactional data and retrieved knowledge.

---

## Phase 4 — Deployment

**Target:** 3–4 hours

### Scope

- public frontend
- public HTTPS TLS edge / reverse proxy
- private gateway and internal services/data stores
- environment variables/secrets
- health checks
- deployment README
- live smoke test

### Exit gate

An interviewer can open the public URL and complete the core demo.

---

## Phase 5 — Polish + interview readiness

**Target:** 2–3 hours

### Scope

- loading/error states
- concise README demo instructions
- architecture diagram update if implementation changed
- AI_NOTES.md
- final test run
- 2-minute demo script
- resume/project wording
- capture one real RAG trace for discussion

### Exit gate

The project is easy to explain in a 2-minute demo and every major architectural claim is backed by code.

---

## Overall target

**Planned effort:** roughly 22–30 focused hours, including the deployment feasibility spike.

Treat the timeline as a planning range. The hard constraint is to stop once each phase exit gate passes.

The project should be considered successful at the end of Phase 4. Phase 5 is polish.
