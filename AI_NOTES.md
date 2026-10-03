# StockSync — AI Collaboration Notes

Keep this file short and factual. It is part of the final project submission and should document how AI was used without dumping complete transcripts.

## Tools/models used

- Kilo Code in VS Code
- Model/provider: [the underlying model that powers Kilo Code — e.g. Claude, GPT, etc. — not the Gemini model the StockSync Copilot calls at runtime]
- Other AI tools: None used

## How work was split

### Developer owned

- Requirements and scope decisions
- Architecture decisions
- Tenant isolation policy
- Security boundaries
- Review of generated diffs
- Running tests and debugging
- Final deployment/provider decisions
- Production verification and acceptance decisions

### AI-assisted

- Initial implementation of several RAG components, followed by developer review and correction
- Small code patches
- Test scaffolding
- Boilerplate/type updates
- Documentation drafts
- Debugging suggestions

## Key developer decisions

1. Hybrid RAG instead of using vector search for transactional queries.
2. Minimal tenancy on orders, Sagas, and RAG knowledge while keeping the catalog shared.
3. Demo payment behavior travels through Kafka events and is gated by `DEMO_MODE=true`.
4. MongoDB was selected for RAG vector storage, with embeddings stored alongside tenant-scoped knowledge chunks and cosine similarity calculated in Node.js.
5. The LLM is treated as a generation layer rather than an authorization layer; tenant filtering is enforced before retrieved context is sent to the model.
6. The frontend is a separate top-level `frontend/` application using Next.js App Router + TypeScript, Tailwind CSS + shadcn/ui. It communicates directly with the existing API Gateway (no BFF), authenticates via the existing JWT login API, and never chooses or overrides tenant context. The primary demo journey is Login → Orders → Order Detail → Ask Copilot. See ADR-013.

## Hardest bug / wrong turn

The corpus loader derived `tenantId` directly from the first directory name (`acme`, `beta`), but authentication and retrieval used the `tenant-acme`/`tenant-beta` namespace. The isolated integration test seeded documents with the correct namespace directly, so it never exercised the loader path. The mismatch was caught by hitting the deployed `/copilot/ask` endpoint with real Acme and Beta JWTs — both initially returned only shared-document sources. The fix mapped directory names to tenant IDs (`acme` → `tenant-acme`, etc.), with new tests that run the mapping through `syncKnowledgeCorpus` rather than testing the helper in isolation.

A related wrong turn: the initial Copilot route created a 15-second timeout with `setTimeout` but did not call `clearTimeout`. The route tests passed because they asserted the mocked `setTimeout` behavior rather than cleanup. This was caught by checking the production route for `clearTimeout`, then fixed with a `finally` block that clears the timer and a `TimeoutError` sentinel instead of message-string matching.

A third wrong turn: the frontend error handling was initially written assuming invalid/expired JWTs would return 401, but the deployed gateway actually returns 403 for invalid/expired JWTs and 401 only when the Authorization header is missing entirely. That backend response-code assumption was not exercised against the real backend until an explicit invalid-token browser test. The frontend was corrected to treat both 401 and 403 as session-invalid and redirect to login after clearing the JWT. The backend was not changed; it was not a backend bug.

## Improvements with more time

- Add further adversarial tests for prompt/data-boundary handling and untrusted retrieved content.
- Broader UX polish for the deployed frontend (loading states, empty states, responsive layout).
- Implement the deferred DEMO_MODE frontend force-payment-failure control from the Phase 1 plan.
- Production-side rate-limit or cost monitoring for the Copilot.

## Production deployment

The frontend is deployed to Vercel:

- Frontend: https://stocksync-nine.vercel.app
- Backend API Gateway: https://stocksync-a8qw.onrender.com

Deployed architecture:

Browser
  → Vercel-hosted Next.js frontend
  → Render public API Gateway
  → backend services

The frontend communicates directly with the existing API Gateway; there is no BFF. TLS for the public API endpoint is terminated by Render's platform edge. The frontend JWT is stored in browser `localStorage` as a demo tradeoff (see ADR-013).
