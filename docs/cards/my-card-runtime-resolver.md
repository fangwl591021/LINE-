# CS-2A My Card Runtime Resolver

## Scope

CS-2A changes only the LINE OA exact keyword `我的名片` read path when
`CARD_MY_CARD_RESOLVER_V2_ENABLED` is enabled. The default is disabled, so the
legacy path remains unchanged until an operator explicitly enables the flag.

## Trusted inputs

- Actor: signed LINE webhook `event.source.userId` only.
- Network: `LINE_OA_NETWORK_ID`, with the existing LINE OA `admin` network as
  the default.
- Requested version: `standard` for the exact keyword.

Request body IDs, query parameters, name, phone, email, scanner, creator, and
inviter never supply Personal ownership.

## Resolver rules

The adapter performs one bounded, read-only D1 query using the actor and its
identity-link aliases. It returns only a same-network active Personal candidate
for the requested static version. Personal sources are `self_profile`,
`line_generated`, `self_upload`, `claimed_personal`, and `video_profile`.

- Contact sources are never selected. A scanner match can produce only the
  internal `CONTACT_ONLY` result.
- `creator_id` and `scanner_user_id` never make a Personal card eligible.
- `video_profile` cannot satisfy a static request.
- Duplicate active revisions for one version return `MULTIPLE_PERSONAL`; no
  row is selected.
- Legacy or unknown source rows return `LEGACY_UNCLASSIFIED` and are not used.
- Candidate rows from another network return `TENANT_BOUNDARY` when no
  same-network Personal card exists.

The user-facing response exposes no internal card ID, UID, network ID, or
diagnostic code.

## Rollback

Set `CARD_MY_CARD_RESOLVER_V2_ENABLED=false` (or leave it absent). The Worker
does not invoke the V2 resolver or its D1 query and uses the legacy handler.
No data rollback is needed because CS-2A performs no writes.

## Validation

```powershell
node tools/test-my-card-runtime-resolver.js
node --check workerbackup.js
```
