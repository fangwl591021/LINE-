# LINE- 介面設計基準

核對日期：2026-10-26。維護者：專案維護者。

本文件記錄目前實作與使用者已確認的呈現方式，供介面修改時按元件查閱。數值是現行基準，不授權重新設計其他頁面；使用者後續指定變更時，同步更新對應元件與本文件。功能資格、資料歸屬與交易規則仍由 [核心規則](docs/rules/core-invariants.md)及 [功能契約](docs/contracts/change-risk-map.json)管理。

## 先確認正在修改哪個介面

| 介面 | 樣式來源與範圍 | 現行基準 |
| --- | --- | --- |
| 一般首頁 | [home-reference-theme.css](css/home-reference-theme.css)、[home-discovery-20261110.css](css/home-discovery-20261110.css)：`body.home-page:not(.business-home-v2-active)` | 薄荷底、深色文字、綠色主操作；新版滿版，只影響一般首頁 |
| 選用 V2 首頁 | [index.html](index.html)：`.business-home-v2-*` | 深綠與金色；保留獨立啟用條件，不套用一般首頁覆寫 |
| 商城前台 | [store-shop.js](js/modules/store-shop.js)加入 `shop-lifestyle`、`shop-points-theme`；[store-shop.css](css/store-shop.css)後段主題覆寫 | 綠色頂部、淺色內容底、白色卡片；店家、商品及推薦卡各有版型 |
| 店家／管理介面 | [store-admin.css](css/store-admin.css)、各管理元件 CSS | 保留各自的藍灰文字、表格與工具列，不批次換成首頁主題 |
| 人脈島推廣／參觀頁 | [people-island-card.css](css/people-island-card.css)：`.pic-shell` | 乳白與淡綠、置中直式影片、明確建卡及分享入口 |
| 教學區 | [tutorial-center.css](css/tutorial-center.css)：`.tutorial-*` | 獨立對話框、橫向分類、內部捲動及影片區 |

改樣式前先確認 selector、目前頁面 class、載入順序及元件 CSS。`css/styles.css` 的全域背景不等於每頁最終背景；不要用未限定範圍的 `body`、`button`、`img` 覆寫所有頁面。

管理員店家列表的「置頂」勾選區至少44px高；儲存失敗顯示原因，結果未知提供重試。店家卡在手機保持可操作，不改公開資格。

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

經銷商 CRM 在桌面將會員點數放左欄，基本資料放右欄。點數明細位於點數操作下方，每次開啟 CRM 時收合；窄螢幕依點數、基本資料順序顯示。頁首先顯示最近聯絡結果、負責人與下次跟進，管理員可直接追加紀錄。四個橫向分區為會員總覽、跟進紀錄、組織與業績、審核與系統。五大標籤收合於內容最下方、儲存列上方。

## 間距、卡片與操作元件

| 元件 | 現行數值與行為 |
| --- | --- |
| 一般首頁主要捷徑 | 容器圓角 `18px`、格距 `6px`；單格圓角 `12px`、最小高 `76px`、內距 `10px 2px`、圖示 `32px` |
| 商城一般內容頁基礎主題容器 | 最大寬 `none`；內距 `20px max(12px,env(safe-area-inset-left)) calc(105px + env(safe-area-inset-bottom))`；`760px` 起左右內距 `24px`；新版目錄／工作台另依下方滿版規則 |
| 商城店家／商品卡 | `.shop-discovery-grid` 店家卡兩欄、格距 `12px`、圓角 `19px`；`.shop-browse-products` 商品卡兩欄、格距 `10px`、圓角 `17px`；`700px` 起這兩類列表可為三欄，店家列表 `350px` 以下格距改 `8px` |
| 商城首頁推薦卡 | `.points-recommended` 三欄、格距 `9px`、卡片圓角 `15px`；`760px` 起格距 `18px`，不沿用商品卡的兩欄規則 |
| 商城操作元件 | `.shop-points-theme .shop-bar button` 最小高 `44px`；`.points-wallet-refresh` 為 `36px`。基礎按鈕的圓角 `12px`、內距 `10px 14px` 與輸入框 `44px` 最小高只在未被特定元件覆寫時沿用，不能當成所有商城按鈕規格 |
| 人脈島推廣頁 | 最大寬 `1080px`；內距 `20px 18px`，`760px` 起改為 `30px`；按鈕最小高 `46px`、圓角 `14px` |
| 人脈島建卡入口 | 兩欄等寬、格距 `10px`、最大寬 `440px`；左「上傳名片」，右「用 LINE 生成／需填寫個資」；手機維持左右排列，分享放獨立一列 |
| 教學對話框 | 寬 `calc(100% - 24px)`、最大寬 `620px`、圓角 `22px`；標頭不隨內容捲走，內容區自行捲動 |
| 教學分類 | 依「會員與名片、店家與點數、活動與課程、AI任務」橫向排列；`nowrap`，窄螢幕允許橫向捲動，不能退成直向長清單 |

