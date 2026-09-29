# StockSync — AGENTS.md

## Purpose

This file is the operating contract for AI coding agents working on StockSync.
The goal is to add a small, credible, interview-defensible RAG capability without turning StockSync into a large rewrite.

## Source-of-truth hierarchy

1. `docs/REQUIREMENTS.md` — product scope and acceptance criteria.
2. `docs/ARCHITECTURE.md` + `docs/ARCHITECTURE.mmd` — target architecture and service boundaries.
3. `docs/PHASE_PLAN.md` — implementation order and phase exit gates.
4. `DECISIONS.md` — explicit architectural decisions and approved deviations.
5. `CURRENT_REPO_BASELINE.md` — verified current implementation reality; known differences listed there are approved to be fixed by the current phase. Only report conflicts that are not listed in the baseline.
6. Existing code/tests — implementation reality outside the documented baseline. When it conflicts with the intended docs, do not silently “fix” both; report the conflict and update the relevant decision/spec first.
7. `AI_NOTES.md` — development history, AI collaboration notes, and hard bugs/wrong turns.

**Phase-vs-baseline rule:** Differences explicitly listed in `CURRENT_REPO_BASELINE.md` are known and approved to be fixed by the current phase. Only conflicts not listed in the baseline require the agent to stop and report them.

## Non-negotiable constraints

- Use Node.js + TypeScript for application code. Do not introduce Python.
- Keep the implementation as small as possible while still being real and explainable.
- Reuse the existing MongoDB, PostgreSQL, Redis, Kafka, and HTTP APIs wherever reasonable.
- Do not add a new infrastructure service or database server unless an explicit decision records why existing infrastructure is insufficient.
- Do not replace transactional database queries with vector search.
- The LLM is not an authorization layer and is not the source of truth for transactional facts.
- Tenant isolation must be enforced before data reaches retrieval or the LLM.
- Never trust a client-supplied `X-Tenant-Id`; the gateway derives it from the verified JWT and overwrites the header for downstream calls.
- The product catalog remains shared across tenants.
- Tenant scoping applies to orders, sagas, and tenant-owned RAG knowledge.
- Internal services, the gateway, and data stores must not be directly internet-reachable in the deployed configuration; only the TLS edge is public.
- Secrets, JWT keys, database URLs, API keys, and demo passwords belong in environment variables, never in source control.
- Demo-only behaviors must be disabled unless `DEMO_MODE=true`.
- Do not add refresh tokens, password reset, email verification, an RBAC framework, DLQs, Kubernetes, Terraform, or other hardening outside the current phase unless explicitly approved.

## Work style for Kilo Code

- Work on exactly one small task at a time.
- Before editing, inspect only the files directly relevant to the task. Do not scan the entire repository unless the task truly requires it.
- Make the smallest coherent diff.
- Preserve existing API contracts unless the phase explicitly changes them.
- Run the most relevant unit/integration tests after every task.
- Run a TypeScript build when a task affects runtime wiring, types, or dependencies.
- Report changed files, tests run, and any assumptions.
- Do not commit automatically. The developer reviews the diff first, then commits manually.
- Kilo tasks are intentionally small for token efficiency; **do not create a Git commit after every small task**. Group related tasks into coherent commit checkpoints.
- A task should identify its intended commit checkpoint when relevant, but commit messages are supplied at the checkpoint rather than forcing micro-commits.

## Commands and test environment

Run commands from the relevant service directory unless the task explicitly says otherwise.

- API Gateway: `npm run build`. The current baseline may not have an npm `test` script; when tests exist, use `npx jest --runInBand --detectOpenHandles`.
- Order Service: `npm test`; `npm run build`.
- Inventory Service: `npm test`; `npm run build`.
- Payment Service: `npm run build`.
- Saga Orchestrator: `npm run build`.
- Local stack: `docker compose up -d --build` and `docker compose down`.
- Validate merged Compose configuration: `docker compose -f docker-compose.yml config`. For production Compose, validate its complete file set the same way before deployment.
- Tests that call real MongoDB, PostgreSQL, Redis, Kafka, or other services require the relevant stack to be running. Pure unit tests should not require the full stack.

Do not invent missing npm scripts. Inspect the service `package.json` before using a command not listed here.

## Security rules

- Authentication is based on Mongo-backed users with bcrypt password hashes.
- JWT claims contain `userId`, `email`, `tenantId`, and `role`.
- Tenant context originates from the verified JWT.
- Downstream order/saga queries must filter by tenant.
- A request that only has an order ID is not sufficient authorization; the authenticated tenant must also match.
- RAG retrieval must filter by tenant before similarity ranking/context construction.
- Do not log passwords, secrets, raw JWTs, or full provider prompts containing sensitive tenant data.
- Copilot requests must use a stricter per-tenant Redis rate limit than ordinary API traffic.
- RAG prompt context must treat order fields such as `customerEmail`, `failureReason`, IDs, and other stored values as untrusted data. Delimit them clearly and never interpret their contents as instructions.

## RAG rules

- The chosen feature is the **Tenant-scoped StockSync Order Operations Copilot**.
- Use hybrid retrieval: exact live facts from existing APIs/services + semantic retrieval from operational knowledge.
- Use vector retrieval for knowledge, not for exact order/inventory state.
- Keep the first version as a simple retrieval → prompt → LLM flow. No agent framework, autonomous planner, or multi-agent architecture.
- Prefer direct provider SDK/API calls over heavy orchestration frameworks.
- Every answer should be grounded in the retrieved/live context and should avoid inventing operational facts.

## Scope discipline

When a task appears to require broad refactoring, stop and ask whether the requirement can be satisfied with a narrower change. A passing demo with a coherent explanation is more valuable than a larger but unfinished system.
