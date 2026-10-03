# StockSync — Production Deployment Guide

This guide documents how the StockSync demo is **currently deployed**.

## 1. Production URLs

| Service | URL |
|---|---|
| Frontend | https://stocksync-nine.vercel.app |
| Backend API Gateway | https://stocksync-a8qw.onrender.com |
| Health check | https://stocksync-a8qw.onrender.com/health |

## 2. Production providers

| Provider | Role |
|---|---|
| Vercel | Frontend hosting (Next.js) |
| Render | Backend/API Gateway deployment |
| MongoDB Atlas | MongoDB (auth, orders, sagas) |
| Aiven | PostgreSQL (Inventory Service) |
| Aiven | Valkey / Redis-compatible cache |
| Aiven | Apache Kafka (event bus) |

## 3. Production topology

```text
Browser
  ↓
Vercel-hosted Next.js frontend
  ↓ HTTPS (TLS terminated by Render platform edge)
Render public API Gateway endpoint
  ↓ private network
backend services
```

- The frontend is deployed on Vercel and communicates **directly** with the
  existing API Gateway. There is no frontend BFF and no Next.js server-side
  API proxy.
- TLS for the public API endpoint is terminated by Render's platform edge.
- The API Gateway is the public application/authentication boundary.
- Internal backend services (Order, Inventory, Payment, Saga Orchestrator) are
  not directly exposed to the browser.

## 4. Backend deployment model

Render deploys the backend as a single container from the `main` branch.
The container entrypoint is `deploy/render/start.sh`, which launches all five
backend services in single-container mode:

1. **API Gateway** — public entry point; binds to the platform-injected `$PORT` (Render provides this) and falls back to `API_GATEWAY_PORT` then 3000 when unset.
2. **Order Service** — tenant-scoped orders; runs on port 3001
3. **Inventory Service** — shared catalog and inventory; runs on port 3002
4. **Payment Service** — demo-controlled payment processing; runs on port 3003
5. **Saga Orchestrator** — distributed transaction coordinator; runs on port 3004

Internal services communicate via `localhost` within the container using the
`_SERVICE_URL` environment variables. Kafka, Valkey/Redis, MongoDB, and
PostgreSQL are supplied by the configured production infrastructure providers.

**Note:** `docker-compose.production.yml` documents a historical VM-oriented
multi-container deployment path and is **not** the current production runtime.
Local Docker Compose (`docker-compose.yml`) is used only for local development.

## 5. Frontend deployment

- **Framework:** Next.js App Router + TypeScript + Tailwind CSS + shadcn/ui
- **Hosting:** Vercel
- **API communication:** Direct browser-to-API-Gateway over HTTPS
- **Configuration:** The API base URL is set via `NEXT_PUBLIC_API_BASE_URL`
- **No BFF:** The frontend does not proxy API requests server-side
- **JWT storage:** Stored in browser `localStorage` as a documented demo tradeoff (see ADR-013)

## 6. Environment-variable contract

| Variable | Location | Purpose | Required | Secret |
|---|---|---|---|---|
| `NEXT_PUBLIC_API_BASE_URL` | Vercel (frontend) | Frontend API base URL | Yes | No |
| `API_GATEWAY_PORT` | Render (API Gateway) | Gateway listen port | No | No |
| `JWT_SECRET` | Render (API Gateway) | JWT signing key | Yes | Yes |
| `API_GATEWAY_MONGO_URI` | Render (API Gateway) | MongoDB connection for auth | Yes | Yes |
| `REDIS_URL` | Render (API Gateway) | Redis connection for rate limiting | Yes | Yes |
| `INVENTORY_SERVICE_URL` | Render (API Gateway) | Internal Inventory Service URL | Yes | No |
| `ORDER_SERVICE_URL` | Render (API Gateway) | Internal Order Service URL | Yes | No |
| `SAGA_SERVICE_URL` | Render (API Gateway) | Internal Saga Service URL | Yes | No |
| `SEED_ACME_ADMIN_PASSWORD` | Render (API Gateway) | Seed password for Acme admin | Yes | Yes |
| `SEED_ACME_USER_PASSWORD` | Render (API Gateway) | Seed password for Acme user | Yes | Yes |
| `SEED_BETA_ADMIN_PASSWORD` | Render (API Gateway) | Seed password for Beta admin | Yes | Yes |
| `SEED_BETA_USER_PASSWORD` | Render (API Gateway) | Seed password for Beta user | Yes | Yes |
| `ORDER_SERVICE_PORT` | Render (Order Service) | Order Service listen port | No | No |
| `ORDER_MONGO_URI` | Render (Order Service) | MongoDB connection for orders | Yes | Yes |
| `KAFKA_BROKER` | Render (Order, Inventory, Payment, Saga) | Kafka bootstrap server | Yes | No |
| `KAFKA_SASL_USERNAME` | Render (Order, Inventory, Payment, Saga) | Kafka SASL username | Yes | Yes |
| `KAFKA_SASL_PASSWORD` | Render (Order, Inventory, Payment, Saga) | Kafka SASL password | Yes | Yes |
| `KAFKA_SASL_MECHANISM` | Render (Order, Inventory, Payment, Saga) | Kafka SASL mechanism | No | No |
| `KAFKA_CA_CERT_B64` | Render (Order, Inventory, Payment, Saga) | Base64 Kafka CA certificate | Yes | Yes |
| `INVENTORY_SERVICE_PORT` | Render (Inventory Service) | Inventory Service listen port | No | No |
| `DATABASE_URL` | Render (Inventory Service) | PostgreSQL connection string | Yes | Yes |
| `PAYMENT_SERVICE_PORT` | Render (Payment Service) | Payment Service listen port | No | No |
| `DEMO_MODE` | Render (Payment Service) | Enable deterministic demo behavior | No | No |
| `SAGA_SERVICE_PORT` | Render (Saga Orchestrator) | Saga Service listen port | No | No |
| `SAGA_MONGO_URI` | Render (Saga Orchestrator) | MongoDB connection for sagas | Yes | Yes |
| `GEMINI_API_KEY` | Render (API Gateway) | LLM API key for Copilot | Yes | Yes |
| `GEMINI_LLM_MODEL` | Render (API Gateway) | LLM model name for Copilot | No | No |

