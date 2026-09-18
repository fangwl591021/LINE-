# 首頁置頂與間距緊縮

- 日期：2026-09-18；使用者要求首頁上方與區塊間空白縮小，完成後部署。
- 起始／回復commit：25ecac1ced2291f065095a11c658e3c64d99f476；main；起始工作目錄乾淨。
- 僅允許修改：首頁theme CSS、index樣式版本、首頁視覺回歸測試、本機無資料preview與本工單。
- 禁止修改：字體／icon大小、點數與簽到規則、按鈕動作、登入、其他共用頁面、商城／消費日誌、Worker、D1、secrets。
- 已讀：core-invariants、button-actions、regression-matrix、feature-change-protocol、現有home-reference-theme與compact-home-top-gap測試。
- 修改前：node tools/run-change-guard.js before PASS。
- 正式390px量測：會員橫條距頁頂36px（main padding12 + sibling margin24）；空白inline控制項產生24px行框，造成橫條與快捷區間距34px。
- 修正策略：只限home-page且排除business-home-v2。取消首頁上padding與banner外margin；banner使用column flex排版消除空白inline行框，不刪控制項或handler。快捷區外距6px，內距6px、格距6px；保留文字、圖示與觸控尺寸。下方段落間距調為8px。
- 預計發布：只提交並部署GitHub Pages；Worker與資料庫不需重新部署。
- 修改後：node tools/run-change-guard.js after PASS；home-reference-theme 9/9與compact-home-top-gap契約PASS；git diff --check通過。
- 實際HTML/CSS本機預覽（不執行LIFF、API或操作handler）：390px、320px及桌機均量測會員橫條距頂0px、下方快捷區間距6px、橫幅間距8px；無水平溢出或上方文字裁切；窄螢幕快捷按鈕最小高度80px。390px截圖確認版面。真機LINE本次未直接操作。
- 快取版本：home-reference-theme.css v1 → v2；其餘CSS/JS版本與功能不變。
