# 人脈島影音名片與加入後只讀參觀

- 使用者確認前一版規劃後要求開始；測試通過直接部署。
- 起點：5302542；既有 line-engine / LINE- Pages / linengine R2。
- guard before：PASS（../island-video-before.log）。
- 契約：people-island-onboarding、business-island、exchange-top-tabs、card-resolvers、liff-routes、line-keywords、core-invariants。
- 僅新增獨立直式影音名片、訪客安全摘要、分級引導與必要的交流寫入審核檢查；不改寫會員既有影音名片、不變更推薦／點數／資料／正式設定。
- 分工：後端資格與測試；前台推廣／參觀頁與返回流程；影片錄製／字幕／配音／媒體 QA；整合發布與正式驗證。
- guard after：PASS（../island-video-after.log），含新資格、影音 Flex 與伺服器審核核對案例。
- 後端既有與新資格測試104/104 PASS；審核核對及相關回歸51/51 PASS。真實 upsert SQL 證明偽造通過不寫入，真實 AI 回覆核對後才儲存通過；訊息插入和 presence 在伺服器檢查。
- 入口瀏覽器42項 PASS（320/390/1280）；真實 config/bootstrap/auth 與 loading 遮罩7項 PASS；正式影片實際播放、45秒/1080x1920、非自動播放、離頁暫停 PASS。全部為合成帳號，沒有 LINE 實際發送或正式會員／點數寫入。
- 發現既有 save/update 可接受前端審核旗標，新增 card-review-receipt KV 短期核對及兩處必要 hook；不批次改既有資料。已審核且內容未變者維持；新或變更內容無真實審核核對則不提升資格。
- 影片45秒、1080x1920、24fps、H264/AAC，台灣中文配音及全旁白繁中字幕；實際島嶼模組、示意會員／建名片流程清楚標示。全解碼、音量及8/18/28/39秒畫面檢查 PASS。
- 影片 SHA256 b4b43072c5ed402076443170d0fffb9a9db2ccb20a96e4bab1d04be05c4f27ed；封面 5b58c877297cda3cd637b2b025668947e128bb8f51ccf4c327b86e7e2be0a00c。R2 新路徑上傳前404，上傳後全文雜湊與 MIME 核對 PASS（../island-video-media-live.json）。
- 可編輯來源 ZIP、字幕與媒體腳本保留本機；公開上傳來源 ZIP 遭自動審查拒絕，未重試或改由其他管道公開。正式程式庫不包含該素材包／編輯腳本。
- Wrangler dry-run PASS，無 migration；正式發布後比對設定／排程 hash 及網頁原始碼。LINE 真人加入與分享實收未測，沒有宣稱手機實收驗收。
