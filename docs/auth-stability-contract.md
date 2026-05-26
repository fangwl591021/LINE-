# 認證穩定契約

這份文件用來保護目前已恢復正常的 LINE / 點數通認證流程。後續新增功能時，除非正在修認證本身，否則不要改動這裡列出的契約。

## 不可破壞的規則

1. `dailyPointCheckin` 必須允許 D1 身分 fallback。
2. D1 fallback 必須接受 `pointUserId` 與 `pt_uid`。
3. 前端每日簽到必須同時送出 `userId`、`pointUserId`、`pt_uid`。
4. `queryUserPoints` 仍然只查 `gift_money`。
5. 點數 UID 橋接不可因為 LIFF ID 相同就被清除。
6. 查詢點數時必須優先使用 `ACTMASTER_POINT_UID_{userId}` 或網址中的 `pt_uid` / `wallet_uid` / `pointUserId` / `LINE_user_id`，最後才退回 `userId`。
7. Worker 的 `queryUserPoints` 若只收到目前 LIFF `userId`，必須再經過 D1 `point_line_id` / canonical identity 橋接後才查 wetw-point。

## 部署前檢查

每次改到 `workerbackup.js`、`js/auth.js`、點數、簽到、影片擷取或儲存流程時，先跑：

```powershell
cd "D:\OneDrive\文件\New project\LINE--git"
node tools\check-auth-contract.js
```

如果這支檢查失敗，先不要部署。

## 為什麼要保護這塊

這個專案同時有 LINE LIFF、點數通 LIFF、D1 身分對照、母站點數 API。很多功能都會呼叫 Worker，但不是每一條路徑都會有最新的 LINE access token。  
因此每日簽到、圖片儲存、影音擷取等功能需要一個穩定的 D1 身分 fallback，不能只依賴當下的 LINE token。
