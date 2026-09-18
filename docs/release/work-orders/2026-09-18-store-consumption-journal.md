# 消費日誌第一階段

- 需求：依通知列表參考圖規劃後，使用者回覆「開始」。
- 起始版本：89dbe30ce01f14e19ff2e94df9874f68fb3e8dd5；main，起始工作目錄乾淨。
- 僅允許：本人消費日誌查詢、明細、未讀／已讀、日期／類型篩選、分頁、商城入口與獨立通知資料 migration。
- 預計檔案：worker/store-consumption-journal.mjs、worker-entry.mjs 路由、migrations/0039_*、js/modules/store-consumption-journal.js、css/store-consumption-journal.css、store-shop.js 與載入版本、獨立測試及文件。
- 禁止：修改點數餘額、母站錢包、收銀送出/session/防重、訂單付款／寄送狀態、會員映射、角色、LINE 推播、登入阻塞流程、secrets 或正式資料。
- 必讀契約：core-invariants、points-ledger、store-point-cashier-protected-flow、store-commerce、button-actions、feature-change-protocol。
- 修改前：node tools/run-change-guard.js before，PASS。
- 修改後：新增後端 SQLite 19/19、UI 11/11 通過；完整 guard:after PASS；Wrangler 4.134.0 dry-run PASS。未變更相容日期或正式設定。
- 部署授權：第一階段完成後，使用者於2026-09-18回覆「完成後部署」。本次可提交、套用0039獨立metadata migration並部署Worker與前台；不得改動交易、點數、身分或付款資料。
- 回復點：89dbe30；新增功能與既有點數紀錄分離。

## 驗收

本人資料限定；同交易不重複；UTC 只轉一次台灣時間；應付不冒充實收；純贈點不計消費；未讀只更動獨立通知資料；帳號或頁面改變不顯示遲到資料；既有收銀與點數紀錄不變。

## 完成內容

- 商城首頁及「我的」新增消費日誌；保留原點數紀錄入口，日誌可切回點數紀錄。
- 簡潔綠色通知列表；交易類型／日期篩選可展開，20 筆穩定分頁；詳情成功後才送已讀。
- 後端僅新增本人範圍 API；快照15分鐘有效，最多100筆本人過期快照清理，不刪交易或已讀狀態。
- 已取消訂單顯示原訂單金額；網購明細含商品與運費。不存在或非法數字顯示未提供。
- 原版測試中固定前端 cache-bust 版本同步更新：shop entry42、shop40、shop CSS27；既有功能斷言保留。
- 390×844與320×740本機合成資料瀏覽器驗收：無水平溢出，返回、已讀、類型篩選、分頁、關閉及焦點還原正常。最後收合篩選版本另於390px重新驗收，console無錯誤。
- 未新增首頁通知鈴鐺查詢、LINE通知或每月統計；避免在登入時查日誌。
- 發布前再次執行完整guard:after與Wrangler dry-run，皆PASS；獨立審查30/30 PASS。正式schema唯讀核對符合契約，遠端待套用清單只有0039。
- 發布順序：0039 → Worker → GitHub Pages。登入驗收只查看本人日誌，不贈扣點、不更動訂單；進入日誌可能建立本人觀看基準與快照。

## 正式發布紀錄

- 2026-09-18 06:47:53 UTC：正式actmaster_db已套用0039；再次列出為無待套用項目，3張metadata表及索引存在。
- Worker：line-engine；版本87f3eae7-c13c-44b1-bdba-d3fbc917d035。使用keep-vars保留既有設定，啟動時間1ms。
- 前端：GitHub Pages來源main根目錄；隨此提交發布entry42、shop40、CSS27與日誌v1。
- 原Worker回復點：b1233931-3658-4054-8750-fe7bbb431101；原程式回復點89dbe30。若需回復，先回復前端入口再回復Worker；保留新增metadata表，不刪除正式交易或讀取紀錄。
- 真機Android/iOS LINE內嵌瀏覽器本次無可控設備，不能宣稱已完成真機驗收；本機瀏覽器390px/320px驗收與30項測試已通過。