以上高度與間距只描述對應元件，不建立全站統一數值。保留 `:focus-visible`、停用狀態、`[hidden]` 及安全區內距；不要讓固定底部導覽或返回按鈕遮住最後一個操作。

商城共用後台商品編輯器：名稱與分類為短欄，桌面媒體與介紹採2:3兩欄，介紹填滿媒體區高度且至少320px，可垂直拉伸；760px以下介紹在前、媒體在後，介紹至少240px。圖片維持contain及原預覽比例/尺寸上限，店家資料表單不套此分組；不改欄位值、3000字上限、審核與儲存流程。

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

## 2026-11-10 會員首頁
首頁依序呈現品牌與會員資料、公告、探索好店橫幅及分類、快捷入口、教學、AI 服務、精選功能與近期活動；既有搜尋與待辦仍可向下查看。窄螢幕分類與快捷列可橫向捲動，底部保留首頁、店家、點數 QR／掃碼、點數紀錄及我的；僅作用於會員首頁，其他頁面沿用原有導覽。

會員首頁品牌標頭不顯示「店家專區」按鈕；其他既有店家及商城入口沿用原有權限與操作。

首頁快捷列依使用者要求排列「收藏名片、我的名片、人脈島、交流專區、收件夾、個人行事曆、星座運勢、加LINE好友」，人脈島與交流專區緊鄰我的名片；保留交流入口原有顯示資格判斷與hidden標記，不因排序強制顯示。選用V2及其他頁面排序不變。

## 2026-11-10 探索好店與店家工作台

依使用者提供兩張商城參考圖，探索目錄採綠色橫幅、奶油購物金列、三個快捷、橫向分類/篩選、手機白色兩欄店家卡（700px以上三欄）及圓弧固定底部；店家工作台採淺薄荷圓頂、金色方案標籤、本人店面卡、粉/藍贈扣大操作及二/三/二工具分組。新樣式僅限定商城目錄或merchant-workbench，不影響商品編輯、後台或交易確認。

版型中的金額、店名、圖片與方案取現有資料；統計用商品數及本月成功商品QR折抵筆數/點數，不以示意會員數或導客數代替真資料。沒有到期日期或折抵比例時不填示意值。保留原贈點/折抵角色及明確交易確認。

商城標頭保留返回、品牌與切換各自的觸控區；工具列僅在店家模式顯示，店家角色切到探索目錄也必須隱藏。359px以下店家標頭將品牌另排一列，避免與返回或工具重疊。

## 2026-11-10 新版滿版

依使用者手機截圖要求，會員首頁、探索好店與店家工作台的背景及主要區塊左右滿版，不保留520/1120px外框封頂；移除首頁main的12px、區塊的10px側距與hidden sibling造成的24px頂部空白。品牌、會員列、橫幅、分類與快捷外框到webview內容區邊緣。文字／按鈕內距、格間距、圖片既有比例與必要safe-area仍保留；底導覽覆蓋保護不變。僅新版呈現範圍，選用V2、舊頁面、彈窗及交易表單保留原版型。
