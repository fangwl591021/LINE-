# Deployment Runbook

Use this before changing production Worker or GitHub Pages files.

## Current production baseline

Tag:

```txt
stable-20260530-line-engine-baseline
```

Commit:

```txt
c1ac80e Add third party point webhook
```

This tag is the rollback target for the current known baseline before the stability foundation branch is merged.

## Branch rule

1. Start from `main`.
2. Create a branch for the change.
3. Make one logical change per branch.
4. Run contracts locally.
5. Deploy only after contracts pass.
6. Push the branch and commit reference.

## Required checks

Foundation-only changes:

```powershell
node --check .\workerbackup.js
node .\tools\run-smoke-contracts.js
```

Product or auth changes:

```powershell
node --check .\workerbackup.js
node .\tools\run-smoke-contracts.js --full
```

Worker deploy preflight:

```powershell
npx.cmd wrangler deploy --dry-run
```

Production deploy:

```powershell
npx.cmd wrangler deploy
```

## Live checks after deploy

```powershell
curl.exe -sS https://line-engine.fangwl591021.workers.dev/line-webhook
curl.exe -sS https://line-engine.fangwl591021.workers.dev/point-webhook
```

Expected:

- `/line-webhook` returns HTTP 200 for a simple GET/verify-style request.
- `/point-webhook` returns JSON documentation for GET.
- third-party POST to `/point-webhook` requires `POINT_WEBHOOK_SECRET`.

## Rollback rule

If production breaks after a deploy:

1. Do not add a new fix commit first.
2. Restore the known tag or exact commit.
3. Deploy that restored Worker.
4. Verify login, point query, inbox, follow-up reminders, card upload, and LINE webhook.
5. Only then create a separate branch for diagnosis.

## High-risk areas

- LIFF auth and `lineAccessToken`
- `checkUser`
- `queryUserPoints`
- `point_line_id` / `legacy_line_id` mapping
- personal card ownership
- scanned CRM card ownership
- LINE OA webhook signature handling
- inbox and follow-up visibility
- cache-bust versions in `index.html`
