# Platform Admin Role Model

Platform authority is D1-backed. `users.role` is tenant scope only and never grants platform administration.

Flow: verified LINE access token -> canonical identity -> active `platform_admin_roles` row -> Worker actor role `admin`.

Bootstrap requires an authenticated LINE actor, `ADMIN_BOOTSTRAP_SECRET`, an empty role table and an unused one-time bootstrap state row. Set the secret outside source control before deployment; after bootstrap, rotate or remove it.

`grantPlatformAdminRole`, `revokePlatformAdminRole` and `listPlatformAdminRoles` are platform-admin actions. All changes write `platform_admin_role_audit`. Revoking the final active `platform_admin` is rejected.

Legacy `users.role=admin` is not a platform grant. It resolves to `user` unless the identity has an active D1 platform role.