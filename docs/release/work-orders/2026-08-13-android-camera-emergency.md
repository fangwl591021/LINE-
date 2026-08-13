# Android 名片拍照緊急修復

## 變更摘要

| 項目 | 內容 |
| --- | --- |
| 日期 | 2026-08-13 |
| 起始 commit | `61507e3` |
| 問題 | Android LINE WebView 忽略 file input 的 `capture="environment"`，點「拍照掃描」仍出現一般上傳選擇器 |
| 目標 | 收藏名片與我的名片改用頁內後鏡頭；相簿上傳維持原流程 |

## 允許範圍

- 只修改兩個「拍照掃描」入口、頁內相機 UI 與相關前端契約。
- 拍攝完成後仍交給既有 `recognizeCard`／`recognizeMyCard` 裁切及 OCR 流程。
- Android 相機權限失敗時提供安全提示，不自動跳到一般檔案上傳。

## 禁止範圍

- 不改 Worker、D1、Secret、LIFF 身分、名片歸屬或推薦關係。
- 不改 OCR、裁切、儲存、點數或相簿上傳邏輯。
- 不改其他相機用途與 QR 掃描。

## 根因與決策

先前嘗試仍依賴 HTML `capture` 屬性；該屬性只是瀏覽器提示，Android LINE WebView 可忽略，因此無法保證直接開相機。本次使用 `navigator.mediaDevices.getUserMedia` 開啟後鏡頭預覽，拍攝為 JPEG Blob 後傳入既有裁切器，明確分離相機與相簿。

## 驗證

- Android business-card camera focused contract。
- JavaScript syntax check。
- 完整 smoke contracts。
- `git diff --check`。

本次不需要 migration 或 Worker 部署；合併後只更新 GitHub Pages 前端。
