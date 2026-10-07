# Collected-card crop review and complete WYSIWYG image

## Scope and baseline

- Request: fix failed card separation and clipping in the shared WYSIWYG editor.
- Repository: fangwl591021/LINE-, baseline 0fcca2146ae755df73182acbac922920c97a34d5.
- Branch: codex/card-crop-review-integrity.
- Target: existing GitHub Pages frontend only. Worker, bindings, secrets and production records remain unchanged.
- Evidence: the saved reference image is byte-identical to the pre-crop compressed original. The editor applies fixed-ratio object-cover to that portrait photo.

## Allowed changes

- Track auto/manual/original/needs-adjustment review independently per face.
- Failed localization preserves the uncut source and requires adjustment or explicit original-image selection, not only a completeness checkbox.
- Show complete static images in the collected-card WYSIWYG editor; preserve personal-card and video layout semantics.
- Update focused tests, frontend cache versions and the collection-flow contract.

## Prohibited changes

- No existing card repairs, remote D1/R2 writes, paid OCR tests, credential changes, migrations, UID/owner/scanner changes, points, LINE keyword, resolver or activity changes.
- No extra AI calls or invented fixed trims; preserve one front/back OCR request and version isolation.

## Contracts read

- docs/rules/core-invariants.md
- docs/flows/my-card.md; docs/flows/ai-card-folder.md
- docs/data/card-ownership-and-versioning.md
- docs/contracts/card-resolvers.md; docs/contracts/button-actions.md; docs/contracts/liff-routes.md
- docs/tests/regression-matrix.md
- docs/release/feature-change-protocol.md; docs/release/change-checklist.md; docs/release/change-work-order-template.md

## Checks

- Before: node tools/run-change-guard.js before — PASS, baseline unchanged.
- After: node tools/run-change-guard.js after — PASS; focused crop, collection-side and contact tests — 31/31 PASS; adapter workflow check, syntax checks and git diff --check — PASS.
- Browser: PASS on the loopback-only surface using the retained reference photo and mocked OCR/save. Verified full WYSIWYG image proportions, failed-crop save blocking, cancellation preserving fields, independent front/back review, manual crop removing background, and reliable-crop confirmation before mock save. No paid/live OCR or customer-record write occurred.
- Boundaries: localization geometry/model is unchanged. Automatic boundary detection can still fail; the repair makes that failure explicit and recoverable without another OCR call.
- Physical iOS/Android LINE verification: unavailable in this desktop environment; do not claim device testing.

## Rollback

- Revert only this frontend commit and redeploy Pages. No data/Worker rollback needed.

## Release

- Frontend cache versions: scanner adapter v4.2 and mycard v8.93.
- Pending scoped PR, Contract Guard and Pages deployment; verify served files against this checkout after release.
