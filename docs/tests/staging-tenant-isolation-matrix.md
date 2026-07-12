# Staging Tenant Isolation Matrix

Use only `STG_` fake tenants, identities, cards, and CRM contacts.

| Case | Actor | Target | Expected result |
| --- | --- | --- | --- |
| Read CRM | Tenant A manager | Tenant B CRM | Denied |
| Update card | Tenant A manager | Tenant B card | Denied |
| Read data | Tenant A member | Tenant B member/card/contact | Denied |
| Forged payload | Tenant A member | payload userId for Tenant B | Denied; no role elevation |
| Cross-tenant admin | Platform admin | Tenant B scoped resource | Allowed only where action policy permits |
| SQL scope | Tenant A manager | Tenant B network/tenant rows | No returned or updated rows |

Record only case identifiers and pass/fail evidence. Do not store real customer records in Git.