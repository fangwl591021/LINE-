# 商城後台連動（2026-09-23）

## 2026-10-27 現行方案

以[商城合作方案](store-cooperation-plans.md)取代下列舊角色／名額限制。僅redeem／扣點用戶、store／店長、admin／總管可作為零售店家目標；分別1／20／不限商品，支援原網購折抵。管理員代操作仍套目標方案的原子名額、owner與版本保護。reward／一般帳號的舊資料仍在管理員總表留存，但不公開、不能代上架取得商城權限。

以下是歷史實作紀錄；與現行方案不同的資格／名額描述不再適用。

- 2026-10-21 贈點單位追加：catalog owner 資格增加 reward／贈點用戶，保持一件未封存、店內且不折抵的展示商品限制；管理員既有查詢、草稿佇列、展示編輯、代新增與原子 audit 同步支援，不授予 owner 任何管理員／扣點／網購收款權限。

- 2026-10-21 catalog owner 資格增加 redeem／扣點用戶；既有管理員目錄、草稿佇列、展示編輯及代新增沿用原管理員認證／owner 快照／版本／原子 audit，只准一件店內不折抵展示商品，不授予該 owner 管理員、收款、網購或商品 QR 權限。

- 2026-10-19：商品新增／編輯可設定 shipping_fee_cents 單件運費，0 免運，NULL 相容舊店家計費。管理員沿用版本、權限與原子 audit。只有運費改變而所有其他正規化欄位相同時不重審既有展示內容；不切模式、不發布草稿、不變更醫療等審核決定，其他變更仍經原審核。

- 參照福委會管理分區，不搬資料或帳號。現行 admin.html 提供商城管理入口，與手機共用 catalog 模組及 store_shop_*；舊 admin-v2.html 不在本次範圍。
- 沿用合作店家、管理員目錄與新增商品，不更動原會員店家管理 API。
- 獨立 /v1/store-shop/admin/catalog GET 查單店及游標分頁商品；POST 更新既有店家／商品的展示欄位與狀態。
- 所有讀寫需經 authorizeStoreAdmin，非管理員不得跨店。請求不得指定 owner、role、點數規則、支付／訂單欄位。
- 草稿待確認是現有 draft 篩選，不宣稱草稿已送審，不新增所有店家強制審核門檻。
- 合作店家未綁帳號仍沿用 partner 編輯器，不替其偽造註冊或建立商品。
- 店面只允許 draft / active。商品只允許 draft / active / archived；封存保留歷史，管理員此入口不恢復封存品。
- CAS 比較店面／商品版本，寫入時再核對管理員與店家角色快照。2026-10-19 使用者要求：允許管理員修改合資格店家既有商品的 purchase_mode（in_store / online），GET 只提供 online_product_allowed 能力布林，不新增身份資訊；一般會員仍一件、店內、不折抵，不能以封存繞過新設網購限制。未指定銷售方式的舊請求保留原值；redeem_type、redeem_value 仍保留且拒絕由此入口修改。
- 0045 僅新增商城操作稽核表。request_key 唯一；payload 與操作者一致重試回原成功，異動 key 使用衝突回 409。
- 快照稽核 INSERT 與 version+1 UPDATE 同一原子 batch；沒有稽核或任一 SQL 失敗不得更新。
- 修改後公開目錄依原有 active／角色規則顯示，手機管理讀到同一 version。不呼叫收銀或點數服務，不異動舊訂單快照。
- UI 具返回入口、儲存確認、重試同一請求及重新載入；不快取 token、不自動發布、不載入其他 admin 分區。
- 2026-10-19：GET 只對已核准的按摩機 version1／店家version6附加 `manual_online_release.reference` UI提示；POST 的 `manual_release={reference,confirmed:true}` 只可配合該商品單一 purchase_mode=online 變更。後端驗證固定快照、圖片bytes指紋、原政策 medical-only manual紀錄，寫入時再綁定同review JSON、商品快照／版本與原管理員／owner角色。既有audit payload另記核准原因／指紋／明確確認，不新增無紀錄資料更新或一般免審權限。成功後version2即不再提供，原審核紀錄不被修改。
- 續作：GET admin/catalog?queue=draft&after=UUID 提供全站草稿，每頁 20 件；僅管理員、只含目前仍具商城資格的店家；回傳商品展示欄位及店名，不回傳會員身份或交易。不得與 shop/status 混用。
- 管理員手機與後台共用全站草稿入口，開啟店家重新查閱最新草稿，不因點擊待確認便自動上架。
- 編輯店家／商品圖片沿用既有 uploadImageToR2，先重新確認管理員與目標店家；限制 JPEG/PNG/WebP、10MB、4000 萬像素，等比縮至 1600px、輸出 4MB 以內。上傳不等於儲存，失敗不覆蓋原網址；不改既有點數或發布規則。
