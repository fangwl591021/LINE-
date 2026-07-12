# Staging Platform Admin Bootstrap Test Plan

Run only after an isolated staging D1 has migration `0014`, an isolated staging LINE identity, and a separately managed staging `ADMIN_BOOTSTRAP_SECRET`.

1. Confirm `platform_admin_roles` is empty.
2. Call `bootstrapPlatformAdmin` without LINE token; expect rejection.
3. Call with an incorrect bootstrap secret; expect rejection.
4. Call with the correct secret and a verified staging LINE identity; expect one active `platform_admin` row.
5. Repeat bootstrap; expect one-time bootstrap rejection.
6. First admin calls `grantPlatformAdminRole` for a second staging identity.
7. Confirm second identity can call `getMyPlatformRole`.
8. First admin calls `revokePlatformAdminRole` for the second identity.
9. Attempt to revoke the only remaining active platform admin; expect rejection.
10. Confirm audit rows exist for bootstrap, grant, and revoke.
11. Confirm audit output has no token, secret, or full identity value.

Do not execute this plan in Phase 3B without explicit approval.