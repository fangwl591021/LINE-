# 參考圖風格修正：緊湊生活商城

- 範圍：只調整商城前端。未改 Worker、資料庫、金流、點數或發布開關；使用者於 2026-09-11 授權提交與 GitHub Pages 部署。
- 發布前檢查：完整合約、38 項商城／收銀回歸與 git diff --check 通過。正式發布結果以 GitHub Actions 與上線檔案核對為準。
- 首頁改生活情境照片、暖白底、深藍字與黃色 QR 入口。分類保留全部與食宿遊購行服務製造，手機橫向滑動，桌面完整一列。
- 公開店家縮圖固定 4:3、等比完整顯示，名稱最多兩行；完整介紹移至店家內頁。店家頁收合聯絡資訊，保留返回及複製入口。
- 商品列表改手機雙欄、桌面三欄；4:3 圖框保留原圖不裁切。名稱、價格、折抵提示與右下 QR 為摘要，圖片／名稱／詳情皆進入既有完整商品詳情。
- 不變更商品原始資料與管理編輯表單；商家/商品真實圖片未由 AI 改造；新照片僅首頁裝飾。
- 本機 320/390px 檢查分類、雙欄、直圖限高、長標題、QR 入口、詳情、本人點數隔離、錯誤不顯示假零及無橫向溢出；正式目錄僅 GET 讀取作本機外觀預覽，未進行正式交易。

## 圖片素材

- 使用內建 imagegen，沒有 CLI/API 備援。檔案：assets/storefront/lifestyle-cafe-v1.jpg，119,380 bytes。PNG 原始生成檔保留於 Codex generated_images；JPEG 僅壓縮封裝，未裁切或更改內容。
- Final prompt:
  Use case: photorealistic-natural. Asset type: mobile lifestyle shopping storefront hero photograph, landscape 3:2. A warm natural editorial photo of a smiling adult Taiwanese woman with shoulder-length brown hair in a light ivory casual blouse enjoying a glass of iced tea at a sunlit outdoor cafe with green foliage and cream-colored bokeh. Composition: woman entirely on right half, face in upper-right, left 55 percent softly blurred light cream and pale green empty negative space for real HTML navy headline. Soft morning sunlight, approachable everyday feeling, refined warm ivory palette. No text, no letters, no logo, no watermark, no UI, no phone frame, no collage. This is decorative lifestyle artwork, not a product or actual merchant photo.
