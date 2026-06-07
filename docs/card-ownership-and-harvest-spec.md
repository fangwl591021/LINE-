# Card Ownership And Harvest Spec

This document defines how personal cards, scanned cards, claim links, and referral links must behave.

The goal is to prevent these production failures:

- A user's personal card opens as someone else's card.
- A scanned customer card becomes the scanner's personal card.
- A claimed card, generated LINE card, and scanned card create duplicates for the same UID.
- The AI card folder shows fewer cards than the user actually scanned.
- Referral/inviter data overwrites ownership data.

## Core Terms

`ownerUid`

The LINE UID that owns a personal card. This is the person represented by the card.

`scannerUid`

The LINE UID that scanned or uploaded another person's business card into AI card folder.

`inviterUid`

The LINE UID that invited a user through QR, share link, or referral flow.

If there is no real inviter, the value defaults to `admin`.

Important: `admin` means system/default ownership, not a human recommender. UI must visually mark this case with a different color/status so operators can distinguish:

- real recommender UID
- system/default `admin`
- missing/invalid referral source

`collectorUid`

Alias for `scannerUid` when the card is stored in the scanner's collected-card list.

`sourceEventId`

Immutable ID for one scan/upload/import event. This must exist before a scanned card is created or merged.

`sourceType`

Card type:

- `self_profile`: the user's own personal card.
- `private_import`: a card scanned or uploaded into AI card folder.
- `referral_placeholder`: temporary claim/invitation placeholder.
- `video_profile`: the user's own video card.

## Ownership Rules

### Personal Card

A personal card is owned by `ownerUid`.

Rules:

- One UID can have only one active personal card identity.
- Standard, poster, square, and video are versions of that same identity, not separate people.
- Creating a LINE-template card, claiming a card, or uploading the user's own card must first resolve existing personal card by `ownerUid`.
- If a personal card already exists, the flow must open or update the existing card. It must not create a second personal card.
- `scannerUid` and `inviterUid` must never overwrite `ownerUid`.

Allowed personal-card sources:

- User creates from LINE profile/template.
- User uploads their own card through "My Card".
- User claims a scanned/referral card through an explicit claim flow.

### Scanned Card

A scanned card is a collected CRM/contact asset owned by the scanner's collection, not by the represented person.

Rules:

- Scanned cards must use `sourceType = private_import`.
- Scanned cards must set `scannerUid`.
- Scanned cards may have no `ownerUid` until the represented person explicitly claims ownership.
- Scanning someone else's card must not create or replace the scanner's personal card.
- Scanning your own card from AI card folder must be rejected or redirected to "My Card".

### Claim Link

A claim link allows the represented person to claim a card.

Rules:

- Claiming sets `ownerUid` to the claimant UID.
- Claiming must not erase `scannerUid`; the scanner keeps collection visibility.
- If the claimant already has a personal card, the system must merge or ask for confirmation. It must not create another active personal card.
- If the card is already claimed by another UID, the claim must fail.

### Referral Link

A referral link records who invited the visitor.

Rules:

- Referral writes `inviterUid` or `referrerUid`.
- If there is no real inviter, referral defaults to `admin`.
- `admin` referral must be treated as system/default attribution and must be color-marked in UI.
- Referral must not create a personal card automatically.
- Referral must not change card ownership.
- Referral must not change scanner ownership.
- Referral may create a lightweight user/profile placeholder only.

## Required Data Model

Minimum fields for `card_contacts`:

- `row_id`
- `line_id`
- `owner_user_id`
- `profile_user_id`
- `creator_id`
- `scanner_user_id`
- `scanner_name`
- `source_type`
- `visibility`
- `pool_eligible`
- `ai_review_status`
- `custom_config`
- `created_at`
- `updated_at`

Recommended additional fields:

- `source_event_id`
- `claimed_from_row_id`
- `claimed_by_uid`
- `claimed_at`
- `merged_into_row_id`
- `archived_at`

Required scan/import event table:

