# 會員辦活動 DM 縮圖、全圖與發布可見性

## 1. 變更摘要

- 日期：2026-10-06
- 需求：DM 沒縮圖、詳細沒全圖、沒有公開；使用者確認沿用登入平台會員可見。
- 起始 commit：79928711766041938fa8c2d83a84de3a6015b3c2（main；tree 等同 d1e555a）
- 目標：只補會員辦活動 DM 的確認發布儲存、附件檢視及可見入口。
- 預計檔案：member-hosted-events contract/backend/frontend/CSS、member-event-dm frontend、首頁入口 index.html、專用測試及 full guard 清單。
- 部署：通過前後 guard、附件權限／同筆發布／浏览器驗證後，Worker 與既有 Pages 流程。
- 回復：Worker 0f448d7d-1cc3-4900-8490-de3fd7b5e2a3、Pages 起始 main；不刪資料。

## 2. 允許範圍

- 同一筆活動於明確確認後保存4MB內DM，不在辨識階段自動上傳。
- 縮圖、完整比例明細、全圖返回；PDF 文件入口。
- 已發布 active 對所有登入平台會員可見；首頁提供會員活動入口。

## 3. 禁止範圍

- 不改名片、官方活動／梯次、點數、LINE 關鍵字、身份歸屬、推薦、金鑰／bindings／crons。
- 不開放匿名附件或活動，不自動發布既有草稿，不修改使用者活動資料。
- 不修改外層 Smart-Menu-Studio 或其他 dirty worktree；不加資料庫 migration。

## 4. 已讀契約與風險

- core-invariants、feature-change-protocol、change-work-order-template、member-hosted-events。
- 圖片與活動發布分屬R2/D1，引用驗證確保未發布附件不可讀；保存失敗安全清理，不冒稱跨存儲交易。
- 本機／合成LINE身份測試不代表實機LINE验收；證據需分別標示。

## 5. 修改前

`node tools/run-change-guard.js before`：PASS（完整 smoke）。

## 6. 修改後及實測

- 相關 Node 測試72項全通過；完整 guard after PASS。
- 真實 Workers compatibility 2026-04-23 + 隔離本機 D1/R2：1182056.jpg 加密保存/取回逐byte一致、一般會員可見、匿名401；沒有正式寫入或AI呼叫。
- 390×844 Chrome 模擬：取消草稿後列表仍空；確認發布顯示完整DM；另一位會員可見縮圖與明細、沒有管理按鈕；全圖比例1024:1536保持、返回可達。
- PDF以文件入口，不自動製作圖片縮圖；先前沒有保存的DM需編輯時補上一次。實機LINE驗收未完成。

## 7. 上線判斷

通過前後 guard；待最後CI與發布檢查。只部署LINE- line-engine +既有Pages，不改bindings/金鑰/cron/資料庫schema。