Total: 27 environment variables (26 backend + 1 frontend).

## 7. Demo-specific configuration

Production runs with `DEMO_MODE=true` for deterministic payment behavior:

| paymentMode | DEMO_MODE result | Published event |
|---|---|---|
| `SUCCESS` | Payment approved | `payment.processed` |
| `PREPAID` | Payment approved (backward compatibility) | `payment.processed` |
| `FAIL` | Payment declined (forced failure) | `payment.failed` |
| other | Payment declined | `payment.failed` |

## 8. Seeded demo users

The following four demo users are seeded on startup:

- `admin@acme.stocksync`
- `user@acme.stocksync`
- `admin@beta.stocksync`
- `user@beta.stocksync`

Passwords are supplied through deployment environment variables
(`SEED_ACME_ADMIN_PASSWORD`, etc.). Passwords are **not** committed to the
repository. Startup fails if required seed passwords are not set rather than
falling back to source-code defaults.

## 9. Production demo flow

```text
Login
  → Orders
  → Order Detail
  → Ask Copilot
  → grounded answer with live Order/Saga facts + source attribution
```

**Successful payment path:**

```text
paymentMode: SUCCESS
  → payment processed
  → Saga COMPLETED
  → Order CONFIRMED
```

**Failure payment path:**

```text
payment failure (paymentMode: FAIL)
  → Saga compensation (inventory released)
  → Saga CANCELLED
  → Order CANCELLED
```

**Tenant isolation:**

```text
Acme order
  → log out
  → log in as Beta
  → same Acme order → "Order not found" (404)
```

## 10. Deployment/update procedure

- The Render backend service tracks the `main` branch. Merging changes to
  `main` triggers a Render deployment when automatic deploy is enabled.
- If automatic deployment is disabled, trigger a deploy manually through the
  Render service dashboard.
- The Vercel frontend deploys from its connected repository/branch according
  to the Vercel project configuration.
- Frontend and backend deployments are independent; updating one does not
  require redeploying the other.

## 11. Health and production verification

Health endpoint:

```
https://stocksync-a8qw.onrender.com/health
```

Production verification should cover:

- `GET /health` returns 200
- Login succeeds with seeded credentials, returns a JWT
- `GET /orders` returns tenant-scoped order list
- `GET /orders/:orderId` returns order details
- `POST /copilot/ask` returns a grounded answer with `sources` and `liveFactsUsed`
- `paymentMode: SUCCESS` → `payment.processed` published → Saga `COMPLETED` → Order `CONFIRMED`
- `paymentMode: FAIL` → `payment.failed` published → Saga `CANCELLED` → Order `CANCELLED`
- Cross-tenant order lookup returns 404
- Logout clears the JWT and prevents further authenticated requests

## 12. Local vs production

### Local

- Docker Compose (`docker-compose.yml`) runs all services locally
- Local environment variables (see `.env.example`)
- Frontend runs separately with `NEXT_PUBLIC_API_BASE_URL` pointing to the
  local gateway

### Production

- Vercel frontend
- Render backend (single container, `deploy/render/start.sh`)
- MongoDB Atlas (MongoDB)
- Aiven PostgreSQL (Inventory Service)
- Aiven Valkey (Redis)
- Aiven Apache Kafka (event bus)

`docker-compose.production.yml` is a historical VM-oriented deployment path
and is **not** the current production runtime.
