# Deployment Gaps

## 1. Current Repository State

### 1.1 Deployment Artifacts

| Artifact | Status | Source |
|---|---|---|
| Root `.dockerignore` | Present | [.dockerignore] |
| Render Dockerfile (`deploy/render/Dockerfile`) | Present | [deploy/render/Dockerfile] |
| Render launcher (`deploy/render/start.sh`) | Present | [deploy/render/start.sh] |
| `.env.example` | Present | [.env.example] |
| `.env.production.example` | Present | [.env.production.example] |
| `render.yaml` or `render.json` | Missing | No file found in repository root or `deploy/render/` |
| `.nvmrc` | Missing | No file found anywhere in repository |
| `engines.node` in service `package.json` | Missing | All five service `package.json` files lack an `engines` field [services/api-gateway/package.json:1-34] |

### 1.2 Build Configuration

The Render Dockerfile uses a multi-stage build:
- **Builder stage** (`FROM node:20-alpine AS builder`): installs deps with `npm ci`, compiles TypeScript with `npm run build` for all five services.
- **Runtime stage** (`FROM node:20-alpine AS runtime`): installs production dependencies with `npm ci --omit=dev`, copies `dist/` from builder, and uses `CMD ["/app/deploy/render/start.sh"]`.

There is no `render.yaml` or equivalent provider descriptor. The Dockerfile path must be explicitly specified as the build configuration if required by the hosting platform.

### 1.3 Current Build Command

The repository does not define an explicit build command file. The Render Dockerfile performs the build internally.

### 1.4 Current Runtime Packaging

- Runtime stage sets `ENV NODE_ENV=production` [deploy/render/Dockerfile:40].
- The container entrypoint is `CMD ["/app/deploy/render/start.sh"]` [deploy/render/Dockerfile:68].
- The `start.sh` launcher starts all five services as background processes within one container [deploy/render/start.sh:17-47].
- Only the API Gateway's container port 3000 is documented via `EXPOSE 3000` [deploy/render/Dockerfile:66]. This directive documents the container port; it does not itself publish a host port.

## 2. Render Deployment Requirements

### 2.1 Build Context

The build context is the repository root. The root `.dockerignore` excludes `.git/`, `.kilo/`, `node_modules`, `dist`, `coverage`, `.env*`, `.DS_Store`, log files, `.vscode/`, and `.idea/` [.dockerignore].

### 2.2 Dockerfile Path

The Dockerfile is at `deploy/render/Dockerfile`. The hosting platform must be configured to use this path explicitly.

### 2.3 Build Command

The Dockerfile handles the build internally. No separate build command is specified in any provider descriptor.

### 2.4 Runtime Command / Entrypoint

The runtime entrypoint is `deploy/render/start.sh` [deploy/render/Dockerfile:68]. It starts five Node.js processes in a single container.

### 2.5 Port Behavior

- `EXPOSE 3000` documents the container port [deploy/render/Dockerfile:66]. It does not itself publish a host port.
- The Gateway listens on the container PORT when provided, otherwise it falls back to API_GATEWAY_PORT and then 3000.
- Gateway uses `PORT="${PORT:-${API_GATEWAY_PORT:-3000}}"` for its listener [deploy/render/start.sh:47].

### 2.6 Health Check

The API Gateway exposes `GET /health` [services/api-gateway/src/index.ts:23] which checks internal services via HTTP at `/health` endpoints on Order, Inventory, and Saga services [services/api-gateway/src/routes/health.ts:17-31].

The repository does not include a `healthcheck` directive in the Render Dockerfile. A provider-level health check must be configured separately — see Section 6.

### 2.7 Single-Container Process Model

All five services run as Node.js child processes within one container [deploy/render/start.sh:17-47]. The launcher:
- Exports internal service URLs to `127.0.0.1` with per-service ports [deploy/render/start.sh:5-7].
- Assigns per-process `PORT` and `MONGO_URI` inline on each launch line [deploy/render/start.sh:17,21,25,29,47].

### 2.8 Internal Service URLs

