# LINE- 專案代理入口

本專案是點數通 LINE OA／LIFF、CRM、名片、人脈交流與商城系統。使用繁體中文溝通，依使用者本次需求做限定變更。維護者：專案維護者；核對日期：2026-10-26。

## 開始工作

- 先核對實際 Git 根目錄、remote、分支與未提交變更。正式來源為 `fangwl591021/LINE-`；不要只憑聊天的工作目錄名稱判定專案，也不要覆蓋其他工作的變更。
- 功能修改先依[風險地圖](docs/contracts/change-risk-map.json)選擇相關文件與檢查，可執行 `npm run scope:lookup -- <area>`。按需讀取該區契約，不預載所有歷史工作單。
- 身分、名片歸屬／版本、公開資格、點數及 LINE 行為，以[核心規則](docs/rules/core-invariants.md)與對應功能契約核對；規格索引在[專案文件入口](docs/README.md)。
- 若最新需求、文件與程式不一致，先查明適用範圍，再同步更新受影響的規格與驗證；不要自行擴大權限或修改其他功能來讓測試通過。

## 修改與驗證

功能修改遵守[變更流程](docs/release/feature-change-protocol.md)，使用既有[工作單](docs/release/change-work-order-template.md)記錄範圍與證據：

```powershell
npm run guard:before
# 限定範圍修改；完成相應功能或瀏覽器驗證
npm run guard:after
```

- 相關檢查失敗時先修復，不發布該版本。純文件整理核對連結、技能格式及與程式的一致性；不因整理文件而修改產品行為。
- 測試、合成瀏覽器流程、線上檔案讀回與手機 LINE 實收是不同證據，完成報告應分別說明。不要把模擬測試寫成真人帳號驗收。
- 使用者已指定：相關測試通過後直接部署。此授權沿用於已要求的修改範圍；只讀、規劃或僅本機要求仍依本次指示，不追加無必要的確認流程。
- 不因測試或教學而自行發送真人 LINE 訊息、異動正式點數或建立交易；如本次明確授權此類驗收，記錄其結果與必要的還原狀態。

## 按任務載入

| 任務 | 讀取入口 |
| --- | --- |
| 介面、排版、元件尺寸 | [DESIGN.md](DESIGN.md)，再讀該元件 CSS／契約 |
| 教學影片、影音名片、人物介紹及既有影片修改 | [影音製作技能](.agents/skills/line-media-production/SKILL.md) |
| 測試、部署與正式版本核對 | [發布驗證技能](.agents/skills/line-release-verification/SKILL.md) |

這兩個技能位於專案 `.agents/skills/`。設計文件由本入口按任務引用；不把它當作所有代理都會自動載入的特殊檔名。

## 發布與維護

- 先確認實際服務來源。現行前端由[Pages 工作流程](.github/workflows/deploy-pages.yml)發布；Worker 入口、名稱與資源綁定以 [wrangler.toml](wrangler.toml)為準；媒體依實際 R2 物件與前端網址核對。
- 只發布需要的部分。前端或文件修改不必重新部署 Worker；不順帶改 schema、資源綁定、排程、金鑰或母站點數權威。
- 本文件保持精簡；詳細業務規則只維護在原契約中，技能與 DESIGN 引用來源。使用者核准規格變更時，同步更新對應來源，避免保留互相競爭的版本。
