# 商品限店內／網購與購買人資料

- Scope: LINE- main，起點 846a706；使用者要求商品兩種銷售方式，網購收集購買人資料，參考 HookTea。
- HookTea reference: fangwl591021/hooktea worker.js at d8384e76f267082ed1f7d80b2b836a641b126514，唯讀檢查欄位，無複製資源或個資。
- 商品新增 purchase_mode，下拉「限店內／網購」，既有商品預設限店內，舊表單缺欄位不覆蓋設定。
- 網購要求購買人姓名、台灣手機；Email 選填。收件人可同購買人或分別輸入。郵寄分縣市、區域、地址；超商維持手填門市。
- 後端 quote 和原子 order INSERT 雙重限制 active + online；買家快照沿用原本訂單隔離與冪等機制。金流、正式資料、共用點數及 QR 扣抵後端未變更。

## 驗證

- change guard before / after passed。
- 59 個 Node 測試通過：store-history-popup、store-wallet-summary、store-point-qr-routing、store-shop、store-commerce、store-cashier-requests。
- 新增 migration preservation、舊表單模式保留、非法模式、限店內繞過／建單競態、買家缺欄位／非法手機 Email、不同收件人、郵寄／超商、個資權限與舊訂單相容測試。
- localhost:8794 合成資料 Chrome：390px 手機模式，store-purchase-mode.js 與 store-commerce.js 通過。覆蓋模式儲存、必填、同購買人、不同收件人、隱藏寄送欄位、返回保留、不存個資、無橫向溢出，以及下單回應遺失復原／匯款回報／核帳／寄送／完成。
- git diff --check passed。
- Wrangler 4.130.0 快取缺少 workerd-windows-64；改用已有完整安裝的 4.128.0，deploy --dry-run 通過：1026.10 KiB / gzip 215.28 KiB。沒有部署。

## 待授權發布

- 尚未 commit / push / 套用遠端 migration / deploy。
- 先核對遠端未套用 migration，僅預期新增 0035_store_product_purchase_mode.sql；先 migration、Worker、前端，保持既有收款開關。
- 本次測試均在隔離合成資料環境，無真實付款或扣點；不代表正式網購收款已開放。
