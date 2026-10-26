# LINE- 介面設計基準

核對日期：2026-10-26。維護者：專案維護者。

本文件記錄目前實作與使用者已確認的呈現方式，供介面修改時按元件查閱。數值是現行基準，不授權重新設計其他頁面；使用者後續指定變更時，同步更新對應元件與本文件。功能資格、資料歸屬與交易規則仍由 [核心規則](docs/rules/core-invariants.md)及 [功能契約](docs/contracts/change-risk-map.json)管理。

## 先確認正在修改哪個介面

| 介面 | 樣式來源與範圍 | 現行基準 |
| --- | --- | --- |
| 一般首頁 | [home-reference-theme.css](css/home-reference-theme.css)：`body.home-page:not(.business-home-v2-active)` | 薄荷底、深色文字、綠色主操作；只影響一般首頁 |
| 選用 V2 首頁 | [index.html](index.html)：`.business-home-v2-*` | 深綠與金色；保留獨立啟用條件，不套用一般首頁覆寫 |
| 商城前台 | [store-shop.js](js/modules/store-shop.js)加入 `shop-lifestyle`、`shop-points-theme`；[store-shop.css](css/store-shop.css)後段主題覆寫 | 綠色頂部、淺色內容底、白色卡片；店家、商品及推薦卡各有版型 |
| 店家／管理介面 | [store-admin.css](css/store-admin.css)、各管理元件 CSS | 保留各自的藍灰文字、表格與工具列，不批次換成首頁主題 |
| 人脈島推廣／參觀頁 | [people-island-card.css](css/people-island-card.css)：`.pic-shell` | 乳白與淡綠、置中直式影片、明確建卡及分享入口 |
| 教學區 | [tutorial-center.css](css/tutorial-center.css)：`.tutorial-*` | 獨立對話框、橫向分類、內部捲動及影片區 |

改樣式前先確認 selector、目前頁面 class、載入順序及元件 CSS。`css/styles.css` 的全域背景不等於每頁最終背景；不要用未限定範圍的 `body`、`button`、`img` 覆寫所有頁面。

商城一般入口會同時套用上述兩個主題 class。`store-shop.css` 前段 `.store-shop` 的 `900px` 最大寬、`#f4f7f6` 背景、`16px` 內距是未套主題的基礎 fallback；目前入口以後段 `.store-shop.shop-points-theme` 及各子元件規則為準，不能只讀前段數值。

## 現有色彩與字體

| 範圍 | 現有值 | 來源 |
| --- | --- | --- |
| 一般首頁主操作／底色／文字／次要文字 | `#00866a`／`#eefbf7`／`#102f3b`／`#607986` | `--home-green`、`--home-mint`、`--home-ink`、`--home-muted` |
| 一般首頁功能色 | 橙 `#f87818`、粉 `#ed3a9e`、紫 `#9039e9`、藍 `#009deb` | `home-reference-theme.css` 的 `--home-*` |
| V2 首頁 | 背景 `#f4f6f1`、文字 `#073b31`、積分金色 `#f4c64c` | `.business-home-v2-shell`、`.business-home-v2-score-value` |
| 商城目前主題 | 背景 `linear-gradient(#008260 0 268px,#f8fbfa 268px)`、文字 `#173f35`、主按鈕 `#008260` | `.store-shop.shop-points-theme`、`.shop-points-theme button.primary` |
| 人脈島推廣頁 | 背景 `#f4f9f4`、文字 `#173f34`、主按鈕 `#087657` | `.pic-shell`、`.pic-shell .pic-primary` |
| 教學區 | 入口底色 `#ecfaf4`、主色 `#00866a`、對話框文字 `#173c33` | `.tutorial-entry`、`.tutorial-entry-play`、`.tutorial-dialog` |

- 人脈島推廣與島嶼場景使用 `system-ui,-apple-system,"Noto Sans TC","Microsoft JhengHei",sans-serif`；推廣頁基準為 `16px/1.7`。
- 商城目前由 `.store-shop.shop-lifestyle` 套用 `system-ui,"Noto Sans TC",sans-serif`，後段 points theme 設定基準字級 `16px`；前段 `.store-shop` 的 `system-ui,sans-serif` 僅為基礎 fallback。教學按鈕沿用頁面字體；其他頁面先查看現有繼承與 utility class，不為統一而替換全域字體。
- 圖示沿用 Material Symbols 的既有字型／填色設定；企業圖片與頭貼沿用各元件的裁切方式。

## 間距、卡片與操作元件

