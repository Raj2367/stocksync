# ADR-013 — Frontend Architecture

## Status

**Accepted**

## Context

The StockSync demo currently has no browser frontend. Operators interact with the system exclusively via Postman/curl against the API Gateway. Phase 1 of `docs/PHASE_PLAN.md` described a "Minimal frontend" with an inventory list/search, place-order form, order status, and a Copilot panel placeholder.

That plan is superseded by this ADR. The frontend must be presentable to an interviewer and must drive the full core demo journey through the browser, including the Copilot workflow.

## Decision

Build a **separate Next.js application** in a new top-level `frontend/` directory.

- **Framework:** Next.js (App Router) with TypeScript.
- **Styling:** Tailwind CSS with shadcn/ui.
- **API access:** Communicate directly with the existing API Gateway. No Backend-for-Frontend (BFF) layer.
- **Authentication:** Use the existing JWT login API (`POST /auth/login`). The JWT is stored in the browser.
- **Tenant context:** Derived exclusively from the authenticated JWT. The frontend must never allow the user to choose or override `tenantId`.
- **Copilot:** First-class workflow, not a placeholder. Exposes `POST /copilot/ask { question, orderId? }` and renders the grounded answer with source attribution and live-fact indicators.

### Request flow

```
Browser
  │
  │ HTTPS
  ▼
Next.js Frontend
  │
  │ HTTPS API requests
  ▼
Public TLS edge / API Gateway
  │
  ├── Auth
  ├── Orders
  ├── Inventory
  └── Copilot
       │
       ├── tenant-scoped knowledge retrieval
       ├── live Order facts
       ├── live Saga facts
       └── Gemini
```

The primary demo journey:

1. **Login** — user authenticates against `POST /auth/login`, receives a JWT.
2. **Orders list** — authenticated GET `/orders` returns orders for the JWT tenant.
3. **Order detail** — authenticated GET `/orders/:orderId` returns a specific order.
4. **Ask Copilot** — authenticated POST `/copilot/ask { question, orderId }` returns a grounded answer with `sources` and `liveFactsUsed`.

## Out of scope

- No fake analytics or fabricated business metrics.
- No enterprise-scale dashboard.
- No BFF/backend-for-frontend layer.
- No unnecessary state-management infrastructure (e.g., Redux, Zustand) beyond minimal React context/hooks for auth state.
- No replacement or redesign of existing backend APIs.
- No implementation in this ADR; this records the architecture decision only.

## Consequences

- The frontend is developed and deployed independently from the API Gateway.
- CORS must be configured on the Gateway to allow the deployed frontend origin.
- The browser stores the JWT in `localStorage` (or an httpOnly cookie with cross-origin limitations documented). This is an explicit security tradeoff of the demo: `localStorage` is simpler for an interview demo but vulnerable to XSS. This is documented here, not redesigned in the backend.
- The frontend must gracefully handle API loading, error, empty, and Render cold-start states in every component.
- A small typed API layer (e.g., `lib/api.ts`) centralizes `fetch` calls so UI components do not scatter raw HTTP calls.

## Implementation notes

- The deployed API is the existing Render-hosted API Gateway (ADR-012 edge).
- The frontend will be deployed separately (e.g., Vercel) and served as static/SSR output.
- `X-Tenant-Id` is never set by the frontend from user input; the gateway derives it from the verified JWT (ADR-002).
- Live order/Saga facts are fetched server-side by the Gateway Copilot route; the frontend only renders the structured `liveFactsUsed` flags and sources returned in the JSON response.
- Cold-start handling: Render may spin up the Gateway after inactivity; the frontend should display a loading state and retry transient 5xx responses.

## Related decisions

- [ADR-002 — Tenancy scope](DECISIONS.md#adr-002--tenancy-scope): tenant context originates from the verified JWT.
- [ADR-008 — Deployment exposure](DECISIONS.md#adr-008--deployment-exposure): only the public TLS edge is internet-reachable; the frontend is accessed through the edge.
- [ADR-011 — Vector storage for RAG](docs/ADR-011-VECTOR-STORE.md): RAG uses existing infrastructure (MongoDB), not a separate vector database.
- [ADR-012 — Public TLS edge](docs/ADR-012-PUBLIC-TLS-EDGE.md): the public TLS edge fronts the API Gateway; the browser-hosted frontend uses HTTPS through this edge.

---

> **Supersedes:** The "Minimal frontend" description currently in `docs/PHASE_PLAN.md`, Phase 1. Phase 1 will be updated to point to this ADR in a follow-up documentation change. This ADR is a documentation supersession only; `docs/PHASE_PLAN.md` is not modified in this task.
