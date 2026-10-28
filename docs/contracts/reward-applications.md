# Reward unit applications

- Four explicitly chosen documents use the signing lifecycle: reward-unit, discount-store, partner 115.10 and full-plan. Signing the free reward/discount document never implies accepting a partner or paid full-plan agreement.
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

## Partner 115.10 and full-plan signing (2026-10-28)

- Fixed `/v1/partner-applications` and `/v1/full-applications` use separate preview, signed-record and review tables. Current source/version pins and private template checksums are validated before preview and again by the atomic signed INSERT; revoked/changed previews cannot sign, existing signed records remain readable.
- Original private DOCX files and full terms (including bank information) are not published with Pages. Only source hashes and field definitions are in code. Private D1 `signing_application_templates` serves the approved full terms and policy clarifications after fresh login; source JSON/SQL/PDF QA artifacts stay outside the public repository.
- Partner source SHA256 is `224dac420aba1f0990f5de713e7125c4d9699a6a11f84ee6aed6f8ddee7da4aa`; full-plan source is `27fcbe65095b3a5fd06e2ec51b312d44b5e8ae5f60a241a880d1e03613cf1821`. The full 102/36 source paragraphs and approved clarifications are part of the signed snapshot and PDF copy.
- The prior user decisions are visibly included: Article12 prevails over conflicting Article10, established unpaid awards cancel on termination with paid ledgers preserved; quota is the most recent rolling12months with renewals/reactivation excluded. No other policy calculation changes.
- Partner forms include party/representative, contact, bank and readonly verified CRM referrer/member-number fields. Referrer relationships use unique stored identities and explicit active links, never name/phone guesses. Preview and final write pin current identity evidence. Full-plan fields come from its supplied application and clearly show annual6000ex-tax/6300inclusive; submit does not charge.
- All types remain pending review; signing/review never assigns roles, enrolls a partner bonus contract, creates a paid order, or changes points. Existing partner registry remains an explicit admin verification step using the signed document.
- Review rechecks all seven stored authority fields including name/phone because existing hard-admin authority may use them. The same atomic INSERT also preserves the original resolver's unique cross-row aliases and exact active-link set, so an identity conflict introduced after authorization cannot review. No client URL or UI role grants access.

## Submission notifications

- Additive0078 attaches AFTER INSERT outbox triggers to all four signed tables. No historical backfill; successful retry cannot enqueue twice. No signature, bank or full document appears in notification payloads/logs.
- Existing minute cron processes one recipient cohort per invocation with a30-second collection delay. Typically1–3minutes; backlog, revoked authority, LINE failure or quota can delay it. Up to10 documents for the same current administrator use one push; two or more use a Flex carousel.
- Existing admin IDs/name clues only discover candidates; the original admin-page identity resolver and role mapper decide authority again immediately before delivery. Conflicting identities cancel delivery without rerouting. No newly guessed UID or public recipient setting.
- A frozen recipient/payload and stable LINE retry UUID are private and persistent. Timeout/unknown responses use the same key, bounded attempts and less than24hours; accepted409 responses finalize without duplicate push. Permanent failure does not delete a signed record or grant a new signing request.
- Deep link carries only fixed kind and opaque application ID. Fresh LINE/admin validation is required to open the specific review; a nonadmin link holder cannot read the contract.
- No new cron schedule, bindings/secrets or message-reply owner; no real test submissions or pushes. Notification events begin only with future real successful submissions.
