# 加好友後返回原活動

## 1. 變更摘要
- 使用者授權補上「加好友後仍回到原活動」；依既有授權測試後直接部署。
- 起始／回復點：9b42f42387e79a46b787a912cf86f7e3b1d2a788。
- 範圍：activity-entry.js、config.js 的好友確認回跳、index 快取版本、相關測試與契約。
## 2. 本次只允許
- 接受既有 point_friend=1 回跳標記、保留原活動路由快照；重新登入驗證後直接開活動。
## 3. 禁止範圍
- 不改好友驗證條件、會員註冊／手機要求、報名／點數／名片／後台／Worker／DB；不執行正式好友或報名測試。
## 4. 原因
- recheckActmasterPointFriendship 成功後加上 point_friend=1，但純活動白名單拒絕此參數；LIFF 清理 URL 後也須保留原活動、推薦與歸屬資訊。
## 5. 修改前
- node tools/run-change-guard.js before：PASS。
## 6. 規格
- 已讀 feature-change-protocol、core-invariants 與 liff-routes；先更新 LIFF 契約。
## 7. 不變規則
- URL 標記不代表好友／登入／會員權限；仍要求實際好友確認及既有後端認證。只保留同源活動路由參數，不保留 OAuth 資料。
## 8. 實作紀錄
- 純活動入口接受單一 point_friend=1；在 LIFF 初始化前保存同源 activityId/net/ref/via，好友確認成功後優先使用此回跳網址。
- 不保留 OAuth code/state/token；非活動路由及已離開活動頁面仍沿用原網址。config 快取升至 9.16、activity-entry 升至 2。
## 9. 修改後
- node --test test/login-bootstrap.test.mjs test/activity-registration-history.test.mjs：42/42 PASS。
- node test/browser/activity-entry.mjs：PASS，320/390/1440 寬度；合成好友加入往返、被 LIFF 清理的網址、未註冊帳號仍停留原活動，無自動寫入。
- node tools/run-change-guard.js after：PASS；config/activity-entry 語法及 git diff --check：PASS。
## 10. 驗證
- 合成 LINE／API 測試，新朋友加入、取消加入、偽造標記、LIFF 清理參數、非活動入口不受影響；不宣稱手機 LINE 實機測試。
## 11. 部署
- 僅 Pages；無 Worker／migration。CI、合併與 live hash 證據留在 PR。
