# LIFF 身份遷移規格與檢查清單

## 目標

主登入身份改用點數通 LIFF：

- 舊主 LIFF: `2009886448-2UHnJgyT`
- 新主 LIFF: `1660923784-vViMTZ1y`

未來以新 LIFF 取得的 LINE UID 作為 canonical id。舊 UID 只作追溯與合併依據。

## D1 結構

套用 migration：

```powershell
cd "D:\OneDrive\文件\New project\LINE--git"
npx.cmd wrangler d1 migrations apply actmaster_db --remote
```

新增：

- `user_identity_links`
- `users.legacy_line_id`
- `users.point_line_id`
- `users.identity_source`
- `users.migrated_at`

## Worker 規則

- `checkUser` 先查 `user_identity_links`
- 若新 UID 已有對照，可讀回 canonical user
- `linkUserIdentity` 會寫入 `user_identity_links`
- `previewIdentityMigration` 只讀不寫，用來看目前遷移風險

## Preview API

```powershell
$body = @{
  action = "previewIdentityMigration"
  payload = @{
    limit = 100
  }
} | ConvertTo-Json -Depth 10

Invoke-RestMethod -Uri "https://line-engine.fangwl591021.workers.dev/" -Method Post -ContentType "application/json" -Body $body
```

此 API 需要 admin LINE token；前端後台呼叫會自動帶 token。

## 切換順序

1. 套用 `0003_identity_migration.sql`
2. 部署 Worker
3. 用後台或 API 跑 `previewIdentityMigration`
4. 確認 hard admin 新 UID
5. 更新 hard admin list
6. 再把 `DEFAULT_LIFF_ID` 改成 `1660923784-vViMTZ1y`
7. 清 KV 與手機 localStorage
8. 驗證會員、名片、活動、訂單、獎金

## 不可自動合併

- 同姓名不同手機
- 同手機但兩個已存在新 UID
- 新 UID 已綁另一個舊 UID
- admin 身份未確認

