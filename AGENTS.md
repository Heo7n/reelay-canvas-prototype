# Reelay Agent Guide

Before changing this prototype:

1. Inspect the current branch and worktree; do not trust a branch name copied into a document.
2. Read `docs/development-workflow.md` and `docs/agent-handoff.md`.
3. Use the routing table in `docs/development-workflow.md` to read only the relevant product spec, guardrail, plan, or ADR sections. Do not reload every long document for an unrelated local change.

Keep these boundaries:

- Treat root-cause repair as a hard rule: restore the correct invariant or state transition instead of covering faulty logic with compensating patches, cleanup jobs, or special cases.
- Model entries belong in `data/model-catalog.js`.
- Do not describe planned pages as implemented.
- Preserve the user-visible semantics of canvas gestures, selection, and theme parity; do not preserve an inaccessible event binding merely because the prototype used it.
- While the account is still an in-memory mock, refresh must reset test credits to `3000 / 0`. After a persistent `CreditLedger` exists, replace this with balance/ledger consistency, idempotent charge, and idempotent refund checks.
- Avoid adding more page-level behavior to `app.js`; new product pages should begin in a routed application structure.
- Update the product spec when implemented behavior changes.

Verification follows the change scope in `docs/development-workflow.md`:

- Use the smallest relevant check while iterating.
- Before a code milestone or commit, run `npm run check` and `git diff --check`.
- Run visual, theme, console, credit, and cross-canvas checks only when the changed surface can affect them; do not turn unrelated documentation or domain-only changes into a full manual canvas regression.
