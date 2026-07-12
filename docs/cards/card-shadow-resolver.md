# Card Shadow Resolver (CS-1A)

## Purpose and boundary

CS-1A adds fixture-safe, pure modules for comparing a proposed card resolution
against a legacy result. They are not imported by the Worker. They make no
database, network, runtime, ownership, UI, or write-path changes.

## Canonical actor

`resolveCanonicalCardActor(input)` uses a trusted identity only in this order:
webhook source UID, trusted LINE UID, LIFF UID, authenticated session UID.
Card aliases are evidence only. `owner`, `profile`, `bound`, `line`, scanner,
creator, inviter, name, phone, and email must never become a trusted actor by
fallback. Conflicting aliases yield `IDENTITY_CONFLICT`; mismatched networks
yield `TENANT_BOUNDARY`.

## Candidate classification

Personal sources are `self_profile`, `video_profile`, `line_generated`,
`self_upload`, and `claimed_personal`. Contact sources are `private_import`,
`ocr_scan`, `referral_placeholder`, and `claimed_contact`. Other or legacy
sources remain `LEGACY_UNCLASSIFIED`; the classifier does not guess from an
owner-like field.

Versions are resolved from explicit config and ID prefix. The supported values
are standard, giga, square, and video. Conflicting evidence records
`VERSION_MISMATCH` and `PREFIX_CONFIG_VERSION_CONFLICT`.

## Shadow resolver rules

`resolveCardShadow(input)` is read-only. My Card accepts only a canonical,
same-network personal card with the requested static version. Video has no
standard fallback. AI Card Folder accepts only same-network contact cards whose
scanner/collector is the current actor. LINE create records
`EXISTING_PERSONAL_CREATE_ATTEMPT` and returns the non-write decision
`BLOCK_CREATE_AND_ROUTE_TO_EDIT` when an active personal exists.

Multiple personal candidates remain unresolved. The resolver does not select
one silently.

## Legacy comparison and traces

`compareLegacyAndShadowResolution` emits only divergence codes and masked card
IDs. Trace records must not include raw UID, phone, name, email, URLs, image,
video, or `custom_config` payloads. `safeRunShadowResolver` isolates a shadow
error; future hooks must return the legacy result regardless of shadow failure.

## Future integration gate

Any runtime hook requires a separately approved feature flag, try/catch failure
isolation, masked telemetry, and proof that its returned API result is still the
legacy result. CS-1A does not authorize a Worker hook, migration, ownership
change, or UI change.
