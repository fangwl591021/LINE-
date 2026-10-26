# 人脈島真實業務內容與 MEGA 修正

- 使用者指定：楊滄棋的職業及內容應取真實資料，不可只更換示範姓名；尺寸恢復 MEGA。測試通過直接部署。
- 基準 origin/main daa175f68edcab2b186e4601e6e9813eddaa0e24；before full guard PASS（../island-real-profile-mega-before.log）。
- v2 問題：姓名已換成真人，但人物介紹仍沿用品牌設計師與晴禾示意公司；循環姓名資料亦讓同名人物套入其他示意業種。v3 移除所有循環示意姓名中的楊滄棋，只加入一筆核對過的本人公司／業務資料。
- 公開來源：[協會名單](https://alsme.org.tw/seventh/)確認姓名與米樂數位行銷股份有限公司關聯；[公司自建企業頁](https://0222691939.web66.com.tw/)列出本人、統編 24456660 及數位／網路行銷服務。另核對臺北市商業處第六梯次數位轉型服務名單，該公司提供 CRM 會員、點數、核銷及電子名片系統。
- 不依舊活動中不同的總經理／執行長稱呼推定現職；影片使用業務標題「楊滄棋｜數位行銷」、公司「米樂數位行銷股份有限公司」、服務「LINE 行銷・電子名片・會員點數應用」。AI 商務人脈管理系統合作來自本對話使用者提供的本人公開動態截圖。
- D1 只讀查詢因服務權限 7403 未讀取資料；公開名片名單需有效 LINE token，沒有冒用身分、調整權限或改資料。影片內容以可查核公開資料與使用者既有截圖為依據。
- 範圍：新增 R2 video-card-v3.mp4/.jpg、單張 Flex 恢復 mega、前端媒體網址及必要版本載入參數、聚焦測試與契約。原影片比例、旁白字幕、流程與分享推薦連結保留。
- 不改 Worker、正式會員／名片、推薦關係、點數、資料庫、設定與排程；可編輯影片來源只留本機。
- 已讀 feature-change-protocol、people-island-onboarding、liff-routes、card-resolvers、core-invariants。
- after full guard PASS（../island-real-profile-mega-after.log）；入口瀏覽器 42 項、本人分享／MEGA 12 項 PASS。影片 45 秒、1080×1920、24fps H.264/AAC，完整解碼、音量及 8/18/28/39 秒視覺 QA PASS；18 秒真實公司與服務文案已核對。錄影資料檢查楊滄棋恰為一筆，沒有林采晴。
- MP4 SHA256：825c646c2b18b2b6bccddc69f37e33a138d72095c2bd557931dd2ecb562865e2；JPG：f37e8a7e7a06fbbcbdb3fe718b7cee41310b5b2831be7d637defd78613854d2b。來源證據與可編輯 ZIP 保存在 ../people-island-video-v3-output/，不公開上傳來源 ZIP。
- 發布透過原 R2 與 GitHub Pages；正式讀回／播放收據另存 island-real-profile-mega-live.json、island-real-profile-mega-playback.json。Worker 版本與設定／排程前後核對。手機 LINE 實收尚未驗收，新分享才套用 v3 與 MEGA。
