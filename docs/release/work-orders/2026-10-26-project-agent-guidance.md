# 專案 Markdown 指引分工

- 需求：使用者同意導入 AGENTS.md、DESIGN.md、影音製作與發布驗證兩個專案技能。
- 基準 origin/main d9faa22665e2aebd3ef11930f1af9755fa5acbe9；before guard PASS（../agent-docs-before.log）。
- 範圍：新增根目錄代理／設計入口與 `.agents/skills/line-media-production`、`.agents/skills/line-release-verification`，更新 docs/README 的引用，將舊 deployment-runbook 的五月回復點標為歷史資料並連至現行流程。只整理工程指引；不改 HTML、CSS、JS、Worker、功能契約、測試行為或正式資料。
- 原規則繼續由 core-invariants、各功能契約、feature-change-protocol、change-risk-map 及 CI 維護；新入口按任務引用，不複製整套規格。
- 應用 skill-creator 指引；OpenAI 官方文件確認 repository `.agents/skills/`、name／description frontmatter 及 AGENTS 載入方式。DESIGN 的數值由現行元件 CSS／markup 核對，尺寸限定到元件。
- 驗證：技能格式驗證、相對連結與引用路徑檢查、獨立情境審查、after guard。只同步文件到原 GitHub 專案；主分支 Pages 工作流程如自動執行則核對，沒有 Worker／R2／資料操作。
- 格式與本機引用：兩技能 quick_validate PASS，42 個本機 Markdown 引用路徑 PASS，沒有新增專案依賴；驗證器所需 PyYAML 6.0.3 僅裝於儲存庫外的隔離驗證目錄。
- before／after full guard PASS（../agent-docs-before.log、../agent-docs-after.log）。獨立情境審查驗證純文件發布不操作 Worker／資料與既有部署授權；補明同名人物仍無法核對時先釐清必要資料。獨立查核發現商城有效樣式覆寫基底數值，DESIGN 據實修正。
- Git／同步：只同步專案文件，正式 runtime 與設定維持原樣；具體 commit、PR、CI／Pages 結果與正式讀回核對另存儲存庫外的 agent-docs-release.json。
