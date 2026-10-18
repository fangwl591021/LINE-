# 按摩機網購折抵與本人訂單驗收

- 使用者明確要求：將既有光動能按摩機改為可網購折抵，用本人帳號完成下單扣點及取消退點；通過測試才部署。
- 正式來源：LINE- main `8444cf3c99b9677ff93ac91f2d354eeb80fcf328`；Worker `line-engine`、D1 `actmaster_db`，不是根目錄 Smart-Menu-Studio。
- BEFORE 完整 change guard：2026-10-19 PASS。
- 既有管理員可編輯指定商品，但 catalog 編輯器／API 缺少銷售方式修改；以最小欄位補齊，不繞過正常上架審核及版本稽核。
- 允許：新增管理員對合資格店家既有商品的 purchase_mode 編輯、相應能力布林值、UI、快取版本、測試與契約。商品折抵規則、價格、歸屬不因此變更。
- 禁止：新增身份映射、修改母站帳本介面、收銀／網購扣退點程式、收款設定、其他正式商品資料、金鑰／binding／schema 變更；不匯款、不回報匯款、不核帳或出貨，不刪除測試訂單／帳本。
- 已讀 core-invariants、feature-change-protocol、regression-matrix、store-admin-catalog、store-commerce；Workers／Wrangler 與 runtime patterns。
- 正式唯讀預檢：指定商品 `ec46afc6-dacd-487c-8ca5-c7f993ea2612` v1，NT$11,800，percent 50，active/in_store；店家 `1c607ea5-3ff8-4232-8cfb-8fc099435ea8` 合資格，收款設定 enabled v3、資料完整；未完成點數操作／共享收銀鎖皆 0。
- 登入 UI 已確認本人姓名方萬隆；本人目前管理店面與指定商品店面不同，僅使用既有管理權，不轉移歸屬。登入後購物金顯示 12,847；正式訂單前再查權威餘額。
- 銷售方式只允許合資格 merchant 店面變更；一般會員限制、寫入時角色／版本快照、原審核、同請求重試及原子 audit 保留。折抵欄位不開放此管理介面修改。
- 驗證：新增 SQLite 模式切換／稽核／重送／角色限制／無關資料保留；320/390/1440 假資料 UI 及失敗重試；完整 after guard、dry-run、正式 asset 與版本驗證。
- 真實驗收：僅一筆指定商品、最小折抵點數，未匯款取消；實扣送出前確認具體點數與測試訂單應付金額。逐筆核對原 order/operation UUID、母站 gift_money 回執與退點連結；未知結果只查原交易，不換編號重扣／退。
