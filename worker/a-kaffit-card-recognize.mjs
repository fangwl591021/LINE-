const FIELD_LIMITS = { displayName:120, englishName:120, companyName:180, jobTitle:120, department:120, mobile:40, companyPhone:40, email:320, websiteUrl:2048, lineUrl:2048, address:300, serviceDescription:1600, note:1000 };
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

export async function recognizeAkaffitBusinessCard(payload, env) {
  const apiKey = normalizeClientOpenAIKey(payload?.clientOpenAIKey) || String(env.OPENAI_API_KEY || '').trim();
  if (!apiKey) throw new Error('名片 AI 辨識服務尚未連線');
  const model = String(payload?.model || env.OPENAI_VISION_MODEL || env.OPENAI_MODEL || 'gpt-5.6-terra').trim();
  const content=[{type:'input_text',text:`辨識這張商務名片，並在同一次視覺辨識中完成名片定位。只擷取畫面中可確認的文字，不猜測；無法確認的欄位填空字串。若不是名片，isBusinessCard=false。繁體中文保留原文。note 僅放無法歸類但有價值的名片文字。

cardLocalization 規則：
1. detected 表示是否可找到名片本體。
2. boundingBox 使用整張輸入圖片的 0~1 正規化座標 x,y,width,height，必須包住實際可見名片，不得包入明顯桌面、手掌、鍵盤等背景。
3. corners 固定回傳左上、右上、右下、左下四點，均為 0~1 正規化座標。
4. 如果名片任一實際邊緣已超出照片、碰到影像邊界而無法確認，incomplete=true，並在 clippedEdges 列出 left/right/top/bottom；不得憑空補出不存在的邊。
5. cropConfidence 表示只根據原圖定位名片邊界的信心；不確定時降低分數，不可硬猜。

並依公司、職稱、部門與服務說明做一次行業分類：主行業只能選 1 個，次行業最多 2 個且不可與主行業相同。可選行業為：${INDUSTRY_OPTIONS.join('、')}。無法可靠判斷時 primaryIndustry 填「待分類」、secondaryIndustries 填空陣列；industryConfidence 填 0 到 1。只回傳符合 JSON Schema 的結果。`},imageInput(payload?.base64Image)];
  const result=await callAiResponses(apiKey,{model:model || 'gpt-5.6-terra',reasoning:{effort:'low'},max_output_tokens:2100,input:[{role:'user',content}],text:{format:{type:'json_schema',name:'business_card',strict:true,schema:OCR_SCHEMA}}});
  const parsedText=outputText(result);
  if(!parsedText)throw new Error('AI 未回傳名片辨識結果');
  const parsed=JSON.parse(parsedText);
  if(!parsed.cardLocalization)throw new Error('AI 未回傳名片定位結果');
  return parsed;
}
