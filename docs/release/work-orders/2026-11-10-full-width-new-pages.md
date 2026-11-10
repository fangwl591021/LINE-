# 新版頁面滿版

- 需求：使用者手機截圖指出新版首頁外框留白，要求新版內容都滿版。
- 基線：main 96afd1a；完整before guard通過（repo外full-width-before.log）。
- 範圍：新版會員首頁、探索店家與店家工作台的外層左右margin/padding/max-width及首頁頂部空隙，調整到webview內容區邊緣；文字、按鈕內距、格間距與必要安全區保留，瀏覽器/LINE原生列不屬網頁可改範圍。
- 不變：不改舊頁面、V2 opt-in、彈窗、登入、權限、點數、商品/圖片資料與裁切、交易、後端Worker、角色或API。
- 已讀：DESIGN、store-shop、core-invariants、feature-change-protocol、line-release-verification；檢查320/390/430/1280，測外框實際幾何、無橫向溢出、文字/按鈕與固定底部遮擋、離開後舊頁面恢復。
- 修改預期：限定home-discovery CSS、store reference shell CSS及必要快取，對應browser fixture與已核准尺寸契約。
- 修改：首頁與兩個商店新版頁面移除外層限寬和左右留白，首頁移除隱藏前項造成的頂部空隙；安全區使用內側padding保護內容。首頁CSS v2、商店CSS v3及入口fullWidth=1使既有瀏覽器取得新樣式。
- 驗證：完整before/after change guard通過；三個相關單元測試檔共22項通過；full-width-layout正式斷言15/15通過（3頁×320/390/430/1280，另3頁橫向844×390安全區），確認左右貼齊、無水平溢出、可操作控制項至少44px、底部內容可捲離固定導覽；原首頁流程fixture在320/390/1280通過。
- 瀏覽器fixture使用隔離資料，正式API/LINE請求與資料寫入均為0；靜態CDN資產唯讀下載至repo外快取。
- 發布：只發布GitHub Pages前端；合併後讀回六個正式檔案核對SHA256，並比較Worker版本確認不變。正式帳號畫面驗收與發布結果留在repo外證據，不操作點數或交易。
