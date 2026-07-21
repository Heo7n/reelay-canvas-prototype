# Reelay Agent Guide

Before changing this prototype, read:

1. `docs/current-product-spec.md`
2. `docs/agent-handoff.md`
3. `docs/engineering-guardrails.md`
4. `docs/product-expansion-plan.md` for new pages, routing, persistence, assets, generation tasks, credits, or cross-project Agent work

Keep these boundaries:

- Model entries belong in `data/model-catalog.js`.
- Do not describe planned pages as implemented.
- Preserve the user-visible semantics of canvas gestures, selection, and theme parity; do not preserve an inaccessible event binding merely because the prototype used it.
- While the account is still an in-memory mock, refresh must reset test credits to `3000 / 0`. After a persistent `CreditLedger` exists, replace this with balance/ledger consistency, idempotent charge, and idempotent refund checks.
- Avoid adding more page-level behavior to `app.js`; new product pages should begin in a routed application structure.
- Update the product spec when implemented behavior changes.

Minimum verification:

- Run `npm run check`.
- Test light and dark themes.
- Check the browser console.
- In the current mock-account phase, verify refresh resets credits to `3000 / 0`.
- Verify generation completion, undo history, and project assets do not cross canvas or project boundaries.