The launcher exports three internal URLs defaulting to localhost:
- `ORDER_SERVICE_URL` → `http://127.0.0.1:3001` [deploy/render/start.sh:5]
- `INVENTORY_SERVICE_URL` → `http://127.0.0.1:3002` [deploy/render/start.sh:6]
- `SAGA_SERVICE_URL` → `http://127.0.0.1:3004` [deploy/render/start.sh:7]

Order Service calls these for HTTP compensation [services/saga-orchestrator/src/saga/engine.ts:9-11]. API Gateway uses them for `/health` checks [services/api-gateway/src/routes/health.ts:7-11].

### 2.9 External Infrastructure Endpoints

| Service | Required Container Input | Default in Application | Notes |
|---|---|---|---|
| MongoDB | `MONGO_URI` (per-process derived) | Varies [services/order-service/src/index.ts:12][services/saga-orchestrator/src/db/mongo.ts:3] | Three separate databases: auth, orders, sagas |
| PostgreSQL | `DATABASE_URL` | `postgresql://stocksync:stocksync@postgres:5432/inventory` [services/inventory-service/src/db/connection.ts:4] | Inventory service |
| Redis | `REDIS_URL` | `redis://localhost:6379` [services/api-gateway/src/db/redis.ts:3] | Rate limiting and Copilot |
| Kafka | `KAFKA_BROKER` | `kafka:29092` [services/payment-service/src/events/producer.ts:3] | Event streaming |

### 2.10 Required Runtime Environment Variables

**Container Inputs (operator-supplied):**

| Variable | Consumed By | Required? | Launcher Default |
|---|---|---|---|
| `API_GATEWAY_MONGO_URI` | API Gateway (via `MONGO_URI`) | Yes | `mongodb://mongodb:27017/auth` [deploy/render/start.sh:47] |
| `API_GATEWAY_PORT` | API Gateway (via `PORT`) | No | Falls back to container `PORT`, then `3000` [deploy/render/start.sh:47] |
| `ORDER_MONGO_URI` | Order Service (via `MONGO_URI`) | Yes | `mongodb://mongodb:27017/orders` [deploy/render/start.sh:17] |
| `ORDER_SERVICE_PORT` | Order Service (via `PORT`) | No | `3001` [deploy/render/start.sh:17] |
| `INVENTORY_SERVICE_PORT` | Inventory Service (via `PORT`) | No | `3002` [deploy/render/start.sh:21] |
| `DATABASE_URL` | Inventory Service | Yes | `postgresql://stocksync:stocksync@postgres:5432/inventory` [services/inventory-service/src/db/connection.ts:4] |
| `REDIS_URL` | API Gateway, Inventory | Yes | `redis://localhost:6379` [services/api-gateway/src/db/redis.ts:3] |
| `PAYMENT_SERVICE_PORT` | Payment Service (via `PORT`) | No | `3003` [deploy/render/start.sh:25] |
| `SAGA_SERVICE_PORT` | Saga Orchestrator (via `PORT`) | No | `3004` [deploy/render/start.sh:29] |
| `SAGA_MONGO_URI` | Saga Orchestrator (via `MONGO_URI`) | Yes | `mongodb://mongodb:27017/sagas` [deploy/render/start.sh:29] |
| `KAFKA_BROKER` | Order, Inventory, Payment, Saga | Yes | `kafka:29092` [services/order-service/src/events/producer.ts:3] |
| `DEMO_MODE` | Payment Service | Yes | No launcher default; `.env.production.example` sets `true` |
| `JWT_SECRET` | API Gateway | Yes | No default — app requires it [services/api-gateway/src/middleware/auth.ts:5] |
| `SEED_ACME_ADMIN_PASSWORD` | API Gateway | Yes | No default — required [services/api-gateway/src/db/seed.ts:51] |
| `SEED_ACME_USER_PASSWORD` | API Gateway | Yes | No default — required [services/api-gateway/src/db/seed.ts:51] |
| `SEED_BETA_ADMIN_PASSWORD` | API Gateway | Yes | No default — required [services/api-gateway/src/db/seed.ts:51] |
| `SEED_BETA_USER_PASSWORD` | API Gateway | Yes | No default — required [services/api-gateway/src/db/seed.ts:51] |

**Note on `KAFKA_BROKER`:** The launcher does not explicitly pass `KAFKA_BROKER` to child processes — it is inherited from the container environment. It has no per-process default in `start.sh`; the application source defaults to `kafka:29092` [services/order-service/src/events/producer.ts:3].

