# Stale Contract Audit

Last checked: 2026-06-15

This file tracks contract scripts that exist in `tools/` but are not part of the full change guard.

## Included After Audit

These scripts passed independently and are now included in:

```powershell
node tools/run-smoke-contracts.js --full
```

- `tools/check-cardmaster-public-readiness-contract.js`
- `tools/check-home-profile-owner-controls-contract.js`
- `tools/check-home-profile-restyle-contract.js`
- `tools/check-home-design-contract.js`
- `tools/check-checkin-display-contract.js`
- `tools/check-inbox-unread-icon-contract.js`
- `tools/check-local-gpt-key-hidden-contract.js`
- `tools/check-today-fortune-contract.js`
- `tools/check-user-social-settings-contract.js`

## Still Excluded

None. All `tools/check-*-contract.js` scripts are now represented in the full smoke guard.

## Rule

Do not weaken or delete a stale contract just to make the guard pass.

For each stale contract:

1. Read the contract and confirm the behavior is still required.
2. Update only stale version strings or obsolete selectors.
3. Run the contract directly.
4. Add it to `fullChecks` only after it passes for the current product behavior.
