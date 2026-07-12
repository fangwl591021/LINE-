# Card Shadow Hook Foundation (CS-1B)

`CARD_SHADOW_RESOLVER_ENABLED` defaults to disabled. Only `1`, `true`, `on`,
and `yes` enable the hook. `undefined`, empty, `0`, `false`, `off`, and `no`
remain disabled.

The foundation is an isolated CommonJS wrapper, not a Worker integration. It
does not query or write D1, fetch external services, mutate inputs, modify
ownership, or change HTTP responses. `resolveWithCardShadow` always returns
the exact legacy object reference.

Logs have an allowlist only. They include resolver/version/entry metadata,
counts, divergence code, sanitized diagnostics, duration bucket, timestamp,
and one-way hashed card identifiers. They exclude UID, names, phones, email,
URLs, images, video, custom config, request/event bodies, tokens, and secrets.
`CARD_SHADOW_HASH_SALT` is used only locally for hashing and is never logged.

Any future Worker hook needs separate approval, a feature flag, try/catch
isolation, no additional query when disabled, and proof that legacy response,
status, headers, and body remain unchanged. Rollback is flag-off.
