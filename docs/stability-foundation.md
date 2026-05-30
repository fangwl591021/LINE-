# Stability Foundation

This document is the baseline contract for changing the LINE- system without breaking production flows.

## Branch and rollback contract

- Production baseline must be represented by a Git commit, branch, or tag. Do not rely on a verbal rollback point.
- Risky work must be done on a branch first.
- A rollback must restore the whole runtime surface for the selected point: Worker code, GitHub Pages files, cache-bust versions, and any Worker env flag changes.
- Do not mix rollback work with new fixes in the same commit.

## Webhook contract

- `/line-webhook` and `/webhook/line` are reserved for LINE Official Account events.
- LINE webhook requests must keep LINE signature verification.
- Third-party systems must not call `/line-webhook`.
- Third-party point or account integrations use `/point-webhook` or `/webhook/points`.
- Third-party write webhooks require a secret header or bearer token.

## Feature flag contract

Use Worker env vars for risky changes so a feature can be disabled without reverting code.

Current reserved flags:

- `FEATURE_HOME_UI_V2`
- `FEATURE_MY_CARD_KEYWORD`
- `FEATURE_PUBLIC_MATCHMAKING_POOL`
- `FEATURE_THIRD_POINT_WEBHOOK`
- `FEATURE_RELAXED_NEW_USER_AUTH`
- `FEATURE_LINEOA_MONITOR_V2`

Default rule: new risky features default to off unless the existing production behavior already depends on them.

## Identity contract

`LINE UID` is an entry identity, not the whole account model.

Canonical fields:

- `line_id`: primary LINE identity for the current app/member.
- `row_id`: internal row alias. It must not become the point account by accident.
- `point_line_id`: canonical point-service account ID used for point balance and point transactions.
- `legacy_line_id`: old or previously merged LINE identity.
- `referrer_id`: inviter/referrer identity. It must not be overwritten by a normal login.
- `network_id`: tenant/store/admin network boundary.
- `creator_id` / `owner_user_id`: card ownership. These are not always the same as the viewer.

Rules:

- New OA interaction may create or repair member identity, but must not automatically create a personal card.
- Scanned business cards are CRM assets unless the flow explicitly creates the user's own personal card.
- Point queries and point writes must resolve through `point_line_id` when it exists.
- CRM visibility must resolve identity aliases but still preserve tenant/network boundaries.
- Public AI matchmaking requires explicit public opt-in and safety approval.

## Smoke-test contract

Before deploying a foundation-only change, run:

```powershell
node tools\run-smoke-contracts.js
```

Before deploying a risky product change, run the full contract set:

```powershell
node tools\run-smoke-contracts.js --full
```

Minimum flows covered by contracts:

- auth and point identity bridge
- share-card flow
- inbox recipient scope
- my-card entry
- own-card upload
- matchmaking pool separation
- CRM referrer contract
- stability foundation checks

If any contract fails, do not deploy.
