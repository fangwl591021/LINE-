# 首頁 QR 參考圖及點數字級

- 基準 `de4598ad`，依使用者參考圖修正會員首頁「我的 QR」及簽到樣式，縮小購物金數字，保留既有 QR、簽到、分享與店家功能。
- 限定一般會員首頁 CSS 與必要快取版本、相應設計文件和驗證；不改點數身分、餘額、交易、簽到規則、Worker、資料或其他未發布工作。
- 契約：`DESIGN.md`、`docs/rules/core-invariants.md`、`docs/flows/my-card.md`；`npm run guard:before` 通過。
- 驗證：首頁 QR／簽到專項 14 項及最終 `npm run guard:after` 通過；使用實際首頁檔案及合成資料於 320／390／428px 檢查六格、QR 單行、點數字級與裝飾，不以正式帳號實際簽到或扣點。
- 僅發布前端，核對 Pages 實際送出的檔案與快取版本。
