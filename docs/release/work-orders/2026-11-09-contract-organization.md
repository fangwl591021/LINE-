# 契約推薦組織圖
會員專區及商城會員頁提供「我的組織圖」。後台兩個獎金制度入口預設契約推薦組織，舊制安置與舊制推薦保留個別選項。同一推薦人的成員並排，可以收合分支、調整顯示代數。

查詢只讀取審核通過且有推薦會員編號的共創手簽與已登錄契約。推薦來源衝突時不列入。成交標示依既有確認紀錄。本人由 LINE access token 決定根節點，指定他人只開放管理員。輸出限於分支、顯示名、會員編號及狀態。無新資料表。

驗證採用 contract-organization.test.mjs、contract-organization-ui.test.mjs、專案前後 guard 和 Worker dry run，發布後核對服務及 Pages 資產。