**Note on `REDIS_URL`:** The launcher does not pass `REDIS_URL` per-process — it is inherited from the container environment and used by both API Gateway [services/api-gateway/src/db/redis.ts:3] and Inventory Service [services/inventory-service/src/db/redis.ts:3].

**Note on `DATABASE_URL`:** Inventory Service consumes `DATABASE_URL` directly from the environment [services/inventory-service/src/db/connection.ts:4]. The launcher does not transform it — it is inherited from the container environment.

**Note on `DEMO_MODE`:** The launcher does not assign `DEMO_MODE` inline; the Payment Service inherits it from the container environment. If unset in the environment, it resolves to an empty string, and `PaymentService` treats empty as `false` [services/payment-service/src/config.ts:5].

**Note on JWT secret contract drift:** `.env.production.example` documents `API_GATEWAY_JWT_SECRET` as the variable name [`.env.production.example:11`], but the application reads `JWT_SECRET` [services/api-gateway/src/middleware/auth.ts:5]. The current `start.sh` does NOT map `API_GATEWAY_JWT_SECRET` to `JWT_SECRET`. This is a deployment mismatch — the operator must set `JWT_SECRET` directly, not `API_GATEWAY_JWT_SECRET`.

### 2.11 Provider Deployment Descriptor

No `render.yaml`, `render.json`, or equivalent configuration file exists. The deployment configuration must be set up separately through the hosting provider's UI or platform config.

## 3. Runtime Environment Contract

### 3A. Container Inputs

These are environment variables the deployment operator sets. The launcher either consumes them directly or passes them through via the container environment.

| Variable | Consumed By | Required? | Default (if any) | Documented in `.env.production.example`? |
|---|---|---|---|---|
| `API_GATEWAY_PORT` | Launcher → API Gateway `PORT` | No | `3000` [deploy/render/start.sh:47] | Yes [`.env.production.example:9`] |
| `API_GATEWAY_MONGO_URI` | Launcher → API Gateway `MONGO_URI` | Yes | `mongodb://mongodb:27017/auth` [deploy/render/start.sh:47] | Yes [`.env.production.example:12`] |
| `REDIS_URL` | Launcher → inherited by API Gateway & Inventory | Yes | `redis://localhost:6379` [services/api-gateway/src/db/redis.ts:3] | Yes [`.env.production.example:13`] |
| `SEED_ACME_ADMIN_PASSWORD` | API Gateway seed | Yes | No default — fail-closed [services/api-gateway/src/db/seed.ts:51] | Yes [`.env.production.example:18`] |
| `SEED_ACME_USER_PASSWORD` | API Gateway seed | Yes | No default — fail-closed [services/api-gateway/src/db/seed.ts:51] | Yes [`.env.production.example:19`] |
| `SEED_BETA_ADMIN_PASSWORD` | API Gateway seed | Yes | No default — fail-closed [services/api-gateway/src/db/seed.ts:51] | Yes [`.env.production.example:20`] |
| `SEED_BETA_USER_PASSWORD` | API Gateway seed | Yes | No default — fail-closed [services/api-gateway/src/db/seed.ts:51] | Yes [`.env.production.example:21`] |
| `ORDER_SERVICE_PORT` | Launcher → Order Service `PORT` | No | `3001` [deploy/render/start.sh:17] | Yes [`.env.production.example:26`] |
| `ORDER_MONGO_URI` | Launcher → Order Service `MONGO_URI` | Yes | `mongodb://mongodb:27017/orders` [deploy/render/start.sh:17] | Yes [`.env.production.example:27`] |
| `KAFKA_BROKER` | Launcher → inherited by all services | Yes | `kafka:29092` [services/payment-service/src/events/producer.ts:3] | Yes [`.env.production.example:28,35,42,50`] |
| `INVENTORY_SERVICE_PORT` | Launcher → Inventory Service `PORT` | No | `3002` [deploy/render/start.sh:21] | Yes [`.env.production.example:33`] |
| `DATABASE_URL` | Inventory Service (inherited) | Yes | `postgresql://stocksync:stocksync@postgres:5432/inventory` [services/inventory-service/src/db/connection.ts:4] | Yes [`.env.production.example:34`] |
| `PAYMENT_SERVICE_PORT` | Launcher → Payment Service `PORT` | No | `3003` [deploy/render/start.sh:25] | Yes [`.env.production.example:41`] |
| `DEMO_MODE` | Payment Service (inherited) | Yes (for deterministic demo) | Empty (treated as `false` by app) [services/payment-service/src/config.ts:5] | Yes [`.env.production.example:43-44` sets to `true`] |
| `SAGA_SERVICE_PORT` | Launcher → Saga Orchestrator `PORT` | No | `3004` [deploy/render/start.sh:29] | Yes [`.env.production.example:49`] |
| `SAGA_MONGO_URI` | Launcher → Saga Orchestrator `MONGO_URI` | Yes | `mongodb://mongodb:27017/sagas` [deploy/render/start.sh:29] | Yes [`.env.production.example:50`] |
| `JWT_SECRET` | API Gateway | Yes | No default — app requires it [services/api-gateway/src/middleware/auth.ts:5] | No — `.env.production.example` incorrectly documents `API_GATEWAY_JWT_SECRET` [`.env.production.example:11`] |

