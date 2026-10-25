# 商務交流島場景資產

## 長條動態群島 v1（2026-10-25）

- 七個900 × 900透明WebP：`food-v1.webp`、`lodging-v1.webp`、`leisure-v1.webp`、`shopping-v1.webp`、`mobility-v1.webp`、`services-v1.webp`、`manufacturing-v1.webp`，每張約325至356KB。
- 使用內建 `image_gen` 生成，原`island-v1.webp`僅供視覺風格參照；生成後以sharp等比例縮至900px並壓縮WebP，保留alpha，沒有覆蓋舊圖。
- 完整最終提示與來源檔名：[world-assets-v1.json](world-assets-v1.json)。各島不含烘焙介面、會員、人或船；角色、雙立體骰、會員標記、船、水紋與泳者由程式獨立運作。
- 場景位於`business-island-world.mjs`及交流島專屬CSS，七島手機各440px，維持真正長條地圖。裝飾角色不表示正式會員在線狀態。

## 原固定場景 v1

- `island-v1.webp`：1672 × 941，約 443 KB；網站使用的固定視角場景背景。文字、會員頭貼、公開名片和操作控制均為實際 DOM，不在背景圖片中。
- 來源：此任務以內建 image_gen 依使用者確認的原創視覺提案生成乾淨場景；未包含政治品牌、姓名或真人會員資料。
- 生成後只用 sharp 做 WebP 格式與壓縮優化，未覆蓋任何既有資產。

## 最終圖像提示

Use case: precise-object-edit. Asset type: production background image for an interactive web application. Edit the approved 商脈交流島 image into a clean scene-only background. Preserve the landscape camera, rich low-poly 3D style, sunshine, overall composition, architecture materials, stone waterfront, turquoise channels, bridge, trees, flowers, benches, café terraces, pier, boat, and depth. Keep the large business clubhouse in the upper middle-left, the wooden cooperation pavilion at upper right, and the terracotta-roof studio in the lower right. Remove all interface overlays, branding, profile card, top navigation, buttons, floating labels, purpose selector, icons, people, headshot posters and avatar markers; inpaint the covered regions into a coherent matching landscape. Remove readable text, logos and lettering on signs, noticeboards and banners; keep blank noticeboard geometry. Edge-to-edge landscape environment with no typography, UI or people; retain the three identifiable landmarks and the approved detailed visual style.
