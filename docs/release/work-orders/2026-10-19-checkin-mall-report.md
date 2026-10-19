# 母站打卡補送卡片與點擊者報告

- 授權：使用者接受保留母站文字，另補新版卡片與點擊者報告；測試通過直接部署。沿用既有金鑰。
- 日期：2026-10-19；repo fangwl591021/LINE-，分支 codex/checkin-mall-report-20261019；起始／回復 commit 21b54c1c1e6fd8f1d46c10d586ef49a14cc87055。
- 目標：line-engine、actmaster_db（8a0107f9-000d-4810-b6bf-5d599b699195）、現有 LINE- GitHub Pages。不是 Smart-Menu-Studio 根專案。
- BEFORE：node tools/run-change-guard.js before 完整通過；沒有改動舊有未追蹤檔案。
- 已讀：core-invariants、line-keywords、liff-routes、button-actions、points-ledger、regression-matrix、feature-change-protocol、change-checklist／工作單模板，以及 Workers／Wrangler 與 runtime/configuration 參考。
- 只允許：新增獨立卡片／點擊稽核表、背景補送模組、已登入商城入口紀錄、管理員唯讀報告、測試、契約與版本更新。
- 禁止：母站程式與設定、打卡／贈點／扣退點／會員建立／UID resolver、母站 replyToken、其餘關鍵字、既有 D1/KV/R2 綁定與 secrets、商品／訂單資料。
- 母站原始事件與簽章照常轉送；子站不攔截打卡、不呼叫 reply API、不新增點數異動。母站 HTTP 成功不等於入帳，卡片不聲稱打卡成功或固定 +10；只用既有母站原始帳本 read 取得購物金快照，失敗顯示無法取得，不顯示 0。
- 每名會員台北日最多一張補送卡；原 webhookEventId/message id 去重、持久保存送出前狀態、唯一 LINE retry key。不自動重推未知結果；API accepted 不宣稱送達或已讀。
- 寫入：僅 checkin_mall_cards、checkin_mall_clicks。卡片 UUID 只作來源，不授權、不帶 UID／token。只接受 LINE token 驗證後的實際進入者；同人／同卡／同按鈕一分鐘去重。GET、預覽與未登入不記具名紀錄。
- 報告：伺服器驗證管理員權限；最大31日、每頁50筆、keyset；姓名／按鈕／來源／時間／有效進入次數，不顯示電話或錢包。HTML僅 textContent，避免姓名注入。
- AFTER 完整 change guard 通過；相關關鍵字／補送／UI 53 項通過。既有快取版本契約均同步更新到 entry v59／shop v57，不改舊功能斷言。第一次 AFTER 因版本仍指向舊值失敗，修正同步後完整重跑通過。
- 本機 workerd／D1：8 個並行補送觀察只送1張，8個並行 entry 只記1筆；母站與 LINE 皆合成服務，不動正式點數。
- 真實後台 shell／商城與明細模組，320/390/1440px 合成登入/API：報告、篩選、錯誤清除、姓名注入、目的地與返回通過；截圖已檢視。不是手機 LINE 送達驗收。
- 正式庫唯讀發現0042／0043舊遷移未登記；本次不套用／修改舊遷移，只選擇執行0063並登記該筆。預檢新表不存在，rows_written=0。
- dry-run、migration、Worker／Pages 上線證據待填。Android/iPhone 真正打卡與手機收到卡片需分開驗收，不用合成測試或 HTTP 200 代替。未改既有觀測設定／綁定／secrets，補送模組只記無UID的安全狀態。
- 回復：停止補送可將 CHECKIN_MALL_CARD_ENABLED 設為 false；回復 Worker／Pages 至上版，不刪新稽核表或既有資料。
