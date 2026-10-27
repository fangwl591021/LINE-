# 商城三種合作方案

- 日期：2026-10-27；起始main：1ea46a153feb0ebb077ebd1812a1dc8a2e72e92f。
- 來源：使用者三種合作方案功能比較圖；本規格取代先前reward/user可刊登一件展示商品與store不限件數的舊規則。
- 贈點單位（reward／贈點用戶）：免費、可贈購物金；沒有零售店面資訊／商品上架／接受折抵／網購／到店交易／到店取貨權限。獨立CRM贈點單位公開目錄保留，不等同零售商城店面。
- 折抵店家（redeem／扣點用戶）：免費、不贈點；可公開店家資訊、1項未封存商品（草稿計入）、網購與商品折抵、實體交易及到店消費。到店取貨待確認，先不開放。
- 雙向完整版（store／店長）：年費未稅6000元、含稅6300元；可贈點、折抵、店家資訊、20項未封存商品、網購、實體消費、到店取貨。管理員admin／總管是管理角色，不套商業方案20件上限。
- 一般會員保留買家權限，不是上述商業方案，不可自行開商城。
- 允許：共享方案定義、店家／產品owner及admin寫入與原子上限、公開目錄／商品、網購角色、完整版到店取貨、商品QR折抵權限、前端管理入口／方案標示／價格說明、相關測試及契約。
- 禁止：變更會員角色／歸屬、刪除舊店家商品訂單、改已成立交易金額、年費訂單／付款／獎金帳本、贈扣點母站實作、LINE reply owner、金鑰、綁定或排程。新方案不自動扣年費、不把既有商品6000售價改6300；正式資料無批次寫入。
- 已有超額產品保留，不能透過owner或admin新增／重新上架繞過上限，可封存釋出名額；不任意挑商品刪除。
- 已讀：AGENTS、core-invariants、change-risk-map平台商城入口、store-shop、store-commerce（原歷史平台商城文件已指向店家自營商城）、line-release-verification、workers-best-practices及wrangler。
- guard before：PASS（../shop-plans-before.log）。
- guard after：PASS（../shop-plans-after.log）；最後封裝前再跑同一完整檢查。
- 真SQLite：catalog/admin/discovery與贈折角色112項、LINE關鍵字與admin目錄50項（另新增自取聊天室隱私用語測試）、commerce/points/QR76項、AI/OCR權限及原來源／SSRF等124項通過。測試帳號與母站帳本均為隔離合成資料，不視為正式扣退點驗收。
- 實際Workerd/D1：../shop-plan-listing-runtime.log通過；折抵1件、完整版第19件時並行新增只一件成功、21件拒絕、贈點／一般賣家拒絕且無原資料刪除。
- 前端136項通過；真Chrome新流程320／390／1280及原郵寄結帳320／390／1440通過。完整版自取地址電話由報價帶入、免運、備妥到確認領取；折抵店家無自取選項，贈點保留贈點工作台及獨立目錄。私人截圖已視覺核對，無橫向溢出。
- cache：store-shop-entry74／shop71／points-home8／store-admin5／admin-products4／admin-catalog8／commerce8／admin-mall-dashboard8；index、admin與獨立商城入口一致。
- Wrangler4.120 dry-run --keep-vars通過。正式前settings／schedules雜湊與上一版相同，ACTMASTER_DB／KV／R2綁定不變；無migration。
- 測試通過直接部署Worker及Pages。原設定及三個cron前後核對；不發真人訊息或實際扣退點。
