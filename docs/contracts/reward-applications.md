# Reward unit applications

- Free reward-unit and discount-store applications are separate explicitly chosen types; no partner/payment agreement is inferred.
- Fresh LINE authentication is required. Only the submitting LINE UID or existing verified admin can read a record. Admin review rechecks stored authority in the write.
- Pre-sign preview freezes validated fields and server terms for 30 minutes. Submission requires electronic, terms and authority confirmations plus bounded signature strokes. A changed preview invalidates the old unsigned one.
- Preview ID is the idempotency key. Exact retries return the same record; differing submissions are rejected. Signed records cannot be edited. New content requires new signature.
- Private D1 stores full terms, fields, signer UID, strokes, server time and checksum. Never store tokens or signatures in logs, public R2, KV or URLs. Hash is not CA certification.
- Review accepts or rejects once; concurrent review cannot overwrite. Review never grants roles, awards points or publishes the unit.
- UI has visible close/back, account/lifecycle guards and stable retry payloads. PDF is a client-rendered copy of the immutable server snapshot, not a client-uploaded authoritative document.
- Tests: auth/ownership/admin denial, expiry, idempotency, invalid input/strokes, review concurrency, mobile signing and full PDF rendering.

## Discount-store application (2026-10-23)

- `/v1/discount-applications` reuses the signing lifecycle but only maps three fixed SQL identifiers to independent discount tables. Reward previews, records, terms and consent remain isolated and readable.
- Full terms are from the supplied discount-store application: free application, minimum 10%, ordinary 10%-50% range, special events independently set, publication permission, merchant responsibility and termination contact. This does not set any actual cashier/catalog percentage.
- Fields: store/unit name, main products/services, business types including other, applicant, mobile, optional LINE ID and declared assisting partner. Canonical CRM referrer remains separately server-snapshotted; declared partner is not verified identity or referral reassignment.
- Require all five explicit confirmations: electronic signing, terms, representative authority, discount agreement and public-information permission. Neither signed record nor signature is published; publication and enabling permissions remain separate.
- Admin review cannot write roles, balances, referral links, products, cashier or public listings. All old reward tests must still pass.
