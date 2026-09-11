# 商城 QR 與總點數獨立查詢

- 使用者要求 QR／總點數不要讀流水帳，完成後與「我的消費折抵紀錄」入口一起提交、部署。
- 正式登入帳號調整前實測：彈窗 4020ms；既有 queryPointBalanceFast 853ms，source=mother、無 list、餘額及 canonical UID 與完整查詢一致。此為單次桌面實測，不是手機保證值。
- 原彈窗 fetchPointWalletData_(true) 會走 queryUserPoints，多頁逐筆查詢及各類點數、收銀明細補全；改用既有 queryPointBalanceFast，單次 summary 查詢、不讀完整流水帳、不失敗退回慢查詢。
- 既有快速 API 內部仍取第一頁最多 20 筆作總額來源，不改母站 API、授權、Worker 或交易扣點。讀取失敗／local fallback 不作母站共用餘額顯示。
- QR 保持先畫出；60 秒內本人已確認總點數可先顯示並標記更新中，新總額回來覆蓋，失敗移除數字且保留可重試狀態。
- Summary 獨立快取及合併同身分進行中請求，不覆蓋原紀錄頁的 list 或 loadedAt；原完整流水帳路徑不變。
- 49 項相關 Node 測試、Change guard before／after 通過。本機 390px 安全測試通過，包含 canonical QR、連點、延遲回覆、換帳號、零餘額、匿名提示與失敗不走流水帳。
- 本機合成 4000ms 網路延遲：QR 2ms、確認值預覽 17ms、最新回覆 4026ms，僅一筆快速查詢；以上為合成情境，正式延遲另驗證。