### 3B. Per-Process Derived Variables

These are variables produced internally by `deploy/render/start.sh`. The deployment operator should NOT set these directly merely because application code reads them.

| Derived Variable | Process(es) | How `start.sh` Derives It | Default | Operator Should Set Directly? |
|---|---|---|---|---|
| `MONGO_URI` | API Gateway | Inline assignment: `MONGO_URI="${API_GATEWAY_MONGO_URI:-mongodb://mongodb:27017/auth}"` [deploy/render/start.sh:47] | `mongodb://mongodb:27017/auth` | No — set `API_GATEWAY_MONGO_URI` instead |
| `MONGO_URI` | Order Service | Inline assignment: `MONGO_URI="${ORDER_MONGO_URI:-mongodb://mongodb:27017/orders}"` [deploy/render/start.sh:17] | `mongodb://mongodb:27017/orders` | No — set `ORDER_MONGO_URI` instead |
| `MONGO_URI` | Saga Orchestrator | Inline assignment: `MONGO_URI="${SAGA_MONGO_URI:-mongodb://mongodb:27017/sagas}"` [deploy/render/start.sh:29] | `mongodb://mongodb:27017/sagas` | No — set `SAGA_MONGO_URI` instead |
| `PORT` | API Gateway | Inline: `PORT="${PORT:-${API_GATEWAY_PORT:-3000}}"` [deploy/render/start.sh:47] | `3000` | No — set `API_GATEWAY_PORT` or container `PORT` instead |
| `PORT` | Order Service | Inline: `PORT="${ORDER_SERVICE_PORT:-3001}"` [deploy/render/start.sh:17] | `3001` | No — set `ORDER_SERVICE_PORT` instead |
| `PORT` | Inventory Service | Inline: `PORT="${INVENTORY_SERVICE_PORT:-3002}"` [deploy/render/start.sh:21] | `3002` | No — set `INVENTORY_SERVICE_PORT` instead |
| `PORT` | Payment Service | Inline: `PORT="${PAYMENT_SERVICE_PORT:-3003}"` [deploy/render/start.sh:25] | `3003` | No — set `PAYMENT_SERVICE_PORT` instead |
| `PORT` | Saga Orchestrator | Inline: `PORT="${SAGA_SERVICE_PORT:-3004}"` [deploy/render/start.sh:29] | `3004` | No — set `SAGA_SERVICE_PORT` instead |
| `ORDER_SERVICE_URL` | Exported (all processes inherit) | `export ORDER_SERVICE_URL="${ORDER_SERVICE_URL:-http://127.0.0.1:3001}"` [deploy/render/start.sh:5] | `http://127.0.0.1:3001` | No — internal to single-container topology |
| `INVENTORY_SERVICE_URL` | Exported (all processes inherit) | `export INVENTORY_SERVICE_URL="${INVENTORY_SERVICE_URL:-http://127.0.0.1:3002}"` [deploy/render/start.sh:6] | `http://127.0.0.1:3002` | No — internal to single-container topology |
| `SAGA_SERVICE_URL` | Exported (all processes inherit) | `export SAGA_SERVICE_URL="${SAGA_SERVICE_URL:-http://127.0.0.1:3004}"` [deploy/render/start.sh:7] | `http://127.0.0.1:3004` | No — internal to single-container topology |

