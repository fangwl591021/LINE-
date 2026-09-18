# Login bootstrap phase 1

## 1. 變更摘要
- 日期：2026-09-18
- 需求：使用者同意繼續改善首次登入等待；本機驗證完成後，再明確要求「先提交、部署」。本次只發布 GitHub Pages。
- 起始／回復 commit：b0e1206
- 範圍：index.html、js/login-bootstrap.js、js/config.js、js/auth.js、js/core.js、js/modules/inbox.js、相關測試與版本契約。

## 2. 允許與禁止
- 允許：中性登入骨架、具體階段提示、普通首頁提前啟動既有 LIFF wrapper、好友唯讀查詢與 profile 並行、延後並合併 inbox badge／交流區入口查詢、匿名效能階段標記。
- 不提前授權；不更改 checkUser、角色、停權、好友門檻、歸屬綁定、會員恢复或點數流程。
- 不改 Worker、D1、migration、API payload、scope、UID resolver、名片歸屬、正式資料與 secrets。
- 特殊入口（Web/Share/Send/NFC/邀約/商品）不預初始化，沿用原路徑。

## 3. 必讀契約
- 已讀 core-invariants、my-card、liff-routes、feature-change-protocol、deployment-runbook。
- 保留一 UID 本人名片、scannedBy／推薦人、各版本互不覆蓋、分享分流、免費發送與手動折抵规则。

## 4. 修改前
- node tools/run-change-guard.js before：PASS，真正修改前執行。

## 5. 修改後與驗收
- node --check：login-bootstrap、auth、config、core、inbox、local preview fixture 均 PASS。
- node --test test/login-bootstrap.test.mjs：26/26 PASS。
- node --test test/store-invite-auth.test.mjs：19/19 PASS；亦在 full guard 再驗證。
- node tools/run-change-guard.js after：PASS。首次 after 發現兩項舊版 cache-bust 精確斷言未同步（store-admin-entry / store-invite-binding-entry）；只更新對應版本，再跑整套通過，未刪除行為斷言。
- git diff --check：PASS（只有 repo 既有 LF/CRLF 提示）。
- 本機 Chrome：390×844 手機與 1280×900 桌面等待骨架正常；手機無水平溢出。
- 本機假 SDK normal 情境：新版 profile 與 friendship 同時開始；baseline 為 profile 完成才開始 friendship。固定假延遲為 init 1200ms、profile 1800ms、friendship 1800ms，不視為正式改善秒數。
- 本機 friend-denied 情境：只出現好友門檻，沒有 checkUser 或其他業務 API 請求。
- 獨立原始碼複核：沒有剩餘 P1/P2。補驗 bfcache、切換帳號/token、功能路由、原本 cached/recovered session 回退。
- 不進行正式登入重置、贈扣點、註冊或資料寫入測試。
- 本機模擬耗時不能作為手機首次授權改善的實測證據。

### 實際變更與界線
- 新增 login-bootstrap.js：只對普通首頁／單純 OAuth callback 提前啟動完整 LIFF wrapper（包含原重試），保留初始參數。
- 非普通入口（含巢狀 liff.state / redirectUri 功能參數）不預啟動、不延後其既有附屬查詢。
- 好友唯讀查詢與 profile 並行；requestFriendship 及原 gate 仍在 profile 完成後。
- inbox badge 與交流區入口讀取延後至既有登入流程結束後兩秒，合併同 key，執行前驗 UID/token；沒有擴大任何權限。
- 原本 cached session / 成功恢復路徑仍保留，其權限快取政策不是此次修改範圍。
- 等待超過八秒顯示協助／重新連線，不自動放行或重複啟動驗證。
- performance 標記只有固定階段名稱，不含 URL、token、UID、電話或姓名，也不上傳。
- test/login-bootstrap-preview.cjs 僅供本機，假 SDK、假 API、connect-src self；不載入真正 LINE SDK，不連正式會員 API。
- 仍未做：整批功能模組 lazy load、後端首頁摘要拆分、runtime schema 改 migration；此輪不改 Worker。

## 6. 上線判斷
- 本機第一階段完成，before/after guard 通過；分支 codex/login-bootstrap-phase1。
- 發版前重新 fetch：origin/main 仍為 b0e1206，沒有遠端差異；完整 guard 再跑 PASS，獨立範圍複核無阻擋。
- 已獲使用者提交及部署授權。僅 fast-forward 發布到既有 main / GitHub Pages；不執行 Wrangler、不部署 Worker、不改 secrets 或正式資料。
- 此工作單所屬的功能 commit 為本次發版版本；發布結果以該 commit 的 GitHub Pages 與 Contract Guard 紀錄，以及正式靜態檔比對為準。
- 發布後以既有登入 session 唯讀確認首頁／商城入口；不重置使用者登入、不操作簽到、贈扣點、下單或註冊。
- 正式手機 LIFF 首次授權與實際速度仍需獨立量測；不可把此次 fixture 數字宣稱為正式改善。
