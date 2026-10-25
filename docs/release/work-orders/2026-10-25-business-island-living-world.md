# 長條動態群島與舊版立體骰子

- 日期：2026-10-25；基準：e4a97b6448bf3a9ab07b8fc8a77eeacf7f5e24d8。
- 使用者要求：恢復以前真實立體骰子／按點數走到抽中會員；島嶼是長條由上到下，分食宿遊購行／服務／製造，有船移動、水面／水池和小人走動。
- guard:before PASS（island-world-guard-before.log）。已讀 feature-change-protocol、core-invariants、business-island、game-center、card-resolvers。
- 範圍：交流島專屬JS/CSS、新的可取消場景與骰子行走模組、七種主題場景資產、瀏覽器測試／快取／契約。
- 舊版基準：business-richman.js 中雙立體六面骰、1100ms搖骰、650ms一步、兩顆總和2至12步；保留商城原檔與規則。
- 授權名單／公開名片／明確私訊／會員身分／點數／schema／Worker與正式bindings等不變。分類只依已可見的公司／職稱與既有業種搜尋，不新增私人欄位讀取。
- 每次骰子仍從原random會員API取樣，將會員放到群島停靠點；兩骰總點數必須決定實際步數並走到本次選中的會員。只擲骰不建聊／開名片／發訊。
- 七島與路徑高度不縮成橫幅，僅主內容直向捲動；擲骰時鏡頭跟隨角色，手動瀏覽與手動選會員不強制跳捲。
- 動態均可在離頁／切帳號／背景／縮減動畫偏好時暫停或取消；舊行走不得回頭更新／開窗。場景人物為裝飾，不標示在線狀態。
- 發布前完整guard與原商城回歸、真瀏覽器骰面／點數步數／到達／取消／手機長圖／私訊／低動態偏好驗證；正式發布只更新本次範圍並核對線上位元組。
- 最終guard:after PASS；Node／SQLite相關回歸107/107 PASS，原商城雙骰與走路檔案不改。
- 最終真Chrome回歸22/22 PASS：七種真透明資產、18位公開摘要分類、320／390／430／768／1440長場景、可見動畫變化／離屏凍結、兩立體骰12面42pip與1..6朝向、原1100ms搖骰／650ms步進；正常1+1實走2步，完成時間約1809.7／2462.1ms（間隔652.4ms），同一player到達選中pin的幾何誤差約0.004px。
- 驗證手選不跳捲、明確擲骰鏡頭跟隨、就地公開卡GET、離頁／改搜尋／切區／換帳號／背景取消、503重試；BFCache／隱藏清單／告示板重開保留骰面與角色矩陣／捲軸。合成建聊1／送訊1僅明確操作；外部請求0、pageerror0。
- 七張900px透明WebP由內建image_gen製作，sharp僅做縮放與壓縮；資產及完整提示見assets/business-island/README.md與world-assets-v1.json。
- 快取更新交流島JS/CSS v3，獨立world.mjs v1；僅發布GitHub Pages，Worker／D1／bindings／vars／secrets／cron不重新部署或修改。
