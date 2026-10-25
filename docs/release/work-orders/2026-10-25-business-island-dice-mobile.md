# 商務交流島骰子探索與手機直向排列

- 日期：2026-10-25；基準：294f647e882a9d6ac154aff8e849b89b70588239。
- 使用者要求：維持骰子隨機尋找、上方名單不要只有少數；手機為主，由上到下瀑布式；修正容易跳出去。
- 已讀 feature-change-protocol、core-invariants、card-resolvers、game-center、business-island 契約。
- guard:before PASS（island-dice-guard-before.log）。
- 允許範圍：交流島 JS/CSS、既有會員目錄新增 random 排序（只供島嶼使用），相關測試／快取／契約。
- 不變：原名片查看驗證、私訊 composer、會員及名片資料、公開池資格、商城大富翁、點數、schema、正式 bindings／vars／secrets／cron。
- 隨機取樣必須沿用既有授權會員目錄 SQL，從完整合資格集合抽樣，不限最新30人。擲骰只改目前顯示的會員；不自動開名片、不建聊天室、不送訊息。
- 手機僅主內容縱向捲動，取消760px地圖及名單內部捲動；點會員／切分區不強制捲動。島內隱藏主站底部導覽，頁首保留明確返回。
- pagehide 仍取消請求；pageshow persisted 回來可重連，原帳號保留有效選中狀態，換帳號清除。
- 修改後：完整 guard、會員目錄SQLite回歸、真瀏覽器骰子／直向／離返／原私訊與商城回歸；部署後讀回線上位元組與保留設定。
- 整合main 725ace72740275e38103e872a6e59a17f224bd72（並行PR256，無檔案重疊）；保留其來源，不執行該PR的0073或其他D1 migration。隔離建置確認該main的Worker bundle與正式版784da337完全相同。
- 相關Node／SQLite回歸107/107 PASS；會員random測試從80位完整合資格集合抽樣，驗證原分頁、過濾、封鎖與停止聯絡不變。獨立JS/CSS審查無阻擋問題。
- 真Chrome回歸19/19 PASS：18位合成會員全部可由主內容縱向到達，390px 8個／701、730、1440px 12個pin無互遮；320／390／768／1440直向與44px操作通過。骰子延遲時切區／搜尋／離頁及503重試不覆寫，BFCache狀態與原私訊composer／商城返回皆通過；外部請求0、pageerror0，建聊1／送訊1僅合成明確操作。
- guard:after與Wrangler dry-run通過；快取僅更新交流島JS/CSS到v2，原商城JS／導覽版本不變。
