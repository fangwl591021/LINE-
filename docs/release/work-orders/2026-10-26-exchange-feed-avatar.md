# 公開動態 LINE 頭貼最小修復

- 使用者需求：公開動態部分頭貼不正常，最小更新；測試通過直接部署。
- 起始版本：ba45279（origin/main）；目標：既有 line-engine Worker / LINE- Pages。
- 原因：附名片的作者使用 card.image_url 作為頭貼，未附名片則不帶圖；前端缺少失敗備援。
- 只改：交流貼文作者頭貼來源及圖片載入／失敗顯示，列表和詳情保持一致；更新必要載入版本。
- 重用既有 LINE 頭貼 helper 與獨立快取，當頁作者去重分批；不使用名片封面替代，不回傳內部 UID。
- 禁止：名片、會員、點數、貼文、按讚、訊息資料寫入；權限、排序、配對、通知、bindings、secrets、crons 變動。
- 已讀：feature-change-protocol、core-invariants、card-resolvers、exchange-top-tabs、exchange-post-visibility。
- guard before：PASS（../exchange-feed-avatar-before.log）。
- guard after：PASS（../exchange-feed-avatar-after.log）；首次只有靜態測試仍預期舊載入版本，更新成 1.28 後通過。
- 新增唯讀 SQLite 頭貼測試 7/7 PASS；既有頭貼／可見性測試 17/17 PASS；UI 與新增頭貼測試合計 26/26 PASS。
- Chrome 合成畫面測試 12/12 PASS（390/1280），涵蓋載入／失敗／待載入／無圖、詳情封面保留及重新渲染；沒有正式資料寫入或 LINE 發送。
- Wrangler 4.120 dry-run 與 diff --check PASS。發布既有 Worker / Pages，無 migration，保持 bindings、vars/secrets、cron；正式結果以部署紀錄及設定 hash 比對驗證。
