# AI Matchmaking Pool Split Test Plan

## Goal

Validate that AI matchmaking has two separate data boundaries:

- Own pool: cards owned or scanned by the current user only.
- Public pool: self-profile cards that explicitly opted into public cross-store matching.

The current production flow on `main` must stay unchanged until this branch is verified.

## Acceptance Checks

1. Own pool can run without making the user's own card public.
2. Own pool results only come from cards tied to the current user identity.
3. Public pool still requires the user's own card to be public before the UI unlocks cross-store matching.
4. Public pool candidates must satisfy all server-side rules:
   - `visibility = public`
   - `source_type = self_profile`
   - `pool_eligible = 1`
   - `ai_review_status = passed`
5. Private imports, referral placeholders, and store-private CRM cards must not appear in public pool results.
6. The front end must send only `poolScope`, not a prefiltered public candidate list.

## Commands

```powershell
node --check js\modules\matchmake.js
node --check workerbackup.js
node tools\check-matchmake-contract.js
node tools\check-share-contract.js
node tools\check-auth-contract.js
npx.cmd wrangler deploy --dry-run --outdir .wrangler-dry-run
```

## Manual Test Flow

1. Open the test branch UI.
2. Go to AI matchmaking.
3. Select `我的名片池`.
4. Enter a matchmaking request and confirm results are limited to the user's own scanned/managed cards.
5. Select `公開交流池`.
6. Confirm the lock appears if the user's own card is private.
7. Publicize the user's own card only after AI safety review.
8. Run public matching and confirm results are cross-store public self-profile cards only.
