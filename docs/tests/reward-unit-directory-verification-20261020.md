# 贈點單位目錄驗證

## 資料與範圍

- 正式唯讀查核：CRM reward 帳號 7 個，目前沒有符合已公開／審核通過條件的本人公司名片。私有掃入名片不作公開來源。
- 不批次上架／不虛構內容。管理員在 CRM 贈點帳號旁「贈點單位上架」核對公司資料、補實際贈點條件、勾選公開確認，AI 通過才公開。只有公司電話可預填，未提供的圖片與條件留白。
- 新快照不修改 CRM 或角色。未來撤銷 reward 角色或將快照隱藏後，列表及詳情立即不再公開（primary/no-store 讀取）。

## 本機證據

- guard before 與 after：PASS；after 最終發布前再跑。
- 專用 SQLite / UI 共 16 項 PASS；含保留既有公開快照的失敗審核、原子失敗 rollback、版本與角色競態、防重送、公開白名單及私有資料不外洩。
- 加上點數首頁／CRM 角色相關回歸：50 項 PASS。
- 實際 Workerd／D1 隔離執行環境 PASS；compatibility 2026-04-23，flags=[]。驗證 primary session、batch、audit、公開、重送、AI manual 不公開、撤銷資格；不連正式服務。
- 實際新目錄與上架表單，320/390/1280px PASS：取消零寫入、核對勾選、AI 後儲存、首頁三張橫向卡片、更多、搜尋、詳情、電話、返回、空結果及錯誤重試、公開瀏覽零寫入、無頁面錯誤；合成 LINE/AI/SQLite。
- 截圖：C:/Users/User/AppData/Local/Temp/reward-unit-directory-qa-20261020/。含 home/editor/detail 三寬度，不是真實 CRM 上架紀錄。
- 舊跨店商品探索 320/390/1280px 回歸 PASS，公開唯讀。
- 額外舊 test/browser/store-admin-layout.mjs 的 rowHeight<195 斷言失敗：現行與 baseline 418b46a 的 CSS/JS 均為 486.015625px（320px 寬），相同無水平溢出及 sticky 工具列。此為舊管理員按鈕版面的既有檢查失配，不改原管理版面、不放寬斷言；非本次新目錄回歸。fixture 新增唯讀 baseline 比對選項及新模組回應。

## 正式驗收（部署後補記）

- 僅套用 0066 的兩個空展示／稽核表；不寫入任何單位、會員、名片或點數。
- 發布前設定 hash 81600cf369802b1442775be68f5b90e4f2a2920ac1863e721220bb68160a2af0；Worker 78ee505a-7bac-46a9-8f39-ef1c59730db5。
- 發布前 users(line_id,role) 有序 hash d3756c81ba5332f92f5c7c57679fc77f5b9290c2cbd54999a616868ba56e29d8，397 筆。不輸出原 UID。
- Worker / Pages 版本、CI、匿名及權限檢查待部署後填入 receipt。沒有以真實帳號刊登單位，未宣稱實際單位已公開或保證贈點。
