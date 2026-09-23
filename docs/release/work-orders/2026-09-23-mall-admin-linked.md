# 商城後台與手機連動

- 日期：2026-09-23
- 需求：參照福委會管理架構，不匯入其資料；只修改商城。
- 起始 commit：23b6297（main，修改前乾淨）
- guard before：PASS，2026-09-23。
- guard after：PASS，2026-09-23；新增測試也纳入完整 guard。
- 部署：本次未要求，不部署、不操作正式資料。

## 範圍
續作（使用者「繼續」）：補全站商品草稿分頁入口、店家與商品圖片直接上傳／預覽；仍不部署。
續作 guard before：PASS。只擴充同一商城模組、合約及測試，不新增 migration。
全站草稿只是唯讀彙整既有 draft；不增加強制送審、會員權限或批次上架。
圖片上傳仍需明確儲存才更新目錄；失敗保留原圖，過期畫面／切換登入不得套用結果。

新增 admin 商城入口；沿用手機商城店家列表及代上傳商品。
增加獨立 admin catalog API 與共用編輯器，支援已註冊店家資料、商品內容及上下架。
草稿待確認只反映現有 draft，並非新強制審核流程；不改原店家的發布方式。
既有合作店家維持 partner 管理，不偽造 owner、不授予交易權限。
不得匯入福委會資料，也不建立新的會員／點數／訂單系統。

## 預計檔案
admin.html、worker-entry.mjs（只接商城路由）、worker/store-admin-catalog.mjs、
js/modules/admin-mall-dashboard.js、js/modules/store-admin*.js、js/modules/store-shop.js（只接 admin 入口）、
css/store-admin-catalog.css、migrations/0045_store_catalog_admin_audit.sql、商城合約及測試。

## 禁止
不修改 workerbackup、CRM、LINE 驗證規則、會員角色、名片、點數／收銀、訂單、簽到、遊戲、登入啟動流程、正式設定。
不更動福委會 checkout。

## 合約
已讀 core-invariants、feature-change-protocol、store-shop、store-admin-directory。
後端沿用 authorizeStoreAdmin；目錄 GET 不寫入，修改獨立路由驗證管理員。
只更新現有商城記錄，不變更 owner_uid／shop_id、商品銷售方式及點數規則。
版本 CAS 與稽核同一 D1 batch，失敗回滾；重送沿用 request_key。
一般會員店家名額限制保留；封存商品不在此恢復。

## 驗證
- 新增 test/store-admin-catalog.test.mjs：實際入口驗權、非管理員拒絕、版本衝突、重送／併發、原子回滾、跨店商品、分頁／草稿、一般會員名額、公開目錄連動、會員資料未變。
- test/browser/admin-mall-linked.mjs：合成資料，攔截全部外網；實際 admin bridge → 共用目錄 → 編輯／草稿 → 回應遺失原請求重試 → 新增商品表單 → 返回；320/390/1440px 無水平溢出，登出不寫入，惡意標題僅文字顯示。
- 截圖：本機 Temp/admin-mall-linked-20260923/catalog-{320,390,1440}.png；已視覺檢查 390px。
- 既有商城測試只隨商城快取版號更新精確斷言，未放寬其他行為。
- git diff --check 通過。
- 續作驗證：catalog 後端 19 項、管理入口 14 項通過；全站草稿只讀、分頁、角色過濾及嚴格查詢參數有測試。
- 續作瀏覽器：全站草稿 → 店家草稿 → 共用編輯器；無效檔案不送出、成功上傳不自動儲存、上傳失敗保留網址、重送使用相同 request_key、登出後忽略晚到圖片回應。所有外網攔截，零正式 API 請求。
- 手機入口另以實際函式驗證共用模組、草稿初始分頁、上傳前再查管理員資格與頁面／帳號切換保護。
- 續作 before / after 全站 smoke contracts 通過；320 / 390 / 1440px 無水平溢出，390px 截圖已目視確認。

## 發布及限制
僅本機完成，沒有提交／部署、遠端 migration 或正式資料寫入。
未來授權部署：先套用 0045，再 Worker，最後 Pages；不刪除稽核表回退。
0045 僅新增店家／商品管理稽核，不改會員、訂單與點數。
本次為商城管理連動第一版；沒有新增強制送審、員工專屬優惠資格、優惠有效期、全台地圖或福委會同步。
商品圖片新增沿用原上傳流程；既有店家／商品也可直接上傳、預覽或修改 HTTPS 圖片網址。選圖未儲存即離開可能留下未引用的 R2 圖片，延用既有上傳方式，這次不新增清除或刪除流程。
規則參照 Workers 最佳實務與官方 D1 batch 原子性文件；使用現有驗權、prepared statements、no-store、有界 JSON 與列表，設定及 bindings 不變。