```sql
CREATE TABLE IF NOT EXISTS card_import_events (
  event_id TEXT PRIMARY KEY,
  scanner_uid TEXT NOT NULL,
  inviter_uid TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'line_oa',
  image_count INTEGER NOT NULL DEFAULT 1,
  raw_message_ids TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'received',
  card_row_id TEXT NOT NULL DEFAULT '',
  reject_reason TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

Valid event statuses:

- `received`
- `ocr_processing`
- `review_ready`
- `created`
- `merged`
- `rejected`
- `failed`

## Duplicate Prevention

### Personal Card Duplicate Rule

Before creating `sourceType = self_profile` or `sourceType = video_profile`, resolve by UID:

```text
line_id = ownerUid
OR owner_user_id = ownerUid
OR profile_user_id = ownerUid
OR creator_id = ownerUid AND source_type IN ('self_profile', 'video_profile')
```

If found:

- Update existing card/version.
- Do not create a new identity row.

If multiple found:

- Choose the newest valid personal card as canonical.
- Archive or unlink the others after explicit admin confirmation.
- Preserve their history in an audit/merge record.

### Scanned Card Duplicate Rule

Before creating `sourceType = private_import`, compare within the scanner's collection:

```text
scanner_user_id = scannerUid
AND source_type = 'private_import'
AND (
  normalized phone matches
  OR normalized email matches
  OR name + company matches
)
```

If found:

- Update/merge existing collected card.
- Link the new `sourceEventId` to the existing card.
- Do not award duplicate scan points.

### Self-Scan Rule

If uploaded/scanned card matches current user's personal card by UID, phone, or explicit claim:

- Do not create a private imported card.
- Show/return "This is your own card. Please edit it in My Card."

## Visibility Rules

### My Card

Shows only personal cards:

- `sourceType = self_profile`
- `sourceType = video_profile`

It must not show:

- `private_import`
- `referral_placeholder`

### AI Card Folder

Shows only collected cards:

- `sourceType = private_import`
- `scannerUid` belongs to the current user's identity alias set.

It must not show:

- Personal cards.
- Mother-site/system cards.
- Cards scanned by another user unless explicitly shared by permission.

### Public AI Matching Pool

A card can enter public matching only when all are true:

- `sourceType = self_profile`
- `visibility = public`
- `poolEligible = 1`
- `aiReviewStatus = passed`
- image, title, description, and buttons pass safety/completeness checks.

Scanned/imported cards must never enter public cross-store matching by default.

## Integrity Checks

The system must support a read-only admin audit that reports:

1. Import events without cards.
2. Cards without source events.
3. Cards where `sourceType = private_import` but `scanner_user_id` is empty.
4. Cards where `sourceType = self_profile` but owner fields disagree.
5. Duplicate personal cards per UID.
6. Duplicate scanned cards per scanner.
7. Imported cards where `scannerUid = ownerUid`.
8. Scan count by UID vs collected-card count by UID.
9. Claimed cards where scanner visibility was lost.

Minimum reconciliation formula:

```text
scanner imported count =
  card_import_events where scanner_uid = UID and status in ('created', 'merged')

scanner stored count =
  card_contacts where scanner_user_id = UID and source_type = 'private_import'

missing count =
  imported count - stored/merged count
```

Any mismatch must list the exact event IDs and card row IDs.

## Write Flow Contracts

### AI Card Folder Scan Flow

1. User triggers AI card folder keyword or upload UI.
2. System creates `card_import_events` with `scannerUid`.
3. OCR parses the image.
4. User reviews parsed fields in LIFF.
5. On submit:
   - Reject if non-business-card.
   - Reject or redirect if self-scan.
   - Deduplicate inside scanner collection.
   - Create or merge `private_import`.
   - Set `scanner_user_id`.
   - Link `source_event_id`.
6. Push the created/merged card to the LINE chat.

### My Card Flow

1. User clicks "My Card".
2. System resolves personal card by current UID alias set.
3. If found, open existing personal card.
4. If not found, offer template or own-card upload.
5. On save:
   - Create/update `self_profile`.
   - Do not use scan ownership fields as owner identity.
   - Automatically allow public pool only if completeness and AI review pass.

### Claim Flow

1. Claim URL opens LIFF.
2. System loads claim card.
3. System validates card is unclaimed or already claimed by the same UID.
4. System resolves existing personal card for claimant.
5. If claimant has no personal card:
   - Convert or copy claim card to `self_profile`.
6. If claimant has personal card:
   - Require merge confirmation.
   - Do not create a new active personal identity.
7. Preserve scanner collection visibility.

## Acceptance Criteria

The next code change is not complete unless these checks pass:

- A new user invited by QR can enter the home page without automatic registration.
- Clicking "My Card" creates or opens exactly one personal card for that UID.
- Scanning another person's card puts it only in AI card folder.
- Claiming a scanned card binds that represented person without removing the scanner's collection record.
- Repeating the same scan updates or merges, not duplicates.
- The scanner's collection count matches import event audit.
- Public matching uses only completed self-profile cards, never scanned cards.
- Admin can list duplicate personal cards before repair.

## Non-Goals

This spec does not define UI styling, card layout, points pricing, or message copy.

Those can change later, but they must not weaken the ownership and integrity rules above.
