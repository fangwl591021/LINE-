# Android 名片拍照緊急修復

## 變更摘要

| 項目 | 內容 |
| --- | --- |
| 日期 | 2026-08-13 |
| 起始 commit | `61507e3` |
| 問題 | Android LINE WebView 對 JavaScript 代點隱藏 file input 的支援不穩定，可能把「拍照掃描」降級為一般上傳選擇器 |
| 目標 | Android LINE LIFF 使用頁內後鏡頭；iOS 與外部瀏覽器保留原生 input；相簿上傳維持原流程 |

## 允許範圍

- 只修改兩個「拍照掃描」入口與相關前端契約。
- 拍攝完成後仍交給既有 `recognizeCard`／`recognizeMyCard` 裁切及 OCR 流程。
- Android LINE LIFF 以 `getUserMedia` 開啟頁內後鏡頭，首次僅需接受一次系統授權提示。
- iOS 與外部瀏覽器保留 `capture="environment"` 原生流程。
- 權限拒絕時只提供重新開啟或改用相簿，不要求用戶自行進入 Android 設定。

## 禁止範圍

- 不改 Worker、D1、Secret、LIFF 身分、名片歸屬或推薦關係。
- 不改 OCR、裁切、儲存、點數或相簿上傳邏輯。
- 不改其他相機用途與 QR 掃描。

## 根因與決策

歷史檢查顯示相機 input 自 2026-05-08 起一直保留 `capture="environment"`，但 Android LINE WebView 仍可能把它降級為一般上傳選擇器；直接覆蓋原生 input 也無法改變宿主 WebView 的決策。本次採平台分流：僅 Android 且確認位於 LINE 用戶端時使用 `getUserMedia`，其他平台沿用原生 input。Android 首次由系統顯示一次授權提示，之後直接開啟；拒絕時在原畫面提供重新開啟與相簿備援。

## 驗證

- Android business-card camera focused contract。
- JavaScript syntax check。
- 完整 smoke contracts。
- `git diff --check`。

本次不需要 migration 或 Worker 部署；合併後只更新 GitHub Pages 前端。
