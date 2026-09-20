# 全站名片庫篩選列最小排版修正

- 需求：上次後台修正後，使用者反映篩選工具列超出容器，要求最小修正。
- 起始／回復點：bc9499e。
- 範圍：admin.html 的名片庫篩選列 CSS／class、對應排版契約與測試。
- 禁止：資料、查詢、權限、點數、Worker、同步／匯出行為。
- 已讀：core-invariants、feature-change-protocol、admin-entry；before guard PASS。
- 驗證：篩選列換行、長選項不撐寬、表格維持獨立捲動；不操作正式同步。
- 發布：沿用本次後台修正的提交部署授權，僅 Pages。
- 版面驗證：隔離合成長歸屬名稱／寬表格，390 / 820 / 1280 / 1637px 全部通過；工具列不溢出、主頁不被撐寬、表格獨立捲動。測試不載入 LINE 或資料 API。
- after guard：PASS；git diff --check PASS。正式程式僅新增 7 行 CSS 與 3 個工具列 class，JavaScript／資料流程未更動。
