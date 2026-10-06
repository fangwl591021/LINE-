// Member event DM only: no changes to business-card or official activity models.
import {ACTIVITY_DM_PROMPT,normalizeActivityDraft} from './activity-dm-ai.mjs';

export const MEMBER_EVENT_DM_MODEL='gpt-5.6-sol';
const string=(maxLength,description)=>({type:'string',maxLength,...(description?{description}:{})});
const price={type:['integer','null'],minimum:0,maximum:Number.MAX_SAFE_INTEGER,description:'明示單一新台幣費用；只有明示免費才填0，不明或多票價為null。'};
const object=properties=>({type:'object',additionalProperties:false,properties,required:Object.keys(properties)});
export const MEMBER_EVENT_DM_SCHEMA=Object.freeze(object({
  activityName:string(120,'主活動名稱，不能用主辦品牌或廣告標語取代。'),
  scheduleText:string(600,'原圖所有活動日期/時間原文，不是截止日或議程時間。'),
  timeStatus:{type:'string',enum:['single','multiple','unclear']},
  startTime:string(40,'單場日期與開始時間完整才填 YYYY-MM-DDTHH:mm；未標年份用伺服器提供的台灣當年，多場或缺日/時分時留空。'),
  endTime:string(40,'單場明示結束時間 YYYY-MM-DDTHH:mm；不可推算，否則留空。'),
  location:string(300,'實際活動場地、完整地址、樓層室號；不是主辦聯絡地址。'),
  description:string(9000,'忠實擷取內容、講者、議程、條件與注意事項，保留換行，不創作文案。'),
  activityType:string(40),
  price,
  batches:{type:'array',maxItems:24,items:object({name:string(120),scheduleText:string(300),startTime:string(40),endTime:string(40),price})},
  confidenceNote:string(600,'逐項提醒模糊、缺漏、時間或票价歧義，不能自行補值。'),
  rawOcrText:string(3000,'實際可讀原文供核對，四核心資料優先；不憑空補字。長DM保留重點原文並在confidenceNote註明未收錄全部。'),
}));

// Member-only exception: the user explicitly authorized a current-year default. Do not change the shared official DM prompt.
const instructions=ACTIVITY_DM_PROMPT.replace('缺少年份、日期或開始時間時不能補今年、00:00 或猜測；','缺少日期或開始時間時不能補日期、00:00 或猜測；')+'\n依提供的嚴格 JSON schema 輸出全部欄位（包含 rawOcrText），無資料時依欄位型別留空或 null。優先完整擷取活動名稱、時間、地點與說明，再填附加 rawOcrText。rawOcrText 最多3000字，只保留實際可讀原文；長 DM 保留核對用重點原文並註明未收錄全部，不為了逐字稿縮減四核心內容。任何欄位不得超過 schema 上限，不輸出未知欄位。';

export function memberEventDmInstructions(now=Date.now()){
  const year=new Date(now+8*3600000).getUTCFullYear();
  return instructions+`\n會員活動年份規則：伺服器提供的台灣當年為 ${year} 年。DM 未標年份時，預設採 ${year} 年；明示西元年份或明確標示的民國年份優先，不得覆蓋為當年。單場已有月、日及開始時間，不能僅因未寫年份判為 unclear；請填 single 及當年完整 startTime，同場明示結束時間也填完整 endTime。多時段每筆 batches 同樣依明示或預設年份。沒有月、日或開始時間、無效日期、未寫結束時間仍留空，不猜測。日期已過去也仍用當年，不改明年；星期不符時不改年份/月日，只在 confidenceNote 提醒核對。scheduleText、rawOcrText 保留圖上原文，不將預設年份冒充原文；有使用預設年份時 confidenceNote 必須註明「年份未標示，預設為 ${year} 年，請確認」。`;
}

function matches(value,schema){
  if(value===null)return Array.isArray(schema.type)&&schema.type.includes('null');
  const type=Array.isArray(schema.type)?schema.type.find(t=>t!=='null'):schema.type;
  if(type==='object')return value&&typeof value==='object'&&!Array.isArray(value)&&schema.required.every(k=>Object.hasOwn(value,k))&&Object.keys(value).every(k=>Object.hasOwn(schema.properties,k)&&matches(value[k],schema.properties[k]));
  if(type==='array')return Array.isArray(value)&&value.length<=schema.maxItems&&value.every(item=>matches(item,schema.items));
  if(type==='integer')return Number.isSafeInteger(value)&&value>=schema.minimum&&value<=schema.maximum;
  if(type==='string')return typeof value==='string'&&(schema.maxLength===undefined||value.length<=schema.maxLength)&&(!schema.enum||schema.enum.includes(value));
  return false;
}

export function normalizeMemberEventDmDraft(value){
  if(!matches(value,MEMBER_EVENT_DM_SCHEMA))throw Error('Invalid activity DM schema');
  return {...normalizeActivityDraft(value),rawOcrText:value.rawOcrText.trim()};
}

export function memberEventDmOutputText(result){
  if(typeof result?.output_text==='string')return result.output_text;
  return (Array.isArray(result?.output)?result.output:[]).flatMap(item=>Array.isArray(item?.content)?item.content:[]).filter(part=>part?.type==='output_text'&&typeof part.text==='string').map(part=>part.text).join('');
}
