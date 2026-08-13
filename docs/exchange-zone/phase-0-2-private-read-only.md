# 交流專區 Phase 0–2：私人唯讀入口

## 範圍

本階段只建立交流專區的存取開關、公開刊登資料骨架、LINE 式列表與右側內容抽屜。

- 不提供會員新增、編輯或下架。
- 不建立點數交易、訂單、付款或核銷。
- migration 不放入任何測試或假刊登。
- 清單只讀取 `published` 狀態資料。
- 前端不取得 LINE UID、資料庫數字 ID、名片 row ID 或點數資料。

## 存取模式

Worker 以 `EXCHANGE_ZONE_ACCESS_MODE` 控制：

- `private`：只有經後端驗證，且列在 `EXCHANGE_ZONE_PRIVATE_TESTER_IDS` 的 admin 可以進入；亦為缺少模式設定時的預設值。
- `pilot`：admin 與 `EXCHANGE_ZONE_PILOT_USER_IDS` 指定的帳號可以進入。
- `open`：所有具有有效 LINE access token 的登入會員可以進入。

首頁入口預設隱藏；只有 `getExchangeZoneAccess` 回傳 `allowed: true` 才顯示。清單與詳細內容 API 會再次執行相同的後端權限判斷，不能靠修改前端繞過。

## 唯讀 actions

- `getExchangeZoneAccess`
- `listExchangeZonePosts`
- `getExchangeZonePost`

三個 actions 都要求有效 LINE 登入，且不允許 D1 身分 fallback。

## 資料與隱私

對前端只回傳不透明的 `postHandle`、公開文字、最多三個聯絡標籤、發布時間、公開顯示名稱與安全 HTTPS 頭像。

電子名片只有在以下條件全部成立時才會出現在抽屜：

- 名片為 `self_profile`。
- 名片為 `public`。
- 名片的本人欄位與刊登作者一致。

## 發版條件

1. 套用 `0021_exchange_zone_foundation.sql`。
2. 部署 Worker 與前端。
3. 保持 `EXCHANGE_ZONE_ACCESS_MODE = "private"`。
4. 私測帳號清單不得提交至 Git；部署前以 Cloudflare Secret `EXCHANGE_ZONE_PRIVATE_TESTER_IDS` 設定逗號分隔的 LINE 使用者識別碼。
4. 使用 admin Android LINE LIFF 驗證列表、X、遮罩與返回頁面。
5. 一般會員確認入口不可見且 API 回傳拒絕。
