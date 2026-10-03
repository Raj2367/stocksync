# StockSync — Current Repository Baseline

**Verified:** 2026-10-03 for the frontend/deployment portions. Non-frontend items retain their 2026-09-28 verification status.

> Re-verified on 2026-10-03 to incorporate the completed frontend deployment phase (Phase 1).
> The frontend application is now present under `frontend/` and deployed to Vercel.

The current repo baseline includes:

- `docker-compose.yml` publishing 2181, 9092, 5432, 27017, 6379, and application ports 3000–3004 for local development.
- Gateway auth implemented with an in-memory `Map`, plaintext passwords, and open `/auth/register`.
- JWT middleware currently exposes `userId`, `email`, and `role` only.
- Orders currently lack `tenantId`.
- Saga state is currently held in an in-memory `Map`.
- Payment processing is currently randomized at roughly 70% approval.
- `docker-compose.yml` currently contains hardcoded development secrets/credentials such as `JWT_SECRET` and the Postgres password; moving these to environment variables is approved Phase 0 work.
- The repo must preserve only `.env.example` templates in source control; actual `.env` files and deployment secrets are not part of the baseline deliverable.

### Frontend (added 2026-10-03)

- A separate Next.js App Router + TypeScript frontend is implemented under `frontend/`.
- The frontend communicates directly with the existing public API Gateway (no BFF).
- JWT login through `POST /auth/login`; tenant context derived from the verified backend JWT.
- Authenticated Orders list at `/`, Order Detail at `/orders/[orderId]`, and a single-shot Copilot page at `/copilot`.
- Frontend is deployed to Vercel at https://stocksync-nine.vercel.app.
- Backend API Gateway is the existing public Render deployment at https://stocksync-a8qw.onrender.com.
- 401/403 session invalidation is handled client-side by redirecting to `/login`.

This file is intentionally a baseline, not a desired-state document. Desired behavior is defined by `docs/REQUIREMENTS.md`, `docs/ARCHITECTURE.md`, and `DECISIONS.md`.

Reference files:

- https://raw.githubusercontent.com/Raj2367/stocksync/main/docker-compose.yml
- https://raw.githubusercontent.com/Raj2367/stocksync/main/services/api-gateway/src/routes/auth.ts
- https://raw.githubusercontent.com/Raj2367/stocksync/main/services/api-gateway/src/middleware/auth.ts
- https://raw.githubusercontent.com/Raj2367/stocksync/main/services/order-service/src/models/Order.ts
- https://raw.githubusercontent.com/Raj2367/stocksync/main/services/saga-orchestrator/src/saga/store.ts
- https://raw.githubusercontent.com/Raj2367/stocksync/main/services/payment-service/src/events/consumer.ts
