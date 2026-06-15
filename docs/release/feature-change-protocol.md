# Feature Change Protocol

This project must use a contract-first change rhythm for every functional edit.

## Purpose

Small edits have repeatedly affected identity, card ownership, card versioning, LIFF entry, LINE OA keyword replies, points, and button actions. The rule is now:

1. Run the current contracts before changing code.
2. Make the smallest scoped change.
3. Run the same contracts again after changing code.
4. Do not deploy if any contract fails.

## Required Command

Before editing a functional area:

```powershell
node tools/run-change-guard.js before
```

After editing:

```powershell
node tools/run-change-guard.js after
```

Both commands run:

```powershell
node tools/run-smoke-contracts.js --full
```

To inspect the exact contracts included in the full guard:

```powershell
node tools/run-smoke-contracts.js --list --full
```

## Required Work Order

Before a functional edit, copy and fill:

- `docs/release/change-work-order-template.md`

First, identify the change area:

```powershell
npm run scope:lookup -- my-card
```

Recommended command:

```powershell
npm run workorder:new -- my-feature "My feature title"
```

The work order must state:

- the exact feature being changed
- files expected to be touched
- files or systems that must not be touched
- contracts read before editing
- guard result before editing
- guard result after editing

## Change Boundaries

Before editing, identify which contract owns the affected behavior:

- LINE OA keywords: `docs/contracts/line-keywords.md`
- LIFF route behavior: `docs/contracts/liff-routes.md`
- Card ownership and versions: `docs/contracts/card-resolvers.md`
- Points and ledger behavior: `docs/contracts/points-ledger.md`
- Button URL / tel / mailto behavior: `docs/contracts/button-actions.md`
- Core invariants: `docs/rules/core-invariants.md`

If no contract covers the behavior, add or update the contract first.

If a contract exists but is not included in the full guard, check:

- `docs/audit/stale-contracts.md`

## Stop Conditions

Stop and do not deploy when any of these happen:

- A contract fails before editing.
- A contract fails after editing.
- A test requires changing unrelated product behavior to pass.
- The change touches identity, ownership, public/private pool, or point ledger without an explicit contract update.

## Handoff Format

Every completed change should report:

- Files changed.
- Contract list reviewed, when the affected area is high risk.
- Contract command run before the change.
- Contract command run after the change.
- Whether deploy was performed.
- Any known residual risk.
