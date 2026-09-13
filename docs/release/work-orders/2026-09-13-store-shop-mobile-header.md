# 商城標頭手機相容性修正

- 基準 4435fcb；使用者回報 PC 已隱藏原系統標頭，手機仍顯示。
- 唯讀確認手機／PC 共用 goPage 與商城 DOM；Service Worker 無 fetch cache。正式站手機 UA 回傳已部署 HTML，HTTP Cache-Control 為 max-age=600。未取得使用者實機，不能斷言快取或瀏覽器版本就是本次原因。
- 上版標頭 CSS 僅依賴 :has()。改以既有導航同步切換 body.store-shop-page，三條 CSS 不再依賴 :has()，離開商城還原。navigation 版本 8.02 → 8.03，避免新 HTML 配到舊導航資產。
- 僅標頭／上方空間與導航樣式標記；不改登入、授權、點數交易、Worker、資料庫或其他商城排版。
- guard:before、guard:after、diff --check 通過。兩個既有 contract 的導航版本接受範圍同步加入 8.03，其他功能断言不變。
- 實際 navigation.js 在隔離假 DOM 執行的 8 項 goPage 測試全部通過，並納入 full guard；涵蓋商城進出、重入、原首頁／個人頁、user/admin 原導航狀態，不讀資料。
- 390px／1280px 本機瀏覽器 fixture 使用實際導航原始碼與不含 :has() 的標頭 CSS：商城 top=0、標頭隱藏、品牌保留、POP 開啟及離開商城恢復通過，API 呼叫 0。這是 Chromium 版面驗證，非手機實機或不同 WebView 引擎認證；實機 LINE 仍待確認。
- 使用者已授權本階段提交、部署；採既有 main → GitHub Pages 前端流程。發布後核對 workflow 及手機 UA 取得的正式 HTML／navigation.js；Worker／資料庫不變，使用者手機實機效果仍待確認。
