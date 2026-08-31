const FIELD_LIMITS = { displayName:120, englishName:120, companyName:180, jobTitle:120, department:120, mobile:40, companyPhone:40, email:320, websiteUrl:2048, lineId:80, lineUrl:2048, instagramId:120, socialAccounts:1000, address:300, serviceDescription:1600, profileDescription:600, note:1000 };
export const INDUSTRY_OPTIONS = [
  '健康醫療','美容美業','餐飲食品','零售電商','直銷／社群電商',
  '金融保險','房地產居家','工商專業服務','教育培訓','科技資訊',
  '行銷設計媒體','製造批發貿易','旅遊交通服務','社團協會公益','其他行業',
];
const INDUSTRY_PENDING = '待分類';

const CARD_POINT_SCHEMA={type:'object',additionalProperties:false,required:['x','y'],properties:{x:{type:'number',minimum:0,maximum:1},y:{type:'number',minimum:0,maximum:1}}};
const CARD_BOX_SCHEMA={type:'object',additionalProperties:false,required:['x','y','width','height'],properties:{x:{type:'number',minimum:0,maximum:1},y:{type:'number',minimum:0,maximum:1},width:{type:'number',minimum:0,maximum:1},height:{type:'number',minimum:0,maximum:1}}};
const CARD_LOCALIZATION_SCHEMA={type:'object',additionalProperties:false,required:['detected','incomplete','cropConfidence','boundingBox','corners','clippedEdges'],properties:{detected:{type:'boolean'},incomplete:{type:'boolean'},cropConfidence:{type:'number',minimum:0,maximum:1},boundingBox:CARD_BOX_SCHEMA,corners:{type:'array',minItems:4,maxItems:4,items:CARD_POINT_SCHEMA},clippedEdges:{type:'array',maxItems:4,items:{type:'string',enum:['left','right','top','bottom']}}}};
const OCR_SCHEMA = { type:'object', additionalProperties:false, required:['isBusinessCard','confidence','language','cardLocalization','primaryIndustry','secondaryIndustries','industryConfidence',...Object.keys(FIELD_LIMITS)], properties:{ isBusinessCard:{type:'boolean'}, confidence:{type:'number'}, language:{type:'string'}, cardLocalization:CARD_LOCALIZATION_SCHEMA, primaryIndustry:{type:'string',enum:[INDUSTRY_PENDING,...INDUSTRY_OPTIONS]}, secondaryIndustries:{type:'array',maxItems:2,items:{type:'string',enum:INDUSTRY_OPTIONS}}, industryConfidence:{type:'number'}, ...Object.fromEntries(Object.keys(FIELD_LIMITS).map((key)=>[key,{type:'string'}])) } };

const RECOGNITION_PROMPT = `辨識這張商務名片，並在同一次視覺辨識中完成名片定位。除 profileDescription 外，只擷取畫面中可確認的文字，不猜測；無法確認的欄位填空字串。若不是名片，isBusinessCard=false。繁體中文保留原文。note 僅放無法歸類但有價值的名片文字。

cardLocalization 規則：
1. detected 表示是否可找到名片本體。
2. boundingBox 使用整張輸入圖片的 0~1 正規化座標 x,y,width,height，必須包住實際可見名片，不得包入明顯桌面、手掌、鍵盤等背景。
3. corners 固定回傳左上、右上、右下、左下四點，均為 0~1 正規化座標。
4. 如果名片任一實際邊緣已超出照片、碰到影像邊界而無法確認，incomplete=true，並在 clippedEdges 列出 left/right/top/bottom；不得憑空補出不存在的邊。
5. cropConfidence 表示只根據原圖定位名片邊界的信心；不確定時降低分數，不可硬猜。

社群聯絡規則：
1. 名片印有 LINE ID 時，lineId 填原始 ID（保留開頭 @）；個人 ID 的 lineUrl 轉成 https://line.me/ti/p/~{LINE_ID}，以 @ 開頭的官方帳號轉成 https://line.me/R/ti/p/{百分比編碼的LINE_ID}。
2. 名片已印出 line.me 或 lin.ee 網址時，lineUrl 優先保留該網址。
3. instagramId 填名片印出的 Instagram 帳號；socialAccounts 彙整 LINE、Instagram、Facebook 等可確認的社群資料。
4. 不得猜測或自行解讀 QR Code 內容；QR Code 由裝置端解碼後另行優先套用。

名片說明規則：
1. serviceDescription 只保留名片上實際印出的服務、產品或業務文字。
2. profileDescription 使用已確認的姓名、公司、部門、職稱及 serviceDescription，撰寫 1 到 2 句自然、專業的繁體中文介紹，建議 30 到 120 個中文字；即使名片沒有服務說明也不可留白。
3. 可描述任職單位、職務與名片明列的服務，並提示可透過名片聯絡方式洽詢；不得編造專長、服務項目、成就、客戶、優惠或無法由名片確認的職責。

並依公司、職稱、部門與服務說明做一次行業分類：主行業只能選 1 個，次行業最多 2 個且不可與主行業相同。可選行業為：${INDUSTRY_OPTIONS.join('、')}。無法可靠判斷時 primaryIndustry 填「待分類」、secondaryIndustries 填空陣列；industryConfidence 填 0 到 1。只回傳符合 JSON Schema 的結果。`;

