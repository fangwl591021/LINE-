# Reward unit applications

- Only the free reward-unit application is supported; no partner/payment/discount agreement is inferred.
- Fresh LINE authentication is required. Only the submitting LINE UID or existing verified admin can read a record. Admin review rechecks stored authority in the write.
- Pre-sign preview freezes validated fields and server terms for 30 minutes. Submission requires electronic, terms and authority confirmations plus bounded signature strokes. A changed preview invalidates the old unsigned one.
- Preview ID is the idempotency key. Exact retries return the same record; differing submissions are rejected. Signed records cannot be edited. New content requires new signature.
- Private D1 stores full terms, fields, signer UID, strokes, server time and checksum. Never store tokens or signatures in logs, public R2, KV or URLs. Hash is not CA certification.
- Review accepts or rejects once; concurrent review cannot overwrite. Review never grants roles, awards points or publishes the unit.
- UI has visible close/back, account/lifecycle guards and stable retry payloads. PDF is a client-rendered copy of the immutable server snapshot, not a client-uploaded authoritative document.
- Tests: auth/ownership/admin denial, expiry, idempotency, invalid input/strokes, review concurrency, mobile signing and full PDF rendering.
