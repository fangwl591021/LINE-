# Staging Secrets Checklist

Record only status and ownership. Never record a value, token fragment, full UID, or secret in this file or in logs.

| Secret or setting | Required for staging | Status | Rotation owner | Last rotated | Scope |
| --- | --- | --- | --- | --- | --- |
| LINE_CHANNEL_SECRET | Yes for webhook verification | configured / missing / not required | unassigned | unrecorded | staging only |
| LINE_CHANNEL_ACCESS_TOKEN | Yes for staging replies | configured / missing / not required | unassigned | unrecorded | staging only |
| ADMIN_BOOTSTRAP_SECRET | Yes before bootstrap test | configured / missing / not required | unassigned | unrecorded | staging only |
| MOTHER_LINE_MEMBER_API_KEY | Required only for isolated mother-site write tests | configured / missing / not required | unassigned | unrecorded | staging only |
| NewebPay secrets | Required only for staging payment tests | configured / missing / not required | unassigned | unrecorded | staging only |
| OpenAI API key | Required only for staging AI tests | configured / missing / not required | unassigned | unrecorded | staging only |
| GAS URL | Required only when the staging webhook forwards to GAS | configured / missing / not required | unassigned | unrecorded | staging only |
| Webhook forwarding secret | Required only when staging forwarding is enabled | configured / missing / not required | unassigned | unrecorded | staging only |
| Session secret | Yes for authenticated staging tests | configured / missing / not required | unassigned | unrecorded | staging only |
| Encryption key | Required only for encrypted staging data | configured / missing / not required | unassigned | unrecorded | staging only |

## Gate

Before any staging migration or write test, the staging owner must mark required values as `configured`, verify that none share a production LINE channel, D1, KV, R2, webhook endpoint, point wallet, or mother-site write API, and record the rotation owner/date outside this repository.