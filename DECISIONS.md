# StockSync — Architecture Decisions

Date baseline: 2026-09-28

## ADR-001 — RAG use case

**Decision:** Build a **Tenant-scoped Order Operations Copilot**.

The copilot answers operational questions by combining:

1. exact live facts from the existing Order/Saga services; and
2. semantic retrieval over operational knowledge such as failure runbooks, Saga behavior, inventory compensation rules, and troubleshooting guidance.

**Why:** Pure RAG over structured orders/inventory would be a weak use of vector search. The hybrid design demonstrates RAG while respecting transactional data boundaries.

## ADR-002 — Tenancy scope

**Decision:** Implement minimum viable tenant isolation only for:

- users/JWT identity,
- orders,
- sagas,
- tenant-owned RAG knowledge.

The product catalog remains shared. Inventory and Payment remain shared/global for this demo.

**Security rule:** The gateway derives `tenantId` from the verified JWT and overwrites any client-supplied `X-Tenant-Id` header.

## ADR-003 — Demo users

**Decision:** Disable open self-registration and seed two tenants with two users each:

- `tenant-acme`: one `ADMIN`, one `USER`
- `tenant-beta`: one `ADMIN`, one `USER`

Seed passwords are supplied through environment variables. Local development examples live only in `.env.example`; real `.env` files are ignored and never committed. Production/deployed startup must fail clearly if required seed passwords are missing rather than falling back to source-code defaults. Seed passwords are never printed or committed.

## ADR-004 — Authentication persistence

**Decision:** Store gateway users in MongoDB using bcrypt password hashes.

**Why:** The existing in-memory/plaintext user store is not credible for a deployed demo and prevents durable tenant identity.

## ADR-005 — Saga persistence

**Decision:** Persist Saga state in MongoDB instead of the current in-memory `Map`.

**Why:** Saga history must survive a service restart and remain queryable for the demo and the Copilot.

## ADR-006 — Deterministic payment demo mode

**Decision:** Carry a `paymentMode` field through the Kafka event chain. The Payment Service honors forced success/failure only when `DEMO_MODE=true`.

**Why:** HTTP headers do not survive asynchronous Kafka processing. The mode must travel with the event. Determinism is necessary for a repeatable interview demo.

## ADR-007 — Product catalog

**Decision:** Keep the catalog shared across tenants.

**Why:** Shared catalog is a legitimate SaaS design and avoids unnecessary tenant propagation into Inventory.

## ADR-008 — Deployment exposure

**Decision:** In the deployed configuration, only the public TLS edge/reverse proxy is internet-reachable. The API Gateway, internal application services, databases, Kafka, and ZooKeeper remain private to the deployment network.

**Why:** Internal components must not be reachable directly with a forged tenant header or other bypass of gateway auth, and an HTTPS frontend cannot safely call a plain-HTTP public gateway without a TLS edge.

## ADR-009 — RAG infrastructure principle

**Decision:** Prefer existing infrastructure over a new vector database or service. Do not add a separate database server merely for RAG.

**Constraint:** Transactional order/inventory data stays behind existing service APIs; the Copilot does not read another service's transactional tables directly.

**Implementation status:** The concrete vector-storage option is resolved by ADR-011 and is no longer deferred.

## ADR-010 — Framework restraint

**Decision:** No Python, LangChain/LangGraph-style orchestration, agent framework, or multi-agent architecture in the first release.

**Why:** The developer has not previously built RAG or used LLM APIs. A direct TypeScript implementation is easier to understand, debug, and defend in interviews.

## ADR-011 — Vector storage for RAG

**Status:** Accepted; canonical decision record is [`docs/ADR-011-VECTOR-STORE.md`](docs/ADR-011-VECTOR-STORE.md).

The detailed options, decision rule, and Phase 2 acceptance criteria live in the linked ADR only; do not duplicate its full text here. This ADR is resolved and records the selected v1 architectural choice.

## ADR-012 — Public TLS edge (deployment)

**Status:** Approved for deployment planning; implementation deferred to the deployment phase.

**Decision:** Put a small TLS-terminating reverse proxy/public edge in front of the API Gateway. The public edge is the only internet-facing component; the API Gateway and all internal services/data stores remain private to the deployment network. HTTPS terminates at the edge and traffic is forwarded to the gateway over the private network.

**Why:** A browser-hosted frontend must not call a plain-HTTP gateway from an HTTPS origin. A public TLS edge avoids mixed-content failures while preserving the gateway as the authentication and application boundary.

See [`docs/ADR-012-PUBLIC-TLS-EDGE.md`](docs/ADR-012-PUBLIC-TLS-EDGE.md).

## Decision precedence rule

An **approved ADR supersedes older requirement text** when the two conflict. After approving an ADR, update `docs/REQUIREMENTS.md` and `docs/ARCHITECTURE.md` to match so the repository returns to a single coherent source of truth. Pending ADRs do not supersede the approved requirements.
