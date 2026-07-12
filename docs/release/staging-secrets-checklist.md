# Staging Secrets Checklist

Record only status and ownership. Never record a value, token fragment, full UID, or secret in this file or in logs.

| Secret or setting | Required for staging | Status | Rotation owner | Last rotated | Scope |
| --- | --- | --- | --- | --- | --- |
| LINE_CHANNEL_SECRET | Yes for webhook verification | missing | unassigned | unrecorded | staging only |
| LINE_CHANNEL_ACCESS_TOKEN | Yes for staging replies | missing | unassigned | unrecorded | staging only |
| ADMIN_BOOTSTRAP_SECRET | Yes before bootstrap test | missing | unassigned | unrecorded | staging only |
| MOTHER_LINE_MEMBER_API_KEY | Required only for isolated mother-site write tests | missing | unassigned | unrecorded | staging only |
| NewebPay secrets | Required only for staging payment tests | not required | unassigned | unrecorded | staging only |
| OpenAI API key | Required only for staging AI tests | not required | unassigned | unrecorded | staging only |
| GAS URL | Required only when the staging webhook forwards to GAS | not required | unassigned | unrecorded | staging only |
| Webhook forwarding secret | Required only when staging forwarding is enabled | not required | unassigned | unrecorded | staging only |
| Session secret | Yes for authenticated staging tests | missing | unassigned | unrecorded | staging only |
| Encryption key | Required only for encrypted staging data | not required | unassigned | unrecorded | staging only |

## Gate

Before any staging migration or write test, the staging owner must mark required values as `configured`, verify that none share a production LINE channel, D1, KV, R2, webhook endpoint, point wallet, or mother-site write API, and record the rotation owner/date outside this repository.