# Local D1 Rebuild

This procedure is local only. The local fixture supplies the legacy tables required by the historical production migrations; it is not a production migration and must never be applied remotely.

Order is mandatory:

```text
fixture baseline
-> production migrations (0001 through 0014)
-> read-only verification
```

```powershell
$persist = '.wrangler-phase3a'
npx.cmd wrangler d1 execute ACTMASTER_DB --local --persist-to $persist --file tools\fixtures\local-d1\0000_clean_rebuild_baseline.sql
npx.cmd wrangler d1 migrations apply ACTMASTER_DB --local --persist-to $persist
npx.cmd wrangler d1 migrations list ACTMASTER_DB --local --persist-to $persist
npx.cmd wrangler d1 execute ACTMASTER_DB --local --persist-to $persist --command "SELECT (SELECT COUNT(*) FROM users) AS users, (SELECT COUNT(*) FROM card_contacts) AS card_contacts, (SELECT COUNT(*) FROM d1_migrations) AS applied_migrations;"
```

Expected result:

- `migrations list` contains only production migrations `0001` through `0014`.
- `0000_clean_rebuild_baseline.sql` is absent from `migrations/` and from the migration list.
- A clean rebuild reports zero application rows and 15 applied production migrations.

Do not use `--remote` in this workflow. Wrangler's local D1 executor may reject `PRAGMA integrity_check` and `PRAGMA foreign_key_check` with `SQLITE_AUTH`; use the schema and count queries above as the supported local verification.