# 店家教學影片更新與上架

- 授權：使用者要求影片也修改後上架；僅發布教學與其入口，不部署尚待母站安全驗證的網購扣點實作。
- 基底：LINE- `origin/main` d675be6a5ca1c7d350f565ebe7b76b52746b5d96；獨立 `codex/merchant-tutorial-release`，保留原工作樹所有網購程式變更。
- 範圍：教學影片 v2、tutorial-center 固定課程 metadata、章節時間、index 快取版本與相關教學測試／契約。無 Worker／D1／帳號／點數／收銀／LINE 訊息變更。
- 原片：保留公司登錄、圖片、商品、收款、DM 辨識及分享；替換不支援線上點數的舊旁白，新增本人購物金查詢、商品上限、運費不折抵、確認下單扣點、取消退點、店家退款與待查核不重送。
- 真實程式擷取＋虛構測試資料，僅記憶體 SQLite 與合成購物金；沒有正式店家、訂單或點數寫入。
- 明確告知：網購折抵新流程為預覽，正式功能尚待安全驗收，未開放。影片、字幕、固定段落註記及播放器說明一致。
- 舊版影片／聲音保留；新版不使用手估字幕時間，原40段聲音逐檔 hash 相同才重用原 Whisper 時鐘，新9段另外辨識。
- guard:before：完整 PASS；紀錄 `.wrangler/merchant-tutorial-guard-before.log`。
- 新檔上傳前確認 key 不存在，不覆蓋原教學資產。正式片還需 HTTP hash／Range、聲音尾段與手機播放器驗收後才切換入口。

## 發布前驗收

- Native Higgsedit 合成，49 段旁白、35 個畫面；720×1280、395 秒；音訊和影像長度同為 395 秒，全片解碼通過。
- Whisper 對齊相似度 0.976726，618 個時間詞與字幕詞一致，145 個字幕 cue；作者文稿覆蓋完整，已移除舊的「網購不支援扣點」說明。
- 實際抽查開頭、折抵操作與片尾，繁體字幕可讀，折抵區持續標示未正式開放；原素材和 v1 不覆寫。
- 新媒體：`tutorials/2026-10-06/merchant-tutorial-v2.mp4`；11,484,490 bytes；SHA256 `b1f762c87aa5788a18495643f10d3fbff1ff5ed95fb80c1ef824a3cd3ac2e42b`。
- 公開 R2 HTTP 200、video/mp4、下載 hash 一致；Range 206、bytes 0-1023/11484490。
- `node --test test/tutorial-center.test.mjs` 4/4 PASS。
- 實際瀏覽器 320/390/768/1366 px：四課程入口、影片解碼、音軌解碼、章節跳轉、無自動播放、關閉停止播放、焦點與草稿保留皆 PASS；只讀 R2，沒有正式 API 寫入。
- `guard:after` 完整 PASS；`git diff --check` PASS。
- 入口退版：將 merchant 課程恢復此基底的待上架 metadata、取消 per-course mediaBase；保留舊媒體，新版 key 可維持不可變供查核。无需任何 Worker、D1 或點數資料回退。