**`MONGO_URI` per-process mapping:**
- API Gateway receives the value derived from `API_GATEWAY_MONGO_URI` [deploy/render/start.sh:47]
- Order Service receives the value derived from `ORDER_MONGO_URI` [deploy/render/start.sh:17]
- Saga Orchestrator receives the value derived from `SAGA_MONGO_URI` [deploy/render/start.sh:29]
- There is NO single operator-supplied `MONGO_URI` used for all three processes.

**`PORT` per-process mapping:**
- Gateway uses the incoming container `PORT` when present, otherwise falls back through `API_GATEWAY_PORT` to `3000` [deploy/render/start.sh:47]
- Internal services receive fixed per-service port defaults from the launcher [deploy/render/start.sh:17][deploy/render/start.sh:21][deploy/render/start.sh:25][deploy/render/start.sh:29]

**`ORDER_SERVICE_URL` / `INVENTORY_SERVICE_URL` / `SAGA_SERVICE_URL`:**
These are exported by the launcher at lines 5-7, defaulting to `127.0.0.1` with ports 3001, 3002, and 3004 respectively, for the single-container topology.

### 3C. Drift Detection

**Drift item 1 — `.env.example` is stale relative to the current launcher contract:**
- `.env.production.example` correctly uses `API_GATEWAY_MONGO_URI`, `ORDER_MONGO_URI`, and `SAGA_MONGO_URI` [`.env.production.example:12,27,50`].
- However, `.env.example` still uses a single `MONGO_URI` repeated across services [`.env.example:11,26,49`]. This is drift between the two template files — `.env.example` uses the old single-`MONGO_URI` naming convention, while `.env.production.example` uses the new per-service naming convention. The launcher now expects the per-service names.
- Impact: `.env.example` is stale relative to the current `start.sh` and `docker-compose.yml` contracts. The `.env.example` file lists `MONGO_URI` as a top-level variable, but neither `start.sh` nor `docker-compose.yml` uses a bare `MONGO_URI` for all services anymore.

**Drift item 2 — `JWT_SECRET` contract mismatch between launcher and `.env.production.example`:**
- `.env.production.example` documents `API_GATEWAY_JWT_SECRET` [`.env.production.example:11`] as the JWT secret variable.
- The application reads `JWT_SECRET` directly [services/api-gateway/src/middleware/auth.ts:5].
- The current `start.sh` does NOT map `API_GATEWAY_JWT_SECRET` to `JWT_SECRET`.
- Impact: An operator following `.env.production.example` will set `API_GATEWAY_JWT_SECRET` but the gateway will read an unset `JWT_SECRET`, causing authentication to fail or use the development fallback.

**Drift item 3 — `.env.production.example` documents internal service URLs as operator inputs:**
- `.env.production.example` lists `INVENTORY_SERVICE_URL` [`.env.production.example:14,52`] and `ORDER_SERVICE_URL` [`.env.production.example:15,53`] as container inputs.
- These values would override the launcher's `127.0.0.1` defaults. For a single-container Render deployment, the operator should NOT need to set these — the launcher defaults them correctly to `127.0.0.1`.
- The launcher respects operator-supplied values via `${VAR:-default}` [deploy/render/start.sh:5-7], so this is not a hard error, but it is documentation drift: `.env.production.example` documents variables that the launcher treats as internal to the single-container topology. Operators may set these to non-localhost URLs inadvertently.

**Drift item 4 — `DEMO_MODE` default mismatch between templates:**
- `.env.production.example` sets `DEMO_MODE=true` [`.env.production.example:44`].
- `docker-compose.yml` defaults `DEMO_MODE` to `false` [docker-compose.yml:205].
- In `start.sh`, `DEMO_MODE` has no default — an empty value is treated as `false` by the app [services/payment-service/src/config.ts:5].
- If `.env.production.example` values are loaded but `DEMO_MODE` is not explicitly propagated to the container, the Payment Service will default to `false`.

