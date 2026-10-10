# 教學分類改成橫向四標籤

- 需求：四個分類必須在同一橫列，不用兩列或直式堆疊。
- 基準：`8124a837bbcb1beca9eaa734c7012654d281499b`，正式 HTML/JS/CSS exact Git main blob 已核對。
- 分支：`codex/tutorial-horizontal-tabs-20261010`
- 允許：教學分類 CSS、CSS cache version、對應 unit/browser 測試、教學 contract、本工作單。
- 禁止：教學 JS 與 13 支影片內容／URL、任何業務 UI／API、Worker、R2、身分、點數、報名與核銷。保留全部既有未追蹤檔案。
- 已讀：tutorial-center contract、core-invariants、feature-change-protocol、regression-matrix、deployment-runbook。
- before：完整 `node tools/run-change-guard.js before` PASS。
- 設計：單行不換行橫向標籤；正常手機寬度四個可見，極窄或放大字體只在分類列內左右滑動。移除標籤的視覺數量以省空間（保留螢幕閱讀器文字），數量仍在下方目前分類摘要顯示。分類及影片操作不變。
- 驗證：四個按鈕同一 y 軸、x 軸依序增加、390px 四個完整可見、窄列可橫向捲動、44px 點擊高度、內容不整頁溢出、切分類不載入影片、回退与播放正常。
- after：完整 `node tools/run-change-guard.js after` PASS；教學 unit 9/9 PASS；320／390／768／1366px browser 全數 PASS（四個同 y、x 依序、四個完整可見、44px 點擊高度、180px 窄列橫向捲動、13 支分類完整、原影片播放／章節／聲音／返回／焦點／重試均正常）。390px 截圖已目視確認一橫列四標籤。
- 部署：通過測試後 GitHub Pages；不部署 Worker／R2。驗證正式 exact served bytes 與實際橫列。
- 回復：revert 本 CSS 變更 commit；不動資料。
