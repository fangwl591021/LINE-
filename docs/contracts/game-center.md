# 遊戲館契約

## 商城大富翁（2026-09-23）

- 遊戲館另列「商城大富翁 · 自由探索，不贈點」；不加入獎勵 gameId 白名單、不建立遊戲 session、不呼叫 startGame / completeGame / gameEvent、不計每日 100 點、成績或連玩天數。
- 與原人脈大富翁共用棋盤／骰子，但模式、文案、資料來源與 sessionStorage 進度分開。原名片版仍讀收藏／公開名片，商城版只讀公開商城。
- 進場使用既有公開商城 seed 隨機取一頁（最多 40 家）作候選池；停格後隨機抽店，兩家以上時不連續重複同一家。重新排列可換一批。
- 每次開店前透過公開 ?shop=ID 重查上架狀態；草稿／下架不顯示，網路錯誤不當作無店家。沿用既有店面頁與公開權限，不改商品、訂單、優惠券或點數。
- 同頁開店並提供返回棋盤；棋子位置與回合保留。返回遊戲館按鈕可用；切換帳號、模式或離開棋盤後的舊動畫／請求不得跳頁或改新棋局。
- 走格途中保留棋盤、圖片、骰子與人物 DOM，只移動現有人物與目前格標示；不逐步重建棋盤、不彈跳或放大格子，避免反覆閃爍。兩種模式的骰子規則與步速不變。

## 既有每日挑戰

- 同一 tenant + canonical point member + Asia/Taipei 日，坦克、方塊與喵喵五子棋合計最多 100 gift_money；簽到不變。
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

## 五子棋整合（2026-09-22，先本機驗證）

- `gomoku` 挑戰固定標準難度、15×15 自由五子棋，玩家先手，五顆以上連線獲勝。挑戰不可悔棋/提示/切換難度；自由練習保留三種難度與輔助，且不建立 session、不送完成 API。
- 後端只接受最多 113 個合法整數座標，依 session seed 與相同標準 AI 重播雙方落子；尚未結束、非法/多餘落子、逾時、錯誤 nonce/會員/租戶皆不可領獎。不信任客戶端勝負、分數、難度或金額。
- 勝局分數 100、敗局/和棋 0；和棋不領獎。沿用既有 session 結果不可覆寫、batch 預約、母站回執確認與每日唯一鍵。點數明細為「每日喵喵五子棋挑戰」。
- 領獎確認前不得顯示已入帳。重試使用原 session/nonce/replay；尚待確認時不可另開獎勵局。帳號改變或離開頁面不得提交原帳號棋局。
- 此重播驗證可拒絕偽造勝局，但不宣稱能排除使用自動棋手；不新增付費 AI、會員或點數系統。
