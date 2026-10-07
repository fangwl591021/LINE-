// Member event DM only: no changes to business-card or official activity models.
import {ACTIVITY_DM_PROMPT,normalizeActivityDraft} from './activity-dm-ai.mjs';

export const MEMBER_EVENT_DM_MODEL='gpt-5.6-sol';
const string=(maxLength,description)=>({type:'string',maxLength,...(description?{description}:{})});
const price={type:['integer','null'],minimum:0,maximum:Number.MAX_SAFE_INTEGER,description:'明示單一新台幣費用；只有明示免費才填0，不明或多票價為null。'};
const object=properties=>({type:'object',additionalProperties:false,properties,required:Object.keys(properties)});
const startYearText=()=>string(40,'只抄本場活動日期原圖明印的年份文字，例如2025或民國115年；未印年份填空字串，不得由星期、ISO日期或當年推算。');
const endYearText=()=>string(40,'結束日期另有明印年份才逐字抄錄；沒有另印年份填空字串，由後端沿用本場開始年份，不得猜跨年。');
export const MEMBER_EVENT_DM_SCHEMA=Object.freeze(object({
  activityName:string(120,'主活動名稱，不能用主辦品牌或廣告標語取代。'),
  scheduleText:string(600,'原圖所有活動日期/時間原文，不是截止日或議程時間。'),
  timeStatus:{type:'string',enum:['single','multiple','unclear']},
  startTime:string(40,'單場日期與開始時間完整才填 YYYY-MM-DDTHH:mm；未標年份用伺服器提供的台灣當年，多場或缺日/時分時留空。'),
  endTime:string(40,'單場明示結束時間 YYYY-MM-DDTHH:mm；不可推算，否則留空。'),
  startYearText:startYearText(),
  endYearText:endYearText(),
  location:string(300,'實際活動場地、完整地址、樓層室號；不是主辦聯絡地址。'),
  description:string(9000,'忠實擷取內容、講者、議程、條件與注意事項，保留換行，不創作文案。'),
  activityType:string(40),
  price,
  batches:{type:'array',maxItems:24,items:object({name:string(120),scheduleText:string(300),startTime:string(40),endTime:string(40),startYearText:startYearText(),endYearText:endYearText(),price})},
  confidenceNote:string(600,'逐項提醒模糊、缺漏、時間或票价歧義，不能自行補值。'),
  rawOcrText:string(3000,'實際可讀原文供核對，四核心資料優先；不憑空補字。長DM保留重點原文並在confidenceNote註明未收錄全部。'),
}));

// Member-only exception: the user explicitly authorized a current-year default. Do not change the shared official DM prompt.
const instructions=ACTIVITY_DM_PROMPT.replace('缺少年份、日期或開始時間時不能補今年、00:00 或猜測；','缺少日期或開始時間時不能補日期、00:00 或猜測；')+'\n依提供的嚴格 JSON schema 輸出全部欄位（包含 rawOcrText），無資料時依欄位型別留空或 null。優先完整擷取活動名稱、時間、地點與說明，再填附加 rawOcrText。rawOcrText 最多3000字，只保留實際可讀原文；長 DM 保留核對用重點原文並註明未收錄全部，不為了逐字稿縮減四核心內容。任何欄位不得超過 schema 上限，不輸出未知欄位。';

