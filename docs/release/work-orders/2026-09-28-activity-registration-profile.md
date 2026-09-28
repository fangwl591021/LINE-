# 活動報名沿用會員註冊、AI商脈標題與完整 DM

## 1. 變更摘要
- 使用者授權首次報名填一次姓名、手機與同意聲明，沿用會員註冊後接續報名；標題改 AI商脈；DM 依上傳比例完整顯示。依既有授權測試後部署。
- 起始／回復點：422e5dfc5bfe8edb22681748ff92216f0eed158d。
## 2. 本次只允許
- 活動首次註冊表單與既有 registerUser 的活動專用保護；保留原活動、推薦與歸屬。已註冊不覆寫。
- 活動明細／報名紀錄 DM 不裁切；預設 AI工坊 標題改 AI商脈，保留自訂站名。
## 3. 禁止範圍
- 不改一般註冊、登入、好友、母站／點數規則、名片、商城、後台或資料表；不測試正式報名或建立正式會員。
## 4. 影響流程
- 活動明細、首次報名、會員建立與既有註冊副作用；無新會員／點數系統。
## 5. 修改前
- node tools/run-change-guard.js before：PASS。
## 6. 必讀規格
- feature-change-protocol、core-invariants、liff-routes、points-ledger、regression-matrix；Cloudflare / Workers best practices。
## 7. 不變規則
- 開頁不寫入；只有本人明確同意後才註冊。LINE token 驗證本人，不接受 ref/net 或傳入角色作為身份。
- 舊會員包含既有身份映射不覆寫；並行／重試以 users.line_id 唯一鍵保護。會員成功但報名失敗時保留會員，重試只報名。
- 點數／推薦名片副作用沿用既有新會員流程，不增加新規則；沒有 db migration。
## 8. 實作紀錄
- 新增活動專用前端表單 activity-registration.js，home.js 接續會員確認、報名與原活動核銷明細；index.html 預設品牌與腳本版本更新。
- workerbackup.js 沿用 registerUser/upsertUser，活動模式要求 token、同意與上架活動；只新增會員，既有／並行會員不覆寫，既有新會員副作用仍沿用。
- home.js 兩個活動明細圖片移除固定 aspect-video/object-cover；AI工坊 等預設別名改 AI商脈，自訂站名保留。
- 更新契約、快取版本測試、全 guard 清單，加入實際 SQLite 並行測試與合成 LINE 瀏覽器流程。
## 9. 修改後
- 49/49 活動註冊／登入／報名排序相關測試 PASS；包含身份偽造、拒絕同意、舊身份映射、不覆寫、並行註冊及原註冊更新。
- 真實 index/config/auth/home 的瀏覽器測試 PASS（320/390/1440px）：完整直式 DM、取消零寫入、同意、失敗、回應遺失後查回會員、報名重試、原活動明細、自訂站名。
- node tools/run-change-guard.js after、語法、git diff --check、Wrangler 4.136.3 deploy --dry-run：PASS。
- 依 Workers 規範在後端驗證活動專用註冊身份，使用既有 D1 綁定／唯一鍵，保留正式變數，不增加框架、資料表或平台設定。
## 10. 人工驗證
- 合成 LINE/API、隔離 SQLite 測試；不宣稱真實手機 LINE / 真實報名驗證。
## 11. 上線
- Worker 與 Pages；保留正式 bindings / variables，僅部署已測試提交。CI 與 live hashes 留 PR。
