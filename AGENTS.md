# Reelay Agent Guide

Before changing this prototype, read:

1. `docs/current-product-spec.md`
2. `docs/agent-handoff.md`
3. `docs/engineering-guardrails.md`
4. `docs/product-expansion-plan.md` for new-page work

Keep these boundaries:

- Model entries belong in `data/model-catalog.js`.
- Do not describe planned pages as implemented.
- Preserve canvas gestures, selection semantics, theme parity, and refresh-reset test credits.
- Avoid adding more page-level behavior to `app.js`; new product pages should begin in a routed application structure.
- Update the product spec when implemented behavior changes.

Minimum verification:

- Run JavaScript syntax checks.
- Run the prototype config syntax check.
- Check CSS structure.
- Test light and dark themes.
- Check the browser console.
- Verify refresh resets credits to `3000 / 0`.
