# 遊戲館契約

- 同一 tenant + canonical point member + Asia/Taipei 日，坦克與方塊合計最多 100 gift_money；簽到不變。
- **沿用** daily_tank_challenge:{tenant}:{member}:{date} 領獎鍵與 point_awards 唯一索引，不建立第二把新鍵，避免舊 Worker/快取入口與新遊戲各發一次。
- 舊 dailyTankStatus/startDailyTank/completeDailyTank 保留語義及格式；舊開始沒 mapVersion 使用地圖 v1，v2: ID 固定地圖 v2。舊完成 API 不接受方塊 session。
- 新 gameCenterStatus/startGame/completeGame/gameEvent 均經既有 LINE token 驗證，拒絕 D1 UID-only fallback。tenant/member 只從伺服器設定及持久化會員映射取得。
- 重用 daily_tank_sessions，migration 0044 僅加欄位/索引及 game_play_events。session 20 分鐘有效，server seed、nonce、gameId、actor/canonical member、Taipei date 固定。新 API 必須驗證 nonce，完成只接受決定性合法重播，忽略客戶端分數/金額。
- 成績不可由分析事件產生；驗證後 session 結果不可覆寫。batch 交易一起保存結果及唯一發獎預約；只有預約 INSERT 的 changes=1 才能呼叫既有母站服務。
- 模糊/逾時發點不重送，僅依完整 marker + gift_money +100 查母站；餘額讀取失敗回 null。已領過可再遊玩，分數仍保存。不可把可領、待確認或前端假數當成已入帳。
- 允許跨日查證已保留的破關領獎；新完成不能用昨日未完成 session 領今日獎。
- 遊戲館僅顯示本人統計（最高分、每日完成、連玩天數、本週成功次數）。第一版不公開排行、不傳會員 token 到分析紀錄。
- 事件類型白名單、會員/租戶/時間由後端補，前端不可偽造 reward/complete/fail 事件；限制每 session 64 個前端事件及每日 200 個無 session 事件。
- 手機/桌面沿用同頁 LIFF，不改驗證入口。API 失敗與等待有重試，更新餘額只使用回傳值。
- 2026-09-21 使用者要求一路完成部署：測試環境不足時以隔離 SQLite/本機瀏覽器及 dry-run 驗證，報告未實機 LINE 的限制；正式站只做唯讀健康與未登入拒絕驗證，不代使用者遊玩發點。
