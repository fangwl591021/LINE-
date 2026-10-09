# 店家 AI 草稿：實際營業內容修正

## 變更摘要

- 日期：2026-10-09。
- 需求：重新產生草稿仍得到米樂數位行銷的登記營業項目；介紹必須是網路公開的實際產品／服務。
- 起點：origin/main ae635376bdd186a288c0d3310a951c383728d8c7。
- 分支：codex/store-ai-business-description-20261009。
- 修改前 full guard：PASS（store-ai-business-before-20261009.log）。
- 部署：否；本次尚未收到新的部署授權。

## 範圍與契約

- 已讀：store-ai-draft.md、store-shop.md、core-invariants.md、feature-change-protocol.md、deployment-runbook.md、regression-matrix.md。
- scope lookup：store-ai 尚無獨立 risk-map 項目，採用現有 store-ai-draft 專屬契約與 full guard。
- 統編只確認官方名稱／登記地址；AI 介紹從官網／公司公開介紹搜尋、讀取、核對，不讀登記營業項目 API 作介紹。
- 不以法律登記項目、公司資料鏡像或 AI 改寫登記清單作店家介紹／業種；沒有實際內容就留白並明示部分成功。
- 現場發現 1111 來源返回公司名加 CAPTCHA 驗證頁，內文不可直接讀取。按契約限定搜尋索引備援，只提供來源明示且身分已核對的待確認介紹；明示索引、預設不勾選，聯絡事實仍不放寬。無驗證繞過／網站專用抓取 API。
- 既有六欄白名單、權限、配額、取消、手動編輯保護、勾選帶入與最後明確儲存流程不變。

## 預計檔案

- worker/store-ai-draft.mjs；js/modules/store-ai-draft.js。
- store-shop.js、store-shop-entry.js、store-shop.html、index.html 僅相關文案／載入快取版號。
- store-ai-draft.md；store-ai-draft backend/UI/browser 測試及必要的既有版號断言。

## 禁止修改

- Worker secrets／bindings／compatibility、登入、LINE 回覆、點數、owner／UID、商品、上架審核、既有店面資料。
- 無 migration、正式資料庫／R2 寫入、批次修改店面；不新增或替換 OpenAI 金鑰。

## 驗證紀錄

- 修改前：full guard PASS。
- 修改後：node tools/run-change-guard.js after（full）PASS；日誌 store-ai-business-after-20261009.log。
- 相關 6 組測試共 110 / 110 PASS：store-ai-draft backend/UI、store-shop-cover、store-invite-share、store-admin-entry、store-points-home。
- Chrome 隔離操作 320／390／1366px PASS：統編查詢 → AI 實際介紹 → 重新產生再次搜尋、原資料保留、勾選帶入但不儲存、登記來源拒絕、部分成功提示、索引欄位預設不勾選、關閉及無水平溢出。使用合成 AI／登記，不連正式資料。
- 即時來源診斷：1111 公司頁實際 HTTPS fetch 返回 49 字的公司名稱＋驗證提示，沒有服务內文；以真實來源傳輸＋合成 AI／登記執行修正後函式，兩個描述欄位標記 reviewFields、提示搜尋索引待核對、店面寫入 0。這不是正式 OpenAI 端到端測試。
- Worker dry-run：PASS，既有 line-engine / ACTMASTER_DB / ACTMASTER_KV / IMG_BUCKET 無修改；未上傳版本。
- 安全檢查：已確認平台存在 OPENAI_API_KEY secret_text（只列名稱）；沒有讀出、建立、更換或寫入金鑰。
- 已檢視 390px 索引／部分成功的實際 UI 截圖。正式金鑰端到端與實體 LINE 手機驗收需授權部署後另驗證；本次未部署、未修改正式店面。
- 程式與隔離 fixture 測試不等於正式環境 AI／實體手機驗收；分開記錄。
