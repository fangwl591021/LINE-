# Android 名片拍照緊急修復

## 變更摘要

| 項目 | 內容 |
| --- | --- |
| 日期 | 2026-08-13 |
| 起始 commit | `61507e3` |
| 問題 | 點數 LIFF Endpoint 先進入 `point-bridge.html`，再跳到 GitHub Pages 原始網址；Android 落入 LINE 內建瀏覽器而非主 LIFF 執行環境 |
| 目標 | 主系統直接成為既有點數 LIFF 的 Endpoint，好友檢查留在主系統，恢復原生名片相機流程 |

## 允許範圍

- 撤回無法在 Android LINE 內建瀏覽器取得權限的黑色 `getUserMedia` 相機。
- 兩個「拍照掃描」入口恢復直接原生 `capture="environment"` input。
- 拍攝完成後仍交給既有 `recognizeCard`／`recognizeMyCard` 裁切及 OCR 流程。
- 將 `point-bridge.html` 的好友檢查能力搬到主系統初始化，僅以 `liff.isInClient()` 判定真正 LIFF。
- 程式先部署；LINE Developers Endpoint 完成切換前不修改 bridge 導向，避免循環。

## 禁止範圍

- 不改 Worker、D1、Secret、LIFF 身分、名片歸屬或推薦關係。
- 不改 OCR、裁切、儲存、點數或相簿上傳邏輯。
- 不改其他相機用途與 QR 掃描。

## 根因與決策

Git 歷史顯示，2026-05-12 的 `6dd2221` 將 `point-bridge.html` 完成好友檢查後的目標，從主系統 LIFF URL 改為 GitHub Pages 原始網址。相機 input 本身仍持續保有 `capture="environment"`。Android 截圖顯示頁面帶有 LINE 內建瀏覽器工具列，且原始網址下的 `getUserMedia` 被拒絕，因此根因是入口容器改變，而不是 OCR 或相機 input 被刪除。本次保留既有 LIFF ID `1660923784-vViMTZ1y`，先讓主頁具備完整好友檢查，再將 LINE Developers Endpoint 從 `/point-bridge.html` 切至 `/LINE-/`。

## 驗證

- Native LIFF business-card camera contract。
- Main LIFF endpoint cutover contract。
- JavaScript syntax check。
- 完整 smoke contracts。
- `git diff --check`。

本次不需要 migration 或 Worker 部署；GitHub Pages 部署完成後，需在 LINE Developers 將 LIFF `1660923784-vViMTZ1y` 的 Endpoint URL 改為 `https://fangwl591021.github.io/LINE-/`。
