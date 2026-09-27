# 活動網址跳轉與首頁延遲修正

## 1. 變更摘要
- 來源：使用者提供 ACT_fcfc401d-d559-4d0e-bbf4-73ff21973e09 活動 LIFF，先進首頁、許久後才進報名頁。依既有授權修正後部署。
- 起始／回復點：6b96f07061ba554601e9359f58e4584393a258f0。
- 範圍：新增 js/modules/activity-entry.js，調整 js/auth.js、home.js 的純活動入口、index.html 版本、測試及 LIFF 路由契約。
## 2. 只允許改什麼
- 純活動 View Route 直接讀單筆活動；登入、好友、會員查詢原機制不變。
- 明確 net=admin 不可被 ref UID 覆蓋成活動網路；不變更會員自身 networkId。
## 3. 禁止範圍
- 不改 Worker/API/DB/點數/報名寫入/名片/認領/分享/店家及混合路由；不寫正式測試報名。
## 4. 已確認原因
- auth.js 在會員讀取前先 goPage(home) 並套用首頁快取。
- home.js 的所有角色活動載入排程均為 14000ms，loadUserActivities 完成才 openActivityFromUrlParam。
- Chrome DevTools MCP 已嘗試 list_pages/navigate_page，均因既有 chrome-profile 被占用失敗；停止此錄製，不關閉使用者瀏覽器。以程式與隔離瀏覽器重現驗證，不把合成延遲或外部 LINE 登入時間當實機效能數據。
## 5. 修改前
- guard before PASS。
## 6. 已讀規格
- feature-change-protocol、core-invariants、liff-routes，既有 login-bootstrap／activity rendering／getActivityById 範圍檢查。
## 7. 不變規則
- URL 的 ref/net 不是會員／操作者權限；依 token 與既有後端驗證。無自動報名、無點數或推薦人寫入變更。
## 8. 實作紀錄
- 新增純活動入口模組，登入驗證前顯示活動等待頁；驗證後立即使用既有 getActivityById，不執行 loadHomeData，也不讀首頁會員快取開頁。
- 保留 LIFF 初始參數快照，明確 n=admin 優先於推薦人。只改活動顯示上下文，不改會員歸屬或後端權限。
- 下架／不存在／失敗／逾時提供重試與返回；離開／UID 或 token 改變後丟棄舊回應，不自動報名。
- index 更新 home v8.11、auth v11.07，新增 activity-entry v1；相關版本鎖定測試同步更新，未移除既有契約斷言。
## 9. 修改後
- 相關 Node 測試 47/47 PASS（其中 login-bootstrap 包含 7 項新增活動入口測試）；JS 語法及 git diff --check PASS。
- 瀏覽器 test/browser/activity-entry.mjs PASS：實際 index/auth/core/navigation/home 與合成 LIFF/API，320／390／1440px 無水平溢出，報名及返回控制可操作。慢會員查詢不進首頁、驗證後直接讀單筆、LIFF 巢狀連結、錯誤重試、離開後舊回應隔離均通過；無自動正式寫入。
- guard after 首輪只有兩個舊 auth 版本字串鎖定失敗，更新至 v11.07 後完整 guard after PASS；沒有為通過測試改變私訊等其他功能。
## 10. 驗證範圍
- 合成 LIFF 與 API，不呼叫正式報名；既有活動讀取可唯讀核對。
## 11. 部署
- 僅 GitHub Pages，Worker 無改動。全測通過後部署並核對 live SHA256。
- CI、部署 commit、正式資產核對結果於本次 PR 留存。