function normalizeClientOpenAIKey(key) {
  const value = String(key || '').trim();
  if (!value || !/^sk-[A-Za-z0-9_\-]+/.test(value)) return '';
  return value;
}

function outputText(result = {}) {
  return result.output_text || result.output?.flatMap((item)=>item.content || []).find((item)=>item.type === 'output_text')?.text || '';
}

function imageInput(base64Image) {
  const imageUrl = String(base64Image || '').trim();
  if (!/^data:image\/(jpeg|png|webp);base64,/i.test(imageUrl)) throw new Error('名片圖片格式不正確');
  return {type:'input_image',image_url:imageUrl,detail:'high'};
}

function imageData(base64Image) {
  const imageUrl = String(base64Image || '').trim();
  const match = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=\s]+)$/i.exec(imageUrl);
  if (!match) throw new Error('名片圖片格式不正確');
  return { mimeType:`image/${match[1].toLowerCase()}`, data:match[2].replace(/\s/g, '') };
}

function geminiSchema(value) {
  if (Array.isArray(value)) return value.map(geminiSchema);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key])=>key !== 'additionalProperties')
    .map(([key, child])=>[key, geminiSchema(child)]));
}

function geminiOutputText(result = {}) {
  return result.candidates?.[0]?.content?.parts?.map((part)=>part?.text || '').join('').trim() || '';
}

function cleanSocialId(value, labelPattern) {
  return String(value || '').trim().replace(labelPattern, '').trim().replace(/^['"`]|['"`]$/g, '');
}

export function normalizeLineContactUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    if (!['line.me','lin.ee'].includes(host)) return '';
    url.protocol = 'https:';
    url.username = '';
    url.password = '';
    return url.toString();
  } catch {
    return '';
  }
}

export function lineUrlFromId(value) {
  const lineId = cleanSocialId(value, /^(?:line\s*(?:id)?|賴)\s*[:：]?\s*/i);
  if (!/^@?[A-Za-z0-9._-]{4,80}$/.test(lineId)) return '';
  return lineId.startsWith('@')
    ? `https://line.me/R/ti/p/${encodeURIComponent(lineId)}`
    : `https://line.me/ti/p/~${encodeURIComponent(lineId)}`;
}

function instagramUrlFromId(value) {
  const raw = cleanSocialId(value, /^(?:instagram|insta|ig)\s*[:：]?\s*/i);
  if (!raw) return '';
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    if (url.hostname.toLowerCase().replace(/^www\./, '') === 'instagram.com') {
      url.protocol = 'https:';
      return url.toString();
    }
  } catch {}
  const handle = raw.replace(/^@/, '').replace(/\s+/g, '');
  return /^[A-Za-z0-9._]{1,80}$/.test(handle) ? `https://www.instagram.com/${encodeURIComponent(handle)}` : '';
}

export function enrichSocialContacts(parsed) {
  const rawLineId = cleanSocialId(parsed?.lineId, /^(?:line\s*(?:id)?|賴)\s*[:：]?\s*/i);
  const lineId = /^@?[A-Za-z0-9._-]{4,80}$/.test(rawLineId) ? rawLineId : '';
  const lineUrl = normalizeLineContactUrl(parsed?.lineUrl) || lineUrlFromId(lineId || parsed?.lineUrl);
  const instagramId = cleanSocialId(parsed?.instagramId, /^(?:instagram|insta|ig)\s*[:：]?\s*/i).replace(/^@/, '');
  const instagramUrl = instagramUrlFromId(instagramId);
  const otherAccounts = String(parsed?.socialAccounts || '')
    .split(/\s*[｜|;；\n]\s*/)
    .map((item)=>item.trim())
    .filter((item)=>item && !/^(?:line\s*(?:id)?|instagram|insta|ig)\s*[:：]/i.test(item));
  const socialAccounts = [
    lineUrl ? `LINE: ${lineUrl}` : '',
    instagramUrl ? `Instagram: ${instagramUrl}` : '',
    ...otherAccounts,
  ].filter(Boolean).filter((item,index,all)=>all.findIndex((candidate)=>candidate.toLowerCase()===item.toLowerCase())===index).join('｜');
  return { ...parsed, lineId, lineUrl, instagramId, socialAccounts };
}

