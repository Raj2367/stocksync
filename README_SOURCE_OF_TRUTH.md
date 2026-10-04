# StockSync — Source-of-Truth Pack

This directory is the baseline for the RAG-enabled StockSync project.

## Files

- `AGENTS.md` — rules for Kilo Code / coding agents.
- `DECISIONS.md` — approved architectural decisions.
- `AI_NOTES.md` — AI collaboration log required for the final project.
- `README.md` — interviewer-facing project overview, demo walkthrough, and local setup.
- `docs/REQUIREMENTS.md` — product and engineering requirements.
- `docs/PHASE_PLAN.md` — phased implementation order and exit gates.
- `docs/ARCHITECTURE.md` — high-level architecture, trust boundaries, and deployed topology.
- `docs/ARCHITECTURE.mmd` — editable Mermaid source for the deployment topology. GitHub does not render standalone `.mmd` files; the rendered version appears inline in `docs/ARCHITECTURE.md`.
- `docs/ADR-011-VECTOR-STORE.md` — accepted vector-store decision record (MongoDB + Node-side cosine similarity).
- `docs/ADR-012-PUBLIC-TLS-EDGE.md` — approved deployment TLS-edge decision, with a reconciliation note describing how TLS is provided by the deployment platform.
- `docs/ADR-013-FRONTEND-ARCHITECTURE.md` — approved frontend architecture (separate Next.js app, direct-to-gateway, no BFF).
- `docs/DEPLOYMENT.md` — production deployment guide (Vercel + Render + MongoDB Atlas + Aiven).
- `CURRENT_REPO_BASELINE.md` — verified current implementation baseline; known differences here are approved phase work.
- `frontend/` — deployed Next.js frontend application; see `frontend/README.md` for local development notes.

## How to use this pack

1. Before each phase, read the phase section in `docs/PHASE_PLAN.md`.
2. Before each Kilo task, read `AGENTS.md` and only the relevant requirements/decision sections.
3. When a design decision changes, update `DECISIONS.md` (and the canonical linked ADR when applicable) before changing implementation.
4. Differences explicitly listed in `CURRENT_REPO_BASELINE.md` are approved targets for the current phase; do not block on them. Only unlisted contradictions require a decision/spec update first.
5. An approved ADR supersedes older requirement text if they conflict; immediately update the affected requirement and architecture text to match the approved ADR. Pending ADRs do not override the approved requirements.
6. When implementation intentionally diverges from the architecture, update the architecture document rather than leaving two conflicting truths.
7. At the end of each phase, run the phase exit gate.

## Current chosen product

**Tenant-scoped StockSync Order Operations Copilot**

The system combines exact live transactional facts from the Order and Saga APIs with tenant-filtered semantic retrieval and a free-tier LLM. It is deployed at https://stocksync-nine.vercel.app with the API Gateway on Render.

## Showable checkpoint

The project is considered strong enough to show an interviewer once the Phase 4 acceptance path in `docs/REQUIREMENTS.md` works on the live deployment. That acceptance path is currently satisfied on the deployed system.