# CRM application plan save

Problem: category buttons query applications but users expect CRM roles to persist. Add explicit member cooperation plan selector and save action in targeted CRM application dialog; separate from application category/review/payment.

Reuse existing desktop/mobile updateUserRole handlers and backend authority. No Worker, database schema, points, notification or automatic payment/contract enrollment changes. Protected accounts retain restrictions. Only user-initiated save changes selected CRM member.

Read: reward-applications, store-cooperation-plans, core-invariants, release protocol/skill. Before full guard passed. Validate successful save/close/reopen, API failure, cancellation, no-write category navigation, protected accounts, member visibility, desktop/mobile handlers; after guard/deploy pending.

Validation completed: before/after full guards passed; 24 role and signing UI tests passed. Real frontend adapter and three existing CRM handlers tested against an isolated SQLite fixture at 1280/390/320px: explicit save persisted after close/reopen and full page reload; category-only clicks made zero writes; failed/cancelled saves kept prior role; protected and nonadmin paths denied. Existing list stability browser regression passes all 6 contexts. No production role updates or application review writes performed. Screenshots remain outside Pages in ../crm-plan-save-qa.