| 元件 | 現行數值與行為 |
| --- | --- |
| 一般首頁主要捷徑 | 容器圓角 `18px`、格距 `6px`；單格圓角 `12px`、最小高 `76px`、內距 `10px 2px`、圖示 `32px` |
| 商城目前主題容器 | 最大寬 `none`；內距 `20px max(12px,env(safe-area-inset-left)) calc(105px + env(safe-area-inset-bottom))`；`760px` 起左右內距 `24px` |
| 商城店家／商品卡 | `.shop-discovery-grid` 店家卡兩欄、格距 `12px`、圓角 `19px`；`.shop-browse-products` 商品卡兩欄、格距 `10px`、圓角 `17px`；`700px` 起這兩類列表可為三欄，店家列表 `350px` 以下格距改 `8px` |
| 商城首頁推薦卡 | `.points-recommended` 三欄、格距 `9px`、卡片圓角 `15px`；`760px` 起格距 `18px`，不沿用商品卡的兩欄規則 |
| 商城操作元件 | `.shop-points-theme .shop-bar button` 最小高 `44px`；`.points-wallet-refresh` 為 `36px`。基礎按鈕的圓角 `12px`、內距 `10px 14px` 與輸入框 `44px` 最小高只在未被特定元件覆寫時沿用，不能當成所有商城按鈕規格 |
| 人脈島推廣頁 | 最大寬 `1080px`；內距 `20px 18px`，`760px` 起改為 `30px`；按鈕最小高 `46px`、圓角 `14px` |
| 人脈島建卡入口 | 兩欄等寬、格距 `10px`、最大寬 `440px`；左「上傳名片」，右「用 LINE 生成／需填寫個資」；手機維持左右排列，分享放獨立一列 |
| 教學對話框 | 寬 `calc(100% - 24px)`、最大寬 `620px`、圓角 `22px`；標頭不隨內容捲走，內容區自行捲動 |
| 教學分類 | 依「會員與名片、店家與點數、活動與課程、AI任務」橫向排列；`nowrap`，窄螢幕允許橫向捲動，不能退成直向長清單 |

以上高度與間距只描述對應元件，不建立全站統一數值。保留 `:focus-visible`、停用狀態、`[hidden]` 及安全區內距；不要讓固定底部導覽或返回按鈕遮住最後一個操作。

## 名片與影片尺寸須按用途區分

- **人脈島推廣影音 Flex**：[people-island-flex.mjs](js/modules/people-island-flex.mjs)目前為單張 `bubble`、`size: 'mega'`，影片 hero、封面與 fallback 均為 `9:16`。加入按鈕及「分享好友」保留，分享連結沿用本人專屬 `ref/net` 流程。
- 上述 MEGA 是這張推廣卡的目前選擇，不代表個人名片全部改成 MEGA。原加入／註冊／AI 審核資格依 [人脈島契約](docs/contracts/people-island-onboarding.md)，不能靠隱藏或新增按鈕變更權限。
- **人脈島網頁播放器**：`.pic-video` 使用 `aspect-ratio:9/16`、`object-fit:contain`、寬 `min(100%,360px)`、圓角 `22px`；保留 `playsinline`、控制列與不能播放時的文字入口。
- **人脈島個人文案**：推廣頁「編輯我的影音名片・標題與說明」與聊天室quick reply共用原影片名片WYSIWYG文字欄位；標題80字、說明800字。預覽仍為9:16，影片／縮圖／固定按鈕唯讀；每人的title／desc獨立，不改既有個人影片版。
- **本人名片**：保留標準、滿版／海報、正方、影音四種呈現；依 [名片版本資料規格](docs/data/card-ownership-and-versioning.md)及 [resolver 契約](docs/contracts/card-resolvers.md)讀取正確版本，不能互相覆蓋圖片或裁切設定。
- [mycard.js](js/modules/mycard.js) 的圖片預設為橫式 `20:13`、直式 `400:600`、正方 `1:1`；已儲存的個別裁切／版型須保留。不要把推廣影片 `9:16` 套到靜態名片。
- 教學播放器使用 `object-fit:contain` 及高度限制；依原始影片比例顯示，不為填滿容器而裁掉字幕或操作按鈕。

## 修改後怎麼確認

- 以 `320px`、`390px`、`1280px` 寬度檢查受影響介面；這是目前瀏覽器驗證慣例，不是新增的 CSS 斷點或所有元件固定寬度。
- 檢查文字換行、卡片溢出、橫向分類、底部遮擋、圖片／頭貼、停用及錯誤狀態；流程修改還須驗證離開、返回、儲存／取消後仍找得到入口。
- 針對實際修改執行既有測試，依 [變更流程](docs/release/feature-change-protocol.md)完成驗證。合成資料的瀏覽器測試與手機 LINE 實收分開記錄。
- 使用者指定新尺寸、色彩或位置時，限定到該元件，更新來源與本文件；不藉此重設其他介面。
