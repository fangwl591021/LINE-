# Staging Environment Inventory

Date: 2026-07-12

| Resource | Environment | Status | Owner | Created | Isolation verified |
| --- | --- | --- | --- | --- | --- |
| Worker `line-engine-staging` | staging | configured in Wrangler, not deployed | unassigned | 2026-07-12 | config only |
| D1 `line-engine-staging-db` | staging | configured | unassigned | 2026-07-12 | yes, distinct ID |
| KV `LINE_ENGINE_STAGING_KV` | staging | configured | unassigned | 2026-07-12 | yes, distinct ID |
| R2 `line-engine-staging-assets` | staging | configured | unassigned | 2026-07-12 | yes, distinct bucket |
| LINE Messaging API channel | staging | missing | unassigned | unrecorded | no |
| LIFF app | staging | missing | unassigned | unrecorded | no |
| Webhook endpoint | staging | reserved only; Worker not deployed | unassigned | unrecorded | no runtime verification |
| Mother-site write API | staging | missing | unassigned | unrecorded | no |
| Point wallet | staging | mock mode only | unassigned | 2026-07-12 | no external write authority |

No secret values, full UIDs, or account credentials are recorded here.