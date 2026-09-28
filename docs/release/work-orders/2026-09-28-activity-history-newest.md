# 活動報名紀錄最新在前

## 1. 變更摘要
- 使用者確認活動直達已正常，要求報名列表最新在最上。
- 基準／回復點：cbc92fb1e32f7245632fcc9e4a7e9744558e36da。
- 範圍：home.js 報名紀錄顯示順序與索引、index 快取版本、對應測試／契約。依既有授權完成後直接部署。
## 2. 只允許改什麼
- 移除前端對後端最新在前結果的反轉。UI 索引與 myActivitiesData 一致。
## 3. 禁止範圍
- 不改 Worker、DB、會員、點數、活動直達、報名／取消／核銷／繳費行為、行事曆排序及後台。
## 4. 原因與影響
- listMyRegistrations 已 ORDER BY created_at DESC；loadMyActivities 再 records.slice().reverse()，導致舊報名在最上。
## 5. 修改前
- node tools/run-change-guard.js before：PASS。
## 6. 規格
- 已讀 feature-change-protocol、core-invariants、admin-activity-registration 以確認範圍；新增 activity-registration-history 契約。
## 7. 不變規則
- 身分、權限、點數、報名資料與操作均不變；不在正式環境送出測試報名或取消。
## 8. 實作
- home.js 移除 reverse 及反向索引計算，直接依 API 順序渲染；index home 版本改為 8.12，版本鎖定同步。
- 新增 5 項報名排序／索引測試並加入完整 guard；既有活動直達瀏覽器測試擴充報名清單、明細、QR 與取消提示。
## 9. 修改後
- 相關 Node 測試 39/39 PASS；node tools/run-change-guard.js after PASS；JS syntax 與 git diff --check PASS。
## 10. 驗證
- 隔離 Chrome PASS：最新報名在最上、清單／明細／QR 一致、取消提示指向正確項目；保留 320／390／1440px 活動直達回歸。取消在瀏覽器測試中拒絕，沒有正式寫入。
- 瀏覽器首輪測試定位器未包含 QR 圖示文字而逾時，修正定位器後通過；應用程式功能無另改。
- 合成 LIFF 與報名紀錄，不代表手機 LINE 實機測試。
## 11. 部署
- 僅 Pages，無 Worker／migration。部署與 live hash 證據留在 PR。
