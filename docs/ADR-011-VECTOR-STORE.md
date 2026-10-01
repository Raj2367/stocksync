# ADR-011 — Vector storage for RAG

**Status:** Open — resolve during Phase 2 before retrieval implementation.

**Copilot location:** The Copilot/RAG module will live inside the API Gateway service boundary rather than as a new microservice. This keeps the first release small and lets the module reuse gateway authentication, tenant context, and Redis rate limiting. The vector store must therefore be reachable from the gateway without bypassing service ownership.

## Context

The Order Operations Copilot needs semantic retrieval over a small knowledge corpus. We want to reuse existing infrastructure and avoid a new vector database service.

## Candidate options

### A. Existing PostgreSQL server + vector capability

Use a dedicated logical database/schema owned by the Copilot for RAG chunks and embeddings. The Copilot must not read Inventory Service transactional tables directly.

**Pros:** recognisable vector-search architecture; database-side tenant filtering and similarity ranking.

**Cons:** deployment tier must actually provide the required vector capability; configuration is more involved.

### B. Existing MongoDB + application-side cosine similarity

Store a small RAG collection containing chunk text, tenant metadata, and embeddings. Filter by tenant in MongoDB, then calculate cosine similarity in Node.js for the small corpus.

**Pros:** no new infrastructure; minimal deployment changes; easy to explain and test for a small corpus.

**Cons:** ranking moves into application code and does not demonstrate a database-native vector index.

## Decision rule

Pick the simplest free-tier-compatible option that is sufficient for a corpus of roughly 100 chunks or fewer and preserves strict tenant filtering before LLM context construction. Because the Copilot lives in the gateway, Option B avoids opening a second database connection class in the gateway and is the default simplicity candidate; Option A remains acceptable only if deployment/free-tier validation shows a clear benefit without adding material complexity. Do not add a dedicated vector database unless both options above are infeasible.

## Required Phase 2 acceptance

- tenant filter happens before semantic ranking results enter the prompt
- at least one materially different tenant-specific document exists for each demo tenant
- shared documents are explicitly marked `tenantId = "shared"` and included for both tenants
- retrieval tests include a cross-tenant negative case
