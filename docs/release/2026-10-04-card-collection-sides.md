# Collected business cards: optional back

Scope: front required, back optional; one OCR request containing both images; one private contact record. Existing editable records have a back-upload action and update the original row ID. Claimed/read-only records retain their existing restrictions.

Storage: `custom_config.collectionImages = {front, back}`. No D1 migrations or bulk record rewrites. Existing values, identity, buttons, layout and industry classification are retained when adding a back. Conflicting recognized contact fields keep their previous values until manual review; service text can be merged. The server-returned card config/revision is used after saving.

Validation: full change guard before/after, paired OpenAI/Gemini fallback tests, single-sided compatibility, same-ID update/retry, access guards, config revision/retention, synthetic browser tests at mobile width, Worker dry-run. Browser fixtures mock AI and writes; they never write production data or award points. Actual phone camera/real AI accuracy still depends on the supplied card image and should be checked on a device.

Deployment order: deploy the backward-compatible Worker first, then publish frontend via main/Pages. Keep existing Worker vars/secrets/bindings. Adapter v3.9, cards v8.04.

Rollback baseline: frontend/main `0add20a`, Worker `9c6464db-282b-41fe-8fc3-bbadd74c0ec5` (PR174). Revert this change on main to restore the previous UI; revert/deploy the OCR module or use Wrangler rollback to that recorded Worker version after confirming it is still the intended baseline. Stored back images/config can remain; old code ignores them. Do not delete cards, R2 images, or change LINE/points ownership for rollback.
