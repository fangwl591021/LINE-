# Identity Diagnostic Tool

Use this when a person appears as two accounts, points do not sync, a card belongs to the wrong owner, inbox visibility is wrong, or CRM scope looks incorrect.

This is a read-only diagnostic. Do not use this tool to merge, delete, or repair accounts.

## Usage

Remote production D1:

```powershell
powershell -ExecutionPolicy Bypass -File .\tools\diagnose-identity.ps1 Uxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

Local D1:

```powershell
powershell -ExecutionPolicy Bypass -File .\tools\diagnose-identity.ps1 Uxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx -Local
```

JSON output:

```powershell
powershell -ExecutionPolicy Bypass -File .\tools\diagnose-identity.ps1 Uxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx -Json
```

Alternate database name:

```powershell
powershell -ExecutionPolicy Bypass -File .\tools\diagnose-identity.ps1 Uxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx -Database actmaster_db
```

Node version is also available for non-Windows automation:

```powershell
node tools\diagnose-identity.js Uxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx --json
```

## What it checks

- `users`: `line_id`, `row_id`, `legacy_line_id`, `point_line_id`, `referrer_id`, `network_id`
- `card_contacts`: `line_id`, `profile_user_id`, `owner_user_id`, `creator_id`, `source_type`, `visibility`
- `point_awards`: scan/check-in point award trace
- `inbox_items`: sent/received/unread count
- `personal_tasks`: follow-up reminder rows

## How to read common results

Multiple `users` rows:

The identity is probably split. Check which row has the correct `point_line_id`, `referrer_id`, and active card.

`point_line_id` differs from `line_id`:

Point query and point write must use `point_line_id`. This is normal after account bridging, but code must resolve it consistently.

Non-self card bound to the same identity:

Likely caused by a user scanning or uploading through 名片酷 instead of 個人專屬名片. Confirm `source_type`, `owner_user_id`, and `creator_id` before any repair.

No personal card but CRM cards exist:

The person is registered or visible in CRM but has not completed their own personal card flow.

Inbox has rows but UI shows empty:

Check alias resolution between `receiver_user_id` and the current LIFF `userId` / `point_line_id`.

## Stable bridge contract

Legacy commercial-engine LIFF users and current point-LIFF users must be read as one identity.
Runtime reads should expand all known aliases before looking up user-owned data:

- `users.line_id`
- `users.row_id`
- `users.legacy_line_id`
- `users.point_line_id`
- active rows in `user_identity_links`

For business-card reads, use the shared Worker helper `D1ReadModule.cardByIdentity()`.
Do not reintroduce single-id card lookups such as only `line_id = ? OR creator_id = ?`
in inbox, point-customer, or referral-placeholder paths.
