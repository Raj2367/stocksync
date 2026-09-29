# StockSync — AI Collaboration Notes

Keep this file short and factual. It is part of the final project submission and should document how AI was used without dumping complete transcripts.

## Tools/models used

- Kilo Code in VS Code
- Model/provider: fill in actual model used
- Other AI tools: fill in only if used

## How work was split

### Developer owned

- Requirements and scope decisions
- Architecture decisions
- Tenant isolation policy
- Security boundaries
- Review of generated diffs
- Running tests and debugging
- Final deployment/provider decisions

### AI-assisted

- Small code patches
- Test scaffolding
- Boilerplate/type updates
- Documentation drafts
- Debugging suggestions

## Key developer decisions

1. Hybrid RAG instead of using vector search for transactional queries.
2. Minimal tenancy on orders, Sagas, and RAG knowledge while keeping the catalog shared.
3. Demo payment behavior travels through Kafka events and is gated by `DEMO_MODE=true`.

## Hardest bug / wrong turn

Fill this with one concrete incident:

- What the AI generated or suggested
- Why it was wrong
- How the problem was detected
- What was changed
- What test now prevents regression

## Improvements with more time

Keep this factual and limited to 3–5 items. Do not turn this into a roadmap unless the item was actually discussed and bounded.
