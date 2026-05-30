# Identity Repair Dry Run

Use this before merging two LINE identities or repairing a split account.

The dry-run tool is read-only. It does not update users, cards, inbox, tasks, point awards, or external point ledgers.

## Usage

```powershell
powershell -ExecutionPolicy Bypass -File .\tools\preview-identity-repair.ps1 -OldId Uold -CanonicalId Unew
```

JSON output:

```powershell
powershell -ExecutionPolicy Bypass -File .\tools\preview-identity-repair.ps1 -OldId Uold -CanonicalId Unew -Json
```

Local D1:

```powershell
powershell -ExecutionPolicy Bypass -File .\tools\preview-identity-repair.ps1 -OldId Uold -CanonicalId Unew -Local
```

## Decision rules

- `CanonicalId` should be the active LINE/point identity.
- Preserve `referrer_id` unless it becomes a self-referral.
- Prefer `point_line_id` from the canonical user. If empty, use `CanonicalId`.
- Do not delete cards during identity repair.
- If both identities have `self_profile` cards, choose one primary personal card manually.
- If non-self CRM cards are bound to `OldId`, review before moving their `line_id`.
- External point ledger is not changed by this tool.

## Output meaning

`recommendedUser`:

The user row that would be safest to keep as canonical if a write repair is later approved.

`impact`:

Counts of records that would be affected by a future write repair.

`warnings`:

Cases that require manual review before any write tool is built or run.

## Important

This dry-run is a planning tool. A separate confirmed repair tool must require explicit confirmation text before writing.
