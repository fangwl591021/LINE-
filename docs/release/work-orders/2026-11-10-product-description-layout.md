# 商品編輯介紹與圖片版面

- 需求：使用者指出商城共用後台商品編輯器大片留白，但介紹textarea過小。
- 基線：main 8bffa27；完整before guard通過（repo外product-description-before.log）。
- 範圍：僅store-admin-catalog共用商品editor，名稱/分類兩短欄並排，圖片網址/預覽/上傳放左側，較寬且可垂直拉伸的介紹放右側；760px以下單欄介紹在前，至少240px；桌面介紹至少320px並填滿媒體區高度。
- 保留：原表單input及事件節點、3000字上限、圖片contain/原比例、hidden/disabled、dirty/取消確認、上傳後需明確儲存、送審紅字、版本/CAS/request_key、角色/資格及點數交易；店家資料editor不改。不操作正式儲存或圖片上傳。
- 預期檔案：catalog JS/CSS與必要手機/後台入口快取、DESIGN、既有browser fixture；無Worker/schema/API/資料修改。
- 已讀：AGENTS、DESIGN、feature-change-protocol、core-invariants、store-admin-catalog契約及line-release-verification技能。
- 驗證：完整before/after guard通過；catalog/feedback/admin-entry共49項測試通過；catalog-review-feedback隔離browser在320/390/1280確認介紹約290×273、360×273、628×492px、桌面圖文並排填高及手機介紹在前、無溢出，原紅字/確認取消/同request重試/遲到回應保護均通過。admin-mall-linked在320/390/1440驗證原圖片上傳、失敗保留舊圖、儲存重試及店家表單通過；正式外部請求0。證據保存在repo外product-description-*.log、catalog-description-browser/。
- 發布：CI通過後僅發布Pages，讀回8個正式檔案雜湊及比較Worker版本。正式帳號只開啟查看，不儲存商品；原編輯中的未儲存頁面保留。
