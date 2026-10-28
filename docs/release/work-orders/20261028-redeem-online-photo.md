# 折抵店家網購／折抵設定及店家封面儲存修正

- 使用者要求：依三方案表，免費折抵店家可上架一項商品、接受線上與實體折抵；處理店家照片上傳後公開店面仍舊圖。到店取貨仍依原待確認規則，不擴大。
- 正式repo fangwl591021/LINE-；基準main2cbcc0853fd591e11d23ebaea7f3b07991ef8045；分支codex/redeem-online-photo-fix-20261028。其他Smart-Menu-Studio工作區不修改。
- 已讀AGENTS、core-invariants、store-cooperation-plans、store-shop、store-commerce、DESIGN與發布驗證技能。guard before PASS（../redeem-online-photo-before.log）。
- 初步查證：現行共享方案與後端已允許redeem網購／折抵；須查設定表單、舊預設、cache與儲存失敗，不能只改標籤。智點通公開shop版本1、最後儲存2026-09-10，仍是原image_url；不是已儲存的新圖被相同URL快取。上傳檔案與店面正式儲存是分開流程，需讓狀態清楚且能完成儲存。
- 允許：對應商城設定／圖片儲存流程、必要role/plan UI、折抵商品驗證、必要cache、契約及實際流程測試。依證據縮小改動，不改無關功能。
- 禁止：擅自更改正式店家圖片／公開狀態／商品價格／折抵比例、冒名建立訂單、實際扣退點或發LINE；不移除AI內容審核、owner/version/role檢查，不改母站、金鑰、綁定、排程、既有合約或獎金。
- 最終before／after full guard皆PASS（../redeem-online-photo-before.log、../redeem-online-photo-after.log）。後端170/170、admin新增UI14/14、照片focused13/13及實際Workerd/D1皆通過；不修改既有點數、商品QR或結帳算式。
- 真handler＋SQLite＋Chrome320/390/1280：admin新增明選→不折抵上架拒絕／草稿可存→admin改百分比儲存重開→公開網購折抵→owner改固定額儲存重開→真結帳quote含折抵與運費，訂單/點數寫入0；含扣點用戶中文role。證據../redeem-product-browser/。
- 同三寬度照片流程使用真pointer click及命中檢查：上傳CTA居中且位於大圖前；AI拒絕/版本衝突保留新圖；明確儲存→重開管理/公開列表/詳情同原始新URL；草稿提示尚未公開且公開404；上傳失敗與取消保持原資料。證據../shop-photo-browser/，0正式寫入/0外部服務請求。
- 獨立審查及回歸：原單品人工放行11/11＋Chrome320/390/1440，修改折抵額度不能繞過、還原後僅送purchase_mode；既有管理圖片回應遺失重試、切帳隔離與獨立運費／扣退點合成流程皆通過。三種歷史none成功請求重送200且0新寫入/0AI呼叫，不誤判為未存。所有詳細截圖/日誌位於repo外，不隨Pages公開。
- 必要cache統一shop73、shop-entry76、CSS35、catalog9、products5、admin-dashboard9；auth／合約／影片／其他入口不改。無schema或正式店家/商品資料更動。
- 測試通過依既有授權直接部署必要Worker／Pages，核對正式檔案與設定；不得把合成扣點或瀏覽器測試寫成實帳號交易驗收。
