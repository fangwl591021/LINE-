# 店家列表與商店設定導覽修正

- 2026-10-20 使用者回報：店家入口跑去找商品、折抵店家選中而無法進入商店設定。
- repo fangwl591021/LINE-；checkout .worktrees/veo-crm-tasks-release；branch codex/store-entry-management-20261020。
- baseline d6569bfbccb686988c6e82fa19414f9e8b904455；guard before PASS。
- 已讀 feature-change-protocol、核心不變規則、button-actions、liff-routes、store-shop（相關入口條款）、回歸矩陣與工作單模板。
- 發現：純 shopSection=list 雖被 auth 接受，但 mount 沒有分支而回退商城首頁；上方管理按鈕 primary 寫死且不隨頁面同步。
- 先增加隔離瀏覽器測試，覆蓋實際 home入口／loader／navigation／store JS、320/390/1280、純list與簽到卡、管理與瀏覽切換及請求；重現後才修正。
- 本次允許：補上純list目錄對應；上方三入口區分找商品／店家列表／商店設定，依目前頁面更新選中狀態，管理只走既有本人manage API；新增明確測試及cache版本。
- 禁止：變更角色／UID／登錄／推薦、放寬管理權限、修改CRM／店家／商品資料、母站點數／扣退點、QR／交易、AI審核、Worker／schema／secrets／bindings。簽到卡 mall 仍導商品、details仍本人紀錄；不讓舊網址覆寫使用者點選的設定。
- 原生瀏覽器工具受 F 槽沙盒啟動及既有debug profile鎖定影響，不能宣稱已在使用者真實LINE重現；使用本機合成LINE／API真實前端操作測試，不修改正式內容。
- guard after：PASS；首輪遇到舊QR暖機白名單斷言，保留原保護並加入list後重跑通過。相關入口／管理／簽到28項PASS。
- 操作測試：一般會員／店長／管理員 × 320/390/1280 共9組PASS，真正navigation/home shortcut/loader/store模組，不是只測字串。純list到店家目錄、設定只讀本人資料、三入口選中互斥、較慢列表不覆蓋設定、簽到卡商品導向保留、明確管理不受舊簽到網址覆寫；reward/redeem/tenant/未知角色仍拒絕管理。
- 合成服務只GET，僅簽到來源追蹤用模擬POST；沒有正式寫入、贈扣點、推播或AI呼叫。截圖 C:/Users/User/AppData/Local/Temp/store-entry-management-20261020/。
- 修改檔案：商城JS/CSS與loader／HTML快取（JS64/CSS33/entry67）、入口契約、測試／工作單；後端不改。通過後依既有授權只部署Pages。
