# 按摩機網購折抵驗證

## 修改前與隔離測試

- 正式 main `8444cf3c99b9677ff93ac91f2d354eeb80fcf328`，`codex/massage-online-validation-20261019`；其他未追蹤檔案保留。
- 完整 change guard BEFORE / AFTER PASS。
- `node --test test/store-admin-catalog.test.mjs test/store-listing-review.test.mjs test/store-admin-entry.test.mjs`：60/60 PASS。
- 新增覆蓋：只改既有合資格店家商品 purchase_mode；原價、50% 折抵、歸屬與其他欄位保留；稽核 before/after、同請求一次寫入、改回店內；一般會員拒絕網購（含草稿／封存）；權限變動拒絕；審核要求人工或 provider 失敗仍不改商品。
- `node test/browser/admin-mall-linked.mjs`：320 / 390 / 1440px PASS；合成商品從店內轉網購、回應遺失重試同一 key/payload、折抵規則不傳送不覆蓋、缺少／false capability 無網購欄位；既有圖片、草稿、返回與角色失效檢查仍通過；0 外部請求及 JS error，無橫向溢位。
- 合成截圖：`C:/Users/User/AppData/Local/Temp/admin-mall-linked-20260923/sales-mode-390.png` 已目視確認。這些不是正式交易。
- 測試初次失敗為 fixture 命中原人工審核快取、及 native select label 包含 option 文字；分離 fixture 並使用既有具名 select 定位後全部通過，沒有放寬 production 驗證。

## 正式驗收界線

- 唯讀 D1 預檢：指定按摩機 v1 / active / in_store / NT$11,800 / percent 50；收款設定 enabled v3，銀行資料完整；目前未完成點數操作及共享 cashier 鎖皆 0，所有預檢 rows_written=0。
- 正式 LINE 登入確認本人姓名方萬隆；頁面當時購物金 12,847，不能代替下單前後母站帳本查核。
- 本文件目前尚未宣稱正式商品已改、實扣或取消退點完成；完成後另補正式 order/operation 回執及部署收據，不紀錄 token、金鑰、電話、銀行帳號或寄送地址。
