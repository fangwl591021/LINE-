# 每日坦克挑戰契約

- 入口在 points-wallet 既有每日簽到旁；原簽到 action / 10 點規則完全不變。
- 原創 Canvas：3 生命、基地完整磚牆、最多 3 敵人、擊敗 5 敵人勝利。失敗無限重試；單局最多 6 分鐘。
- 鍵盤方向/WASD、空白鍵；手機搖桿/射擊。音效僅手勢後建立 Web Audio；音效失敗不影響遊戲。
- 三個新 action 嚴格驗證 LINE token，不允許 D1 UID-only fallback。會員與 point_line_id 僅由持久化身分橋接取得。
- 後端 seed、session、台北日、遊戲操作重播全部核對，金額固定 100；前端不能指定會員、租戶、金額或完成狀態。
- 租戶隔離使用既有服務端 POINT_SHOP_ID / MOTHER_CUS_ACCOUNT_SHOP_ID；不是可由使用者更改的推薦 network_id。
- 沿用 point_awards；award_id = daily_tank_challenge:{shopId}:{pointMemberId}:{taiwanDate}，card_id = {shopId}:{taiwanDate}，award_type = daily_tank_challenge。既有唯一索引保證每日只有一個發獎權。
- INSERT OR IGNORE 成功者才可呼叫既有 PointModule.insertUserPoint；100 gift_money / 每日坦克挑戰 / 唯一 shop_remark。沒有第二套點數，也不做 local wallet fallback 或同步佇列重送。
- processing / unknown 結果只用既有母站 queryUserPoints 查找同一完整 marker、point_type 與 +100 明細。不用餘額差猜成功。查不到仍待確認，需人工對帳，絕不自動重發。
- 母站成功回應必須明確 success=true；D1 記錄完成後才顯示入帳。餘額只接受母站讀值，暫不可讀時回傳 null，不編造 +100 後的總額。
- 限制：沿用的母站 API 沒有已驗證的原子冪等介面；目前是 at-most-once 發送 + 查證，不是跨站單一交易。發送前中斷可能需人工補發，不能冒險自動重送。自動玩家仍可能產生合法重播，這不是機器人偵測系統。
- 未部署正式站前，必須有測試環境實機 LIFF 驗收；本機合成資料測試不代表正式贈點已驗收。
