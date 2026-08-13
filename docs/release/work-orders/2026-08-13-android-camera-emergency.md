# Android 名片拍照緊急修復

## 變更摘要

| 項目 | 內容 |
| --- | --- |
| 日期 | 2026-08-13 |
| 起始 commit | `61507e3` |
| 問題 | Android LINE WebView 對 JavaScript 代點隱藏 file input 的支援不穩定，可能把「拍照掃描」降級為一般上傳選擇器 |
| 目標 | 收藏名片與我的名片由使用者直接點擊原生後鏡頭 input；相簿上傳維持原流程 |

## 允許範圍

- 只修改兩個「拍照掃描」入口與相關前端契約。
- 拍攝完成後仍交給既有 `recognizeCard`／`recognizeMyCard` 裁切及 OCR 流程。
- 保留 `capture="environment"`，但不再用 JavaScript `.click()` 代點隱藏 input。

## 禁止範圍

- 不改 Worker、D1、Secret、LIFF 身分、名片歸屬或推薦關係。
- 不改 OCR、裁切、儲存、點數或相簿上傳邏輯。
- 不改其他相機用途與 QR 掃描。

## 根因與決策

歷史檢查顯示相機 input 自 2026-05-08 起一直保留 `capture="environment"`，但入口使用按鈕的 JavaScript `.click()` 代點 `display:none` input。Android LINE WebView 對這種合成點擊不穩定，可能降級為一般上傳選擇器。本次讓透明的原生 input 完整覆蓋拍照按鈕，使使用者手勢直接落在 input 上；不使用 `getUserMedia`，因此不新增 LINE 頁內相機權限流程。

## 驗證

- Android business-card camera focused contract。
- JavaScript syntax check。
- 完整 smoke contracts。
- `git diff --check`。

本次不需要 migration 或 Worker 部署；合併後只更新 GitHub Pages 前端。
