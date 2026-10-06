# 店家教學從首頁入口重新製作

- 授權：使用者指定「1.點商城橫幅 2.點店家設定」，重新製作商城上架教學。
- 正確基底：LINE- origin/main 9faeaa336e4bea8466bf2d78fd5963c407e937d9；獨立 codex/merchant-tutorial-entry-fix。
- 範圍：只有新版影片、教學 metadata、章節、快取版本、教學測試與契約；不改商城功能、不部署 Worker／D1／點數實作。
- 實際前端程式擷取：首頁 #home-mall-banner → 商城 .points-tools [data-do=manage] → [data-form=store]；程式基底同上述 main。使用虛構店家身份與只讀 API fixture，正式資料寫入為零。
- v3 新增兩個真實入口畫面及兩段中文旁白，後面47段聲音逐檔 SHA256 與 v2 相同。只重用已核對相同音檔的 Whisper 時鐘，新旁白另行語音辨識。
- 保留原公司資訊、圖片、商品、DM、分享與網購折抵預覽；尚未正式開放的提示保留。
- 舊 v1／v2 原片及媒體 key 均保留，新 v3 key 先確認不存在，不覆寫。
- guard:before 完整 PASS；證據 .wrangler/merchant-v3-guard-before.log。
- 退版：恢復本基底的 merchant v2 metadata／章節與 index 快取版號即可；不需資料或 Worker 回退。

## 發布驗收

- Native Higgsedit：36個畫面、49段旁白；720×1280、影片與音訊均401秒；全片解碼通過。
- Whisper 對齊相似度0.977089；628個時間詞／字幕詞一致，148個字幕cue，作者文稿覆蓋完整。
- 已視覺抽查首頁商城橫幅、店家設定及片尾；兩個入口位置清楚標示，字幕為繁體中文。
- R2 新檔：tutorials/2026-10-06/merchant-tutorial-v3.mp4；11,542,530 bytes；SHA256 aa2e0c2534def5335fdaea2086fd6b0768c751c1bcbb3944a4ab5ba9e80d1f91。
- 公開媒體HTTP200、video/mp4、hash一致；Range206、bytes 0-1023/11542530。
- node --test test/tutorial-center.test.mjs：4/4 PASS。
- 320／390／768／1366px實際瀏覽器：四課程、401秒新版音軌解碼、兩個入口與折抵章節跳轉、無自動播放、關閉停止、焦點與草稿保留、錯誤重試均PASS。無正式API請求／寫入。
- guard:after 完整PASS，證據 .wrangler/merchant-v3-guard-after.log；git diff --check PASS。
