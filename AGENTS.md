# Reelay Agent Guide

Before changing this prototype:

1. Inspect the current branch and worktree; do not trust a branch name copied into a document.
2. Read the startup section of [the Vibe coding workflow](docs/development-workflow.md#1-开始核对事实与本次范围) and [current handoff](docs/agent-handoff.md); consult the remaining workflow sections when applicable.
3. Follow that routing table to the affected sections, not whole documents. Reuse context already read in the same task unless the scope or source changed; README is an index, not an additional checklist.
4. For visible UI changes, read the relevant [design conventions](docs/design-system.md) and reuse existing tokens and components. A visual-only edit does not require architecture, future plans, deployment guides or unrelated product rules.

Keep these boundaries:

- Work from first principles. Treat a user-proposed solution as important input, not as proof that it is the best implementation; identify experience-bound assumptions, omitted boundaries, and more mature alternatives, and state the evidence when that judgment changes the solution.
- Treat root-cause repair as a hard rule: replace the incorrect logic with the correct invariant or state transition instead of layering compensating patches, cleanup jobs, or special cases over it.
- Make the smallest complete change that restores correctness. Do not opportunistically rewrite unrelated modules, and do not leave half-migrations, dual paths, or old and new implementations active together.
- Model entries belong in `data/model-catalog.js`.
- Do not describe planned pages as implemented.
- Preserve the user-visible semantics of canvas gestures, selection, and theme parity; do not preserve an inaccessible event binding merely because the prototype used it.
- While credits are still an in-memory mock, refresh must reset test credits to `3000 / 0`. After a persistent `CreditLedger` exists, replace this with balance/ledger consistency, idempotent charge, and idempotent refund checks.
- Avoid adding more page-level behavior to `app.js`; new product pages should begin in a routed application structure.
- Update the product spec when implemented behavior changes.
- Remove replaced code paths and stale documentation in the same scope; verify dynamic use and data compatibility before deleting. Merged code does not authorize deleting worktrees, ignored media, or credentials.
- Keep handoff current and concise. Use Git / PRs for history; do not append another release diary or duplicate the shared rules.

Verification follows the change scope in `docs/development-workflow.md`:

- Use the smallest relevant check while iterating.
- Before a code milestone or commit, run `npm run check` and `git diff --check`.
- For documentation-only changes, run `npm run check:docs` and `git diff --check`.
- Run visual, theme, console, credit, and cross-canvas checks only when the changed surface can affect them; do not turn unrelated documentation or domain-only changes into a full manual canvas regression.
