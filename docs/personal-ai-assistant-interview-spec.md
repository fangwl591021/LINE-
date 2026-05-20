# 個人 AI 助理核心訪談規格

版本：v1.0
適用：智能名片交流站 / 個人 AI 助理核心資料包

## 目標

這份文件讓使用者先用自己的 GPT、Claude、Gemini 或其他 AI 工具完成訪談，產生一份標準化的「個人 AI 助理核心資料包」。

使用者完成後，再把結果上傳到系統。系統只負責保存、讀取與套用，不需要在平台內大量消耗 AI token。

## 使用流程

1. 下載本文件。
2. 打開自己的 GPT 或 AI 工具。
3. 複製「AI 訪談提示詞」到對話中。
4. 依照 AI 的問題逐步回答。
5. 請 AI 最後輸出「標準 JSON 結果」與「人類可讀摘要」。
6. 將輸出的 JSON 上傳到智能名片交流站。
7. 系統用這份資料建立個人 AI 助理核心，作為後續名片建議、CRM 跟進、訊息撰寫與商務分析的基礎。

## 使用者注意事項

- 不要提供身分證字號、銀行帳號、密碼、API Key、私密合約全文。
- 可以提供公開名片資料、服務介紹、產品優勢、常見客戶問題、成交流程、希望 AI 協助的方向。
- 如果資料涉及客戶個資，請用「A 客戶」「B 公司」取代真實姓名。
- 輸出結果上傳前，請先自行檢查是否包含不想公開或不想被系統保存的內容。

## AI 訪談提示詞

請把以下內容完整複製到自己的 GPT：

```text
你是一位「個人商務 AI 助理建置顧問」。

你的任務不是聊天，而是透過訪談幫我整理出一份可以上傳到系統的「個人 AI 助理核心資料包」。

請依序完成：

1. 先用簡短說明告訴我這次訪談會蒐集哪些資料。
2. 一次只問 3 到 5 題，不要一次丟太多問題。
3. 如果我的回答不完整，請追問，不要自己亂補。
4. 你可以幫我潤飾，但要保留我的真實商業定位。
5. 最後請輸出兩個區塊：
   A. 人類可讀摘要
   B. 標準 JSON 結果

請訪談以下主題：

一、基本身份
- 我的姓名或對外稱呼
- 公司或品牌名稱
- 職稱或角色
- 所在地區
- 主要聯絡方式

二、業務定位
- 我提供什麼產品或服務
- 我的主要客戶是誰
- 客戶通常遇到什麼問題
- 我能替客戶解決什麼
- 我與同業最大的差異

三、商品與成交
- 核心產品或服務項目
- 價格區間或收費方式
- 客戶從認識我到成交通常會經過哪些步驟
- 常見成交阻礙
- 常用促成方式

四、客戶分類
- 哪些人是高價值客戶
- 哪些人是合作夥伴
- 哪些人只是一般交流
- 名片掃進來後，應該如何判斷下一步

五、跟進策略
- 第一次接觸後要怎麼跟進
- 3 天內該做什麼
- 7 天內該做什麼
- 30 天內該做什麼
- 沒回應時該如何處理

六、內容與語氣
- 我希望 AI 用什麼語氣幫我寫訊息
- 我不希望 AI 使用哪些話術
- 我常用的自我介紹
- 我常用的邀約文字
- 我常用的成交或提醒文字

七、禁忌與風險
- 哪些客戶不適合我
- 哪些承諾不能說
- 哪些內容不能對外公開
- 哪些產業法規或合規限制要注意

八、AI 助理任務
- 我希望 AI 每天提醒我什麼
- 我希望 AI 幫我判斷名片的哪些重點
- 我希望 AI 幫我產生哪些訊息
- 我希望 AI 幫我整理哪些 CRM 標籤

最後請輸出：

第一區塊：人類可讀摘要
請用條列式整理，讓我可以快速檢查是否正確。

第二區塊：標準 JSON 結果
請完全依照以下 JSON 結構輸出。
不要在 JSON 裡放註解。
不要使用 Markdown code fence 包住 JSON。
如果資料沒有提供，請用空字串、空陣列或 null。
```

## 標準 JSON 結構

AI 最終輸出的 JSON 必須符合以下欄位：