function cleanProfilePart(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().replace(/[。；;，,]+$/g, '');
}

export function buildProfileDescription(parsed = {}) {
  const generated = cleanProfilePart(parsed.profileDescription);
  if (generated) return `${generated}。`.replace(/。。+$/g, '。').slice(0, FIELD_LIMITS.profileDescription);

  const name = cleanProfilePart(parsed.displayName);
  const company = cleanProfilePart(parsed.companyName);
  const position = [cleanProfilePart(parsed.department), cleanProfilePart(parsed.jobTitle)].filter(Boolean).join(' ');
  const services = cleanProfilePart(parsed.serviceDescription);
  let first = name || '此名片聯絡人';
  if (company) first += `任職於${company}`;
  if (position) first += company ? `，職務為${position}` : `的職務為${position}`;
  if (services) first += `，名片列有${services}`;
  return `${first}。歡迎透過名片所列聯絡方式洽詢。`.slice(0, FIELD_LIMITS.profileDescription);
}

async function callAiResponses(apiKey, body) {
  if (!apiKey) throw new Error('名片 AI 辨識服務尚未連線');
  const controller = new AbortController();
  const timer = setTimeout(()=>controller.abort(),70000);
  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method:'POST',
      headers:{authorization:`Bearer ${apiKey}`,'content-type':'application/json'},
      body:JSON.stringify(body),
      signal:controller.signal,
    });
    const result = await response.json().catch(()=>({}));
    if (!response.ok) throw new Error(result?.error?.message || result?.error || 'AI 服務暫時無法使用');
    return result;
  } finally {
    clearTimeout(timer);
  }
}

async function callGeminiVision(apiKey, model, base64Image) {
  if (!apiKey) throw new Error('名片 AI 辨識服務尚未連線');
  const image = imageData(base64Image);
  const controller = new AbortController();
  const timer = setTimeout(()=>controller.abort(),70000);
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method:'POST',
      headers:{'x-goog-api-key':apiKey,'content-type':'application/json'},
      body:JSON.stringify({
        contents:[{role:'user',parts:[{text:RECOGNITION_PROMPT},{inline_data:{mime_type:image.mimeType,data:image.data}}]}],
        generationConfig:{temperature:0,responseMimeType:'application/json',responseSchema:geminiSchema(OCR_SCHEMA)},
      }),
      signal:controller.signal,
    });
    const result = await response.json().catch(()=>({}));
    if (!response.ok) throw new Error(result?.error?.message || 'Gemini 服務暫時無法使用');
    const parsedText = geminiOutputText(result);
    if (!parsedText) throw new Error('Gemini 未回傳名片辨識結果');
    return JSON.parse(parsedText);
  } finally {
    clearTimeout(timer);
  }
}

function validateRecognition(parsed) {
  if (!parsed || typeof parsed !== 'object') throw new Error('AI 未回傳名片辨識結果');
  if (!parsed.cardLocalization) throw new Error('AI 未回傳名片定位結果');
  const enriched = enrichSocialContacts(parsed);
  return { ...enriched, profileDescription:buildProfileDescription(enriched) };
}

export async function recognizeAkaffitBusinessCard(payload, env) {
  const apiKey = normalizeClientOpenAIKey(payload?.clientOpenAIKey) || String(env.OPENAI_API_KEY || '').trim();
  const geminiApiKey = String(env.GEMINI_API_KEY || '').trim();
  if (!apiKey && !geminiApiKey) throw new Error('名片 AI 辨識服務尚未連線');
  const model = String(payload?.model || env.OPENAI_VISION_MODEL || env.OPENAI_MODEL || 'gpt-5.6-terra').trim();
  if (apiKey) {
    try {
      const content=[{type:'input_text',text:RECOGNITION_PROMPT},imageInput(payload?.base64Image)];
      const result=await callAiResponses(apiKey,{model:model || 'gpt-5.6-terra',reasoning:{effort:'low'},max_output_tokens:2100,input:[{role:'user',content}],text:{format:{type:'json_schema',name:'business_card',strict:true,schema:OCR_SCHEMA}}});
      const parsedText=outputText(result);
      if(!parsedText)throw new Error('AI 未回傳名片辨識結果');
      return validateRecognition(JSON.parse(parsedText));
    } catch (error) {
      if (!geminiApiKey) throw error;
      console.warn('A-kaffit OpenAI unavailable; switching to Gemini');
    }
  }
  const geminiModel = String(env.GEMINI_VISION_MODEL || env.GEMINI_MODEL || 'gemini-3.7-flash').trim();
  return validateRecognition(await callGeminiVision(geminiApiKey, geminiModel, payload?.base64Image));
}
