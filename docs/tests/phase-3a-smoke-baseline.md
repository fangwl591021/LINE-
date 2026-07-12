# Phase 3A Smoke Baseline

Phase 3A keeps the existing runtime unchanged and makes contracts validate behavior rather than stale implementation details.

## Required contracts

```powershell
node tools\check-cache-bust-contract.js
node tools\check-line-keyword-reply-ownership-contract.js
node tools\check-migration-chain-contract.js
npm.cmd run smoke
npm.cmd run smoke:full
npm.cmd run security
npm.cmd run guard:before
npm.cmd run guard:after
```

## Contract rules

- Cache-bust validation is centralized in `tools/check-cache-bust-contract.js`. It checks local script references, physical files, non-empty and valid `v` values, placeholder rejection, and conflicting versions within one HTML response.
- Keyword validation is centralized in `tools/check-line-keyword-reply-ownership-contract.js`. It verifies dedicated handlers for `我的名片`, `名片酷`, and `推薦好友` exit the webhook after ownership, do not continue into auto reply/GAS, preserve ordinary text auto reply, and use one reply call for an upstream reply payload.
- The clean local D1 chain is fixture baseline then production migrations. The `0000` fixture is deliberately outside `migrations/`.