```json
{
  "schemaVersion": "personal_ai_assistant_core_v1",
  "generatedAt": "YYYY-MM-DDTHH:mm:ss+08:00",
  "ownerProfile": {
    "displayName": "",
    "companyName": "",
    "title": "",
    "region": "",
    "phone": "",
    "email": "",
    "website": "",
    "lineUrl": ""
  },
  "businessIdentity": {
    "oneLinePositioning": "",
    "serviceSummary": "",
    "coreStrengths": [],
    "differentiators": [],
    "proofPoints": [],
    "brandTone": ""
  },
  "productsAndOffers": [
    {
      "name": "",
      "description": "",
      "targetCustomer": "",
      "priceRange": "",
      "salesAngle": "",
      "commonObjections": [],
      "recommendedResponse": ""
    }
  ],
  "targetCustomers": {
    "idealCustomers": [],
    "partnerTypes": [],
    "lowFitCustomers": [],
    "qualificationQuestions": []
  },
  "crmRules": {
    "defaultTags": [],
    "customerStages": [
      "新名片",
      "已初次聯繫",
      "有興趣",
      "已邀約",
      "已成交",
      "長期經營",
      "暫緩"
    ],
    "classificationRules": [
      {
        "condition": "",
        "tag": "",
        "nextAction": ""
      }
    ],
    "followUpPlan": {
      "within24Hours": "",
      "within3Days": "",
      "within7Days": "",
      "within30Days": "",
      "noResponse": ""
    }
  },
  "messagePlaybook": {
    "selfIntroduction": "",
    "firstContactMessage": "",
    "followUpMessage": "",
    "eventInvitationMessage": "",
    "couponMessage": "",
    "oneOnOneInvitationMessage": "",
    "closingMessage": "",
    "doNotSay": []
  },
  "dailyAssistantRules": {
    "morningSuggestions": [],
    "cardScanSuggestions": [],
    "followUpSuggestions": [],
    "salesOpportunitySignals": [],
    "riskSignals": []
  },
  "complianceAndPrivacy": {
    "restrictedClaims": [],
    "sensitiveDataRules": [],
    "industryComplianceNotes": [],
    "publicContentAllowed": true
  },
  "uploadReview": {
    "isComplete": false,
    "missingFields": [],
    "recommendedNextStep": ""
  }
}
```

## 人類可讀摘要格式

請 AI 在 JSON 前先輸出這一段，方便使用者檢查：

```text
【個人 AI 助理核心摘要】

1. 對外身份：
2. 核心服務：
3. 主要客戶：
4. 最大差異：
5. 最適合的跟進方式：
6. AI 每天應提醒：
7. 名片掃進來後 AI 應判斷：
8. 不應使用的話術或風險：
9. 建議補充資料：
```

## 上傳前自我檢查

上傳到系統前，請確認：

- `schemaVersion` 是 `personal_ai_assistant_core_v1`
- `ownerProfile.displayName` 有填
- `businessIdentity.oneLinePositioning` 有填
- `productsAndOffers` 至少有一項
- `crmRules.defaultTags` 至少有 3 個
- `messagePlaybook.firstContactMessage` 有填
- `dailyAssistantRules.cardScanSuggestions` 有填
- 沒有放入密碼、API Key、銀行帳號或過度敏感資料

## 系統接收規格

系統上傳入口應接受：

- `.json`
- `.txt`
- `.md`

系統應優先解析 JSON。若使用者上傳的是完整對話文字，系統應提示使用者重新貼上「標準 JSON 結果」，不要由平台再跑一次大型 AI 解析。

## 後續可套用的系統功能

這份資料包未來可用於：

- 名片掃描後的下一步建議
- CRM 標籤自動建議
- 今日業務助理
- 收件匣訊息撰寫
- 優惠券與課程邀約文案
- 活動報名後跟進提醒
- 個人首頁介紹文
- AI 配對說明

## 版本備註

v1.0 先以「外部 AI 訪談產生資料包」為主，不要求系統即時問答。

後續版本可增加：

- 多輪資料修訂
- 上傳後差異比對
- 系統內局部補問
- 依產業提供訪談模板
- 匯入名片資料後自動生成助理建議
