# 名片介紹四至五行美化

## 1. 變更摘要
- 日期：2026-10-21。使用者要求：依實際業務美化，基本 4–5 行、不必長篇；測試通過直接部署。
- 起始：fc7f647429ef8a63a5bd5573cbfbbd498512a146；分支 codex/card-copy-four-lines-20261021。
- 範圍：OCR 已辨識服務的文案、generateCardCopy 搜尋文案、WYSIWYG 明顯入口、測試與快取版本。
- 預計檔案：worker/card-copy-style.mjs、worker/card-business-copy.mjs、worker/store-ai-draft.mjs、worker/a-kaffit-card-recognize.mjs、js/modules/mycard.js、index.html、相關測試與契約。

## 2. 允許與禁止
- 統一短句格式、保留換行、移除身分摘要作為成功美化結果；名片畫布提供直接搜尋美化入口。
- OCR 仍同一次辨識，不額外自動呼叫搜尋；不在背景改寫既有正式名片。
- 不修改 UID、所有權、四版儲存、點數、LINE 回覆、按鈕連結、商店搜尋規則、金鑰／綁定／排程。
- 草稿仍需核對來源、帶入、套用、儲存。搜尋失敗及過期回應保留原文。

## 3. 已讀契約
- feature-change-protocol、core-invariants、card-business-description、my-card、ai-card-folder、card-ownership-and-versioning、card-resolvers。
- 沿用平台現有 AI 金鑰（僅核對 secret 名稱），不換模型或增加供應商。

## 4. 修改前
- node tools/run-change-guard.js before：PASS。
- 紀錄：Temp/line-card-four-lines-before.log。

## 5. 驗證與上線
- node --test test/card-business-copy.test.mjs test/card-business-copy-ui.test.mjs test/a-kaffit-card-recognize.test.mjs：40 PASS，0 skip；RUN_CARD_BUSINESS_BROWSER_TESTS=1，Chrome 390px viewport。
- node tools/run-change-guard.js after：PASS。node --check js/modules/mycard.js、git diff --check：PASS。
- 測試兩個回報姓名／公司模板均不被當作成功文案；OCR 一次呼叫與4行換行完整保留；5行、過長、來源錯配、未登入、額度、取消／切換／修改後過期回應均覆蓋。
- 新入口使用真實畫布按鈕標記／handler，點擊後預覽，再明確帶入／套用；不自動存檔。
- 測試模型與網頁資料為隔離 fixture，並非正式模型品質或手機 LINE 實收驗收。本機未設定 AI secret，正式 Worker 已有金鑰，只檢查名稱，沒有匯出。沒有修改兩張實際名片或其他正式資料。
- mycard.js 快取 8.96 → 8.97；部署目標 line-engine + LINE- GitHub Pages。
- 上線前設定雜湊 3b36c4b961bcc15b7e3354cbb3fa94d806afdbcbcb427816216b1f196573198d；排程雜湊 3daefe8b947c3a195b684f87eabed3802f9e5fe166e6f82b805479be2495d578。
- 可部署；回復點 Worker 87556057-9d68-4e9f-b603-0a66ef73cbf0。完成部署後另存 receipt。

## 6. 指引
- 依官方 OpenAI prompt engineering 文件將輸出規格與風格示例明確分開，沒有換模型或增加 OCR 呼叫：https://developers.openai.com/api/docs/guides/prompt-engineering 。
- Worker／Wrangler skill 要求沿用專案執行環境、驗證 target、維持 bindings／vars／secrets／cron；已使用安裝版 4.120.0 help 核對 keep-vars／strict，遠端指令文件目前讀取失敗。