**Drift item 5 — `KAFKA_BROKER` is documented but not passed per-process by the launcher:**
- `KAFKA_BROKER` is documented in `.env.production.example` [`.env.production.example:28,35,42,50`] and expected by all services.
- The launcher does not explicitly assign `KAFKA_BROKER` on launch lines — it relies on container-level inheritance [deploy/render/start.sh:17,21,25,29,47 have no `KAFKA_BROKER=...` prefix].
- This works as long as the platform injects `KAFKA_BROKER` into the container environment, but it is less explicit than the other variables.

**Drift item 6 — `SEED_*` passwords in `.env.production.example`:**
- `.env.production.example` has placeholder values like `<SEED_ACME_ADMIN_PASSWORD>` [`.env.production.example:18-21`].
- The application requires real values — there is no fallback [services/api-gateway/src/db/seed.ts:51].
- If placeholders are not replaced, the gateway will fail to seed demo users.

**Drift item 7 — `.env.production.example` lacks `JWT_SECRET`:**
- `.env.production.example` documents `API_GATEWAY_JWT_SECRET` [`.env.production.example:11`] but does NOT document `JWT_SECRET`.
- The launcher does NOT map `API_GATEWAY_JWT_SECRET` to `JWT_SECRET` [deploy/render/start.sh:47].
- The application reads `JWT_SECRET` directly [services/api-gateway/src/middleware/auth.ts:5].
- Impact: An operator following `.env.production.example` will set `API_GATEWAY_JWT_SECRET` but the gateway will read an unset `JWT_SECRET` and fall back to the development secret [services/api-gateway/src/middleware/auth.ts:5].

## 4. Stale or Ambiguous Deployment Artifacts

### 4.1 `docker-compose.production.yml`

**Classification:** Multi-container/VM fallback topology — NOT the Render single-container path.

Evidence:
- It defines five separate services with individual `build` directives [docker-compose.production.yml:3,27,41,56,70].
- Each service has its own `environment` block with direct variable interpolation [docker-compose.production.yml:9-22,32-36,46-51,61-65,75-81].
- It uses a separate `stocksync-production` network [docker-compose.production.yml:86-88].
- It does NOT use `deploy/render/start.sh`.
- It does NOT use the Render Dockerfile's multi-stage approach.
- It does NOT run multiple services in one container.

**Ambiguity:** `docker-compose.production.yml` represents a different deployment topology (multi-process, multi-container) than the Render target (single-container, multi-process via `start.sh`). This file could serve as a fallback deployment path on infrastructure that does not support single-container multi-process models, but it is not the Render deployment path.

### 4.2 `docker-compose.yml`

**Classification:** Local development topology — stale for production use.

Evidence:
- Sets `NODE_ENV=development` [docker-compose.yml:108,149,174,202,225].
- Publishes all ports to the host [docker-compose.yml:106,147,172,200,223].
- Uses local infrastructure service names (`mongo`, `postgres`, `redis`, `kafka`) [docker-compose.yml:114,151,176,178,228].
- Uses development defaults [docker-compose.yml:109-120,150-152,175-178,203-205,226-230].

### 4.3 `.env.example`

**Classification:** Stale relative to current launcher contract.

Evidence:
- Uses a single `MONGO_URI` repeated across services [`.env.example:11,26,49`].
- Uses generic `PORT` instead of per-service port variables [`.env.example:8,25,32,40,48`].
- Does not document `API_GATEWAY_MONGO_URI`, `ORDER_MONGO_URI`, `SAGA_MONGO_URI`, `API_GATEWAY_PORT`, `ORDER_SERVICE_PORT`, etc.
- Does not document `API_GATEWAY_JWT_SECRET` (uses `JWT_SECRET` instead) [`.env.example:10`].

### 4.4 `.env.production.example`

**Classification:** Mostly aligned, but requires reconciliation before deployment.

Evidence:
- Uses per-service Mongo variable names [`.env.production.example:12,27,50`].
- Uses per-service port variable names [`.env.production.example:9,26,33,41,48`].
- Sets `DEMO_MODE=true` [`.env.production.example:44`].

