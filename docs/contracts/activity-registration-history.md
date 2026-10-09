# 會員活動報名紀錄排序

- 2026-09-28：使用者要求活動報名列表最新在最上方。
- 沿用既有會員報名 API 的 `created_at DESC` 排序（報名建立時間，不是活動開始時間、繳費或核銷更新時間）；前端依回傳順序呈現，不得再反轉。
- `myActivitiesData` 與畫面順序一致；明細、活動內容、核銷 QR、取消報名的索引必須指向同一筆報名。
- 不改報名狀態、取消／核銷／繳費 API、資料、權限或查詢範圍；同時間或缺少時間者保留 API 原順序，不自行猜測時間。
- 首頁活動篩選固定最左側顯示「我的報名」入口，再顯示「全部」與其餘分類，載入、空列表或讀取失敗也保留。點擊只進既有 my-activities 頁並強制展開活動紀錄；紀錄區另有既有會員活動／課程 `openMemberEvents('mine')` 入口。兩套紀錄保持各自權限、ID 與 API，不以分類篩選猜測報名、不新增報名／取消／點數寫入。
- 回歸：`test/activity-registration-history.test.mjs`、`test/home-my-registration.test.mjs` 與隔離瀏覽器 `test/browser/activity-entry.mjs`。
