# 名片Email按鈕開寄信，不再直接複製

- 日期2026-10-21；repo fangwl591021/LINE-；checkout .worktrees/veo-crm-tasks-release；branch codex/card-email-compose-20261021，起始main22a3163d3de9503b0dfd42d0b4355748cc61bd6f。
- 原因：共用CardLinks.flexRows將mailto轉clipboard action，符合截圖的「LINE訊息按鈕可複製信箱」舊說明。名片網址本身不是填錯。
- guard before完整PASS，log line-email-compose-before.log。
- 範圍：共用Flex Email轉HTTPS寄信入口、獨立靜態寄信頁及腳本、編輯器提示與快取版號、來源一致性／安全／手機尺寸測試。
- 儲存仍保留原mailto，不批次改名片、不改UID／owner／版本／revision／點數／推薦／分享對象／LINE reply owner／金鑰／bindings／cron，無migration；寄信頁不讀資料庫、不登入、不寄出信件。
- LINE Flex採HTTPS入口，收件人放URL片段，頁面提供郵件App、Gmail及Outlook網頁；複製為次要且明確點選的備援，不自動複製。沒有郵件App或LINE攔截時如實提示，不能宣稱所有手機必然啟動。
- 已讀feature-change-protocol、core-invariants、button-actions、card-resolvers、card-ownership-and-versioning、完整按鈕退版計畫；依既有Workers／Wrangler規則乾淨封裝發布。
- 驗證：guard before／after完整PASS；針對性37項中36PASS／1選配browser skip；另開選配Chromium測試6PASS，實跑320／390／1280三尺寸寄信頁、三種收件人導向、備援複製、錯誤片段及無橫向溢出。
- 瀏覽器攔截mailto與外部信箱導航，只證明可點擊目標，未真的啟動手機App／登入／寄信；不是iPhone或Android的實機驗收。原始名片資料／金鑰均未改動。
- 發布先等Pages寄信頁上線，再部署同提交Worker，避免新的Email卡片暫時指向404。新訊息才採新入口，既有LINE訊息不批次重送。
- 待正式發布與逐檔核對；遵照使用者既有指示，測試通過直接部署。
