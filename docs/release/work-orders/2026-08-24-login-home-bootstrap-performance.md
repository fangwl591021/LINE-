# Optimize LINE login home bootstrap

## 1. 變更摘要

| 項目 | 內容 |
| --- | --- |
| 日期 | 2026-08-24 |
| 需求來源 | 使用者要求依 Chrome DevTools 39 秒登入錄製結果開始優化 |
| 目標功能 | 減少 OAuth callback 後的重複首頁請求與點數查詢競爭 |
| 起始 commit | af539a8 |
| 預計修改檔案 | auth、home、inbox、index、cache-bust contracts、本工作單 |
| 是否部署 | 是，僅 GitHub Pages |
| 回復點 | af539a8 |

## 2. 本次只允許改什麼

- 登入落地首頁時，避免 goPage 與 loadHomeData 重複啟動相同資料載入。
- 合併同 key 的首頁背景 in-flight 工作與 getSubsiteHome 請求。
- 將獨立點數查詢改成聚合首頁資料失敗後的延遲備援。
- 更新必要的前端 cache-bust 版本與對應 contract。
- 第二輪將非關鍵首頁 API 分階段載入、取消首頁預抓完整名片庫，並讓收銀紀錄保持折疊 lazy load。

## 3. 本次禁止碰什麼

- 不改 Worker、API action、payload、LINE token 驗證與 checkUser 判斷。
- 不改 UID resolver、tenant/role 權限、名片 owner/scannedBy 或公開池。
- 不改母站點數權威、point identity bridge、ledger 或任何點數資料。
- 不改 D1、migration、production secrets、LINE OA webhook 或 LIFF scope。

## 4. 影響流程

- [x] LIFF route
- [x] 點數顯示的登入後載入時序
- [x] 其他：首頁 bootstrap 與背景資料排程
- [ ] 我的名片資料與歸屬
- [ ] AI名片夾
- [ ] 名片 OCR / 收錄名單
- [ ] 名片版本
- [ ] LINE OA keyword
- [ ] 分享 / 推播 / shareTargetPicker
- [ ] 點數 ledger / 優惠券 / 扣點
- [ ] 收件匣資料權限
- [ ] 跟進資料
- [ ] 公開池 / AI配對資料
- [ ] 後台 CRM / 權限

## 5. 修改前必跑

Command: npm run guard:before

Result: NOT RUN AS A TRUE PRE-EDIT BASELINE.

本輪先完成 DevTools 正式頁錄製與最小修改，之後才定位到 repo 的 feature-change protocol。不倒填 before 結果；修改後已執行 smoke 與完整 guard:after。

## 6. 必讀規格

- [x] docs/rules/core-invariants.md
- [x] docs/flows/my-card.md
- [x] docs/contracts/liff-routes.md
- [x] docs/deployment-runbook.md
- [x] docs/release/feature-change-protocol.md

## 7. 不變規則確認

- [x] LINE UID、tenant、role 與 token 驗證未變。
- [x] 我的名片與 AI名片夾歸屬規則未變。
- [x] scannedBy、推薦人、歸屬網未變。
- [x] 母站點數仍為權威；前端不直接寫入點數。
- [x] 分享、Send、Web 與 Edit route 分流未變。
- [x] Worker、D1、migration 與 secrets 未變。

## 8. 實作紀錄

實際修改檔案：

- index.html
- js/auth.js
- js/modules/home.js
- js/modules/inbox.js
- tools/check-inbox-send-result-guard.js
- tools/check-main-liff-endpoint-contract.js
- tools/check-ai-match-interest-contract.js
- docs/release/work-orders/2026-08-24-login-home-bootstrap-performance.md

關鍵決策：

1. 登入流程仍先顯示首頁，但使用 goPage 的 init 模式，由唯一的 loadHomeData 排程資料。
2. 同一首頁背景 key 執行中時，後續重複排程直接合併，不平行重送。
3. getSubsiteHome 使用單一 in-flight Promise；成功後仍沿用原有 30 秒快取。
4. 點數獨立查詢延至 8 秒且只有聚合 wallet 尚未 ready 才執行。
5. API、權限、身分與點數 payload 完全不變。
6. 第二輪正式 trace 顯示登入後同時啟動約 22 個 POST，多個動作達 18 秒逾時；因此 getSubsiteHome 保持第一優先，其餘首頁區塊依 3/5/7/9/11/14 秒分階段載入。
7. 首頁不再預抓完整名片庫；使用者進入名片頁時仍由既有 navigation loader 載入。
8. 收件匣 badge 在登入期間 15 秒內只送一次；收銀紀錄僅在面板實際展開時載入。

## 9. 修改後必跑

- node --check js/auth.js
- node --check js/modules/home.js
- npm run smoke
- npm run guard:after
- git diff --check

結果：PASS。JavaScript syntax、smoke contracts、full guard:after 與 git diff --check 全部通過。

## 10. 人工驗證

| 測試項目 | 結果 | 備註 |
| --- | --- | --- |
| 修改前正式頁 Chrome DevTools trace | PASS | 正式頁 LCP 0.63-1.07s；callback 後首頁請求 fan-out 到約 11.5s |
| 正式靜態檔與 origin/main SHA-256 對照 | PASS | index、auth、core、home 完全一致 |
| 第一輪上線後正式頁 Network/trace | PASS | FCP 1.54s、LCP 6.92s、load 22.46s；確認主要剩餘問題為約 22 個首頁 POST 競爭及多個 18 秒 timeout |
| 第二輪正式頁 Network/trace | PENDING | 第二輪 GitHub Pages 發佈後重測 API 數、逾時與完整登入時間 |

## 11. 上線判斷

- [ ] guard before 通過；未作為真正 pre-edit baseline，已如實記錄。
- [x] guard after 通過。
- [x] 修改範圍符合第 2 節。
- [x] 沒有碰第 3 節禁止區域。
- [x] 只需要部署 GitHub Pages，不部署 Worker。

結論：可部署 GitHub Pages；第二輪發佈後必須驗證 cache-bust、首頁登入、初始 API 數與 18 秒 timeout 是否消失。