However, this file has documented drift that must be reconciled before first deployment:
- Documents `API_GATEWAY_JWT_SECRET` but the application reads `JWT_SECRET` [services/api-gateway/src/middleware/auth.ts:5] — see Section 3C Drift item 2.
- Documents internal service URLs (`INVENTORY_SERVICE_URL`, `ORDER_SERVICE_URL`, `SAGA_SERVICE_URL`) as operator inputs — see Section 3C Drift item 3.
- Does not document `JWT_SECRET` directly — see Section 3C Drift item 7.

## 5. Managed Infrastructure Dependencies

| Infrastructure | What Application Expects | Container Input | Local Compose Equivalent | Production Managed Instance |
|---|---|---|---|---|
| MongoDB | Auth (gateway), Orders (order), Sagas (saga) | Three separate connection strings: `API_GATEWAY_MONGO_URI`, `ORDER_MONGO_URI`, `SAGA_MONGO_URI`; derived to `MONGO_URI` per process | `mongodb:7` on `stocksync-network` [docker-compose.yml:69-83] | Needs provisioning; three databases (auth, orders, sagas) on one or more clusters |
| PostgreSQL | Inventory service | `DATABASE_URL` | `postgres:15-alpine` with init script [docker-compose.yml:48-67] [scripts/init-postgres.sql] | Needs provisioning; requires `stocksync` user with `inventory` database; init script may need migration to managed Postgres |
| Redis | Rate limiting (gateway), Copilot cache | `REDIS_URL` | `redis:7-alpine` [docker-compose.yml:85-96] | Needs provisioning; no persistent data required for demo |
| Kafka | Event streaming for order.created plus inventory/payment/saga outcome events carried on the consolidated Kafka topics | `KAFKA_BROKER` | `confluentinc/cp-kafka:7.5.0` with Zookeeper [docker-compose.yml:5-46] | Needs provisioning; `scripts/create-topics.sh` provisions application topics [scripts/create-topics.sh] |

**Notes:**
- The local Compose includes a `scripts/init-postgres.sql` for database initialization [docker-compose.yml:59]. The production managed instance must be initialized separately — needs verification whether this script is compatible with the managed provider.
- Kafka topics are not auto-created by the Render deployment path. `scripts/create-topics.sh` explicitly provisions the four application topics [scripts/create-topics.sh]. The Render launcher does not invoke this script. Managed Kafka topic provisioning must be handled separately or verified with the selected provider.
- `scripts/create-topics.sh` exists to create Kafka topics [scripts/create-topics.sh]. Its usage in the Render deployment is not wired up.

## 6. Deployment Blockers

### Required before first Render deploy

| Blocker | Evidence |
|---|---|
| No `render.yaml` or provider deployment descriptor exists | Section 1.1 — file not found anywhere in repository |
| `JWT_SECRET` / `API_GATEWAY_JWT_SECRET` contract mismatch | `.env.production.example` documents `API_GATEWAY_JWT_SECRET` [`.env.production.example:11`] but the app reads `JWT_SECRET` [services/api-gateway/src/middleware/auth.ts:5]. The launcher does NOT map `API_GATEWAY_JWT_SECRET` → `JWT_SECRET` [deploy/render/start.sh:47]. Operator must set `JWT_SECRET` directly. |
| `SEED_*` password placeholders in `.env.production.example` are not real values | [`.env.production.example:18-21`] — placeholders `<SEED_*>` must be replaced; otherwise user seeding fails |
| `DATABASE_URL`, `KAFKA_BROKER`, and `REDIS_URL` have no launcher-level defaults | The launcher passes these through from container environment with no fallback [deploy/render/start.sh:21,25,29] — `DATABASE_URL` is not assigned on any launch line |
| `DEMO_MODE` has no launcher default | If `DEMO_MODE` is empty/unset, Payment Service treats it as `false` [services/payment-service/src/config.ts:5] — non-deterministic demo behavior in production path |
| No health check configured in Dockerfile | `EXPOSE 3000` documents the container port [deploy/render/Dockerfile:66] but no `HEALTHCHECK` directive exists; `/health` endpoint exists [services/api-gateway/src/routes/health.ts:1-31] but provider must be configured manually |
| No `.nvmrc` or `engines.node` declaration | Base image pins `node:20-alpine` [deploy/render/Dockerfile:1,36] but no version constraint in package.json files — needs verification that all packages are Node 20 compatible |
| Kafka topic provisioning not wired into Render startup | `scripts/create-topics.sh` explicitly provisions application topics but is not invoked by the Render launcher [scripts/create-topics.sh] [deploy/render/start.sh] — managed Kafka topics must be provisioned or verified separately |
| Postgres init script not applied to managed instance | `scripts/init-postgres.sql` is used only in local Compose [docker-compose.yml:59] — managed Postgres needs equivalent setup |

