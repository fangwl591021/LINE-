# 會員私訊對方收訊延遲

- 日期：2026-10-26；main基準 `08de94d4191f9289b067a65b84c6942161c74fa1`。
- 使用者確認自己立即顯示、對方約8秒後收到。程式實查chat poll8000ms，且refresh busy等待已讀POST後才釋放。送出POST成功即顯示，未等refresh或通知。
- 已讀feature-change-protocol、core-invariants、member-chat-unread；新增member-chat-receive契約。guard:before PASS。
- 最小範圍：member-chat.js可見聊天室輪詢改1000ms及失敗退避、收訊與合併已讀回報分離、在途傳送提示保護；相關模組cache版本與測試。後端、正式Worker、D1/schema、權限、通知、點數與人脈島世界不改。
- 無正式登入瀏覽器可供量測（Chrome只有about:blank），不向正式會員發訊；採同一實際新舊module、兩端合成帳號與受控延遲transport比較，分清合成延遲與真實LINE手機驗收。
- 後端唯讀審查證實通知只由cron推播、send同步outbox；既有索引完整、合成SQLite未發現可解釋固定8秒的CPU成本。本次不因次要可能性擴大修改後端。
- 驗證：前後完整guard；原私訊／未讀／RPG等回歸；新舊收訊時間、慢已讀不擋接收、ACK合併與失敗不改徽章、傳送狀態、游標／重複／離頁和身份切換。通過後發布Pages並核對線上內容，Worker版本及設定保持。
- 最終完整guard:after、130項Node/SQLite PASS；原私訊Chrome（兩方聊天、失回覆冪等重送、封鎖、公開／私人卡、優惠券與通知）及首頁未讀Chrome PASS。
- 新增真Chrome延遲16/16 PASS：以實際基準08de94d舊module與新module、兩合成帳號和180ms transport比較，送出至對方顯示7.8s→0.6s；已讀另慢5s時舊12.8s→新0.6s。這是固定時點的合成量測，不宣稱正式手機0.6s；外部請求／正式訊息0。
- 單一已讀請求合併、失敗不改徽章、慢傳送仍收訊／不假sent、游標及重複去重、2/4/8退避、背景/關閉/換頁/owner/token、舊room ACK與舊poll不干擾新世代均PASS；獨立review另確認舊timer不能清掉新頁面配對timer，identity變更維持alive清理。
- 原browser私有卡錯誤文案斷言仍是舊字串，本次只對齊已在線的『對方目前沒有可查看的公開名片』，不變更產品文案／卡權限。版本cache：chat16、exchange1.27、island wrapper8；RPG CSS/world未改。
- RPG整合Chrome31/31 PASS。正式Worker確認仍為5f6a07ce，未變更任何Worker、schema或正式設定；Pages發布及最終線上回讀結果補於本次PR。