const taiwanYear=now=>new Date(now+8*3600000).getUTCFullYear();
export function memberEventDmInstructions(now=Date.now()){
  const year=taiwanYear(now);
  return instructions+`\n會員活動年份規則：伺服器提供的台灣當年為 ${year} 年。DM 未標年份時，預設採 ${year} 年；明示西元年份或明確標示的民國年份優先，不得覆蓋為當年。單場已有月、日及開始時間，不能僅因未寫年份判為 unclear；請填 single 及當年完整 startTime，同場明示結束時間也填完整 endTime。多時段每筆 batches 同樣依明示或預設年份。沒有月、日或開始時間、無效日期、未寫結束時間仍留空，不猜測。日期已過去也仍用當年，不改明年；星期不符時不改年份/月日，只在 confidenceNote 提醒核對。scheduleText、rawOcrText 保留圖上原文，不將預設年份冒充原文；有使用預設年份時 confidenceNote 必須註明「年份未標示，預設為 ${year} 年，請確認」。\n單場與每筆 batches 另外輸出 startYearText/endYearText 作為原圖年份證據，必須逐字保留在對應 scheduleText 中。startYearText 只抄活動日期明印的西元年份或帶民國標記的年份，未印必須填空字串，不能從 startTime、星期或伺服器當年倒填。endYearText 只抄結束日期另外明印的年份；同一天或沿用起始年份時留空，清楚跨年且印有結束年份才抄錄。不要把版權、成立年、電話、地址或報名截止年份當作活動年份。後端會依這兩個證據欄位實際校正日期，不採信你自行推測的年份。`;
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

function printedStartYear(scheduleText){
  // Also preserve an explicitly transcribed date year if the provider left its evidence field empty.
  const source=scheduleText.normalize('NFKC').replace(/\s/g,''),years=new Set();
  for(const match of source.matchAll(/(?:^|[^\d])([1-9]\d{3})(?:年|[\/.-](?=\d{1,2}[\/.-]\d{1,2}))/g))years.add(Number(match[1]));
  for(const match of source.matchAll(/(?:民國|中華民國|R\.?O\.?C\.?)0*([1-9]\d{0,2})(?:年|[\/.-](?=\d{1,2}[\/.-]\d{1,2}))/gi))years.add(Number(match[1])+1911);
  return years.size===0?null:years.size===1?[...years][0]:NaN;
}

function explicitYear(text,scheduleText,start=false){
  const original=text.normalize('NFKC').replace(/\s/g,'');
  if(!original)return start?printedStartYear(scheduleText):null;
  // A non-empty but unsupported source is not permission to overwrite an explicit year.
  if(!scheduleText.normalize('NFKC').replace(/\s/g,'').includes(original))return NaN;
  const western=original.match(/^(?:(?:西元|公元|AD))?([1-9]\d{3})年?$/i);
  if(western)return Number(western[1]);
  const roc=original.match(/^(?:民國|中華民國|R\.?O\.?C\.?)0*([1-9]\d{0,2})年?$/i);
  return roc?Number(roc[1])+1911:NaN;
}

export function normalizeMemberEventDmDraft(value,now=Date.now()){
  if(!matches(value,MEMBER_EVENT_DM_SCHEMA))throw Error('Invalid activity DM schema');
  const currentYear=taiwanYear(now);let defaulted=false,invalidEvidence=false;
  const correct=period=>{
    const sourceYear=explicitYear(period.startYearText,period.scheduleText,true);
    const startYear=sourceYear??currentYear;
    const endYear=explicitYear(period.endYearText,period.scheduleText)??startYear;
    if(!Number.isFinite(startYear)||!Number.isFinite(endYear))invalidEvidence=true;
    if(sourceYear===null&&(period.startTime||period.endTime))defaulted=true;
    const date=(text,year)=>Number.isFinite(year)&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(text)?String(year).padStart(4,'0')+text.slice(4):'';
    return {...period,startTime:date(period.startTime,startYear),endTime:date(period.endTime,endYear)};
  };
  // Enforce the year before date validation (including leap days), without changing month/day/time.
  const corrected=correct(value),batches=value.batches.map(correct);
  const providerNote=defaulted?value.confidenceNote.replace(/年份未標示[，,]?\s*預設(?:為|採)\s*\d{4}\s*年[，,]?\s*請確認[；;]?/g,''):value.confidenceNote;
  corrected.confidenceNote=[defaulted?`年份未標示，預設為 ${currentYear} 年，請確認`:'',invalidEvidence?'原圖年份證據不明，相關時間留空，請核對原圖後手動補填':'',providerNote].filter(Boolean).join('；');
  return {...normalizeActivityDraft({...corrected,batches}),rawOcrText:value.rawOcrText.trim()};
}

export function memberEventDmOutputText(result){
  if(typeof result?.output_text==='string')return result.output_text;
  return (Array.isArray(result?.output)?result.output:[]).flatMap(item=>Array.isArray(item?.content)?item.content:[]).filter(part=>part?.type==='output_text'&&typeof part.text==='string').map(part=>part.text).join('');
}