### Required before production/demo readiness

| Blocker | Evidence |
|---|---|
| `REDIS_URL` is not assigned per-process by the launcher | It is inherited from container env; the application default is `redis://localhost:6379` [services/api-gateway/src/db/redis.ts:3] — in production this will fail unless the platform injects a proper Redis URL |
| RAG/vector store not yet implemented | ADR-011 is open/pending [DECISIONS.md:82-86] — Copilot cannot function without it |
| TLS edge not configured | ADR-012 is approved but not implemented [DECISIONS.md:88-96] — frontend HTTPS will fail against a plain-HTTP gateway |
| Frontend not yet built | [docs/REQUIREMENTS.md:45-55] — no frontend in repository |

### Follow-up hardening

| Hardening item | Evidence |
|---|---|
| Health check endpoint configured at the provider level | `/health` exists [services/api-gateway/src/index.ts:23] but checks all downstream services [services/api-gateway/src/routes/health.ts:17-31] — may be too slow/strict for platform Liveness probes |
| `PORT` for API Gateway not aligned with hosting platform expectation | The launcher uses `PORT="${PORT:-${API_GATEWAY_PORT:-3000}}"` [deploy/render/start.sh:47] — if the platform sets a different `PORT`, the gateway will use it, and `EXPOSE 3000` in the Dockerfile documents the container port [deploy/render/Dockerfile:66] |
| Kafka topic configuration not managed as infrastructure-as-code | `scripts/create-topics.sh` exists but is not invoked during Render startup [scripts/create-topics.sh] |

## 7. Runtime Validation Status

### Proven locally

The following were observed during the local bundled-container test. These are runtime observations, not repository-source facts:

- Bundled image builds successfully.
- All five services start in one container.
- Per-service PORT mappings work.
- Per-process Mongo mappings work.
- Production dependencies are present and devDependencies were excluded.
- `NODE_ENV=production` is set.
- PostgreSQL connectivity works.
- Redis connectivity works.
- MongoDB connectivity works.
- Kafka connectivity was observed: producers/consumers connected and consumer groups joined.
- Gateway `/health` returned HTTP 200.
- Gateway `/inventory` returned HTTP 200 with real inventory rows.
- Graceful SIGTERM shutdown succeeded; all five services stopped cleanly.

> Runtime validation results above were observed during the local bundled-container test; they do not require repository-source citations.

### Not yet proven locally

- A complete business-level `order-created → inventory → payment → saga` Kafka flow through the bundled container.
- Connectivity and compatibility with the eventual managed production providers.

### Kafka-specific observations

Kafka connectivity was observed during startup because producer/consumer connections and consumer-group joins appeared in the bundled-container logs. However, the actual business-event flow (order-created → inventory → payment → saga) remains unproven.

## 8. Recommended Next Sequence

1. Run the local end-to-end order-flow validation (`docker compose up -d` + e2e tests) [AGENTS.md:55].
2. Perform managed-service availability reconnaissance (MongoDB, PostgreSQL, Redis, Kafka providers).
3. Provision managed infrastructure and reconcile connection strings.
4. Reconcile the final container-input environment contract (resolve `.env.example` vs `.env.production.example` drift, set real `JWT_SECRET` and `SEED_*` values).
5. Add/configure Render deployment metadata (provider descriptor, correct Dockerfile path = `deploy/render/Dockerfile`, health check on `/health`).
6. Perform the first Render deployment.
7. Document deployment and redeployment procedures.

## Validation

- `cat docs/DEPLOYMENT_GAPS.md` — this file
- `sh -n deploy/render/start.sh` — syntax validated before this task
