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

## Hardest bug / wrong turn

The corpus loader derived `tenantId` directly from the first directory name (`acme`, `beta`), but authentication and retrieval used the `tenant-acme`/`tenant-beta` namespace. The isolated integration test seeded documents with the correct namespace directly, so it never exercised the loader path. The mismatch was caught by hitting the deployed `/copilot/ask` endpoint with real Acme and Beta JWTs — both initially returned only shared-document sources. The fix mapped directory names to tenant IDs (`acme` → `tenant-acme`, etc.), with new tests that run the mapping through `syncKnowledgeCorpus` rather than testing the helper in isolation.

A related wrong turn: the initial Copilot route created a 15-second timeout with `setTimeout` but did not call `clearTimeout`. The route tests passed because they asserted the mocked `setTimeout` behavior rather than cleanup. This was caught by checking the production route for `clearTimeout`, then fixed with a `finally` block that clears the timer and a `TimeoutError` sentinel instead of message-string matching.

## Improvements with more time

- Add a dedicated stricter rate limit for the Copilot endpoint instead of relying only on the global limiter.
- Add live order and Saga facts to the Copilot so it can combine transactional data with retrieved operational knowledge.
- Add a minimal frontend/demo experience for the deployed Copilot.
- Add further adversarial tests for prompt/data-boundary handling and untrusted retrieved content.
