import { cropByVisionLocalization, normalizedVisionLocalization } from './a-kaffit-vision-v3-crop.js';

const FIELD_MAP = [
  ['姓名','姓名'],['英文名','英文姓名'],['公司名稱','公司名稱'],['職稱','職稱'],['部門','部門'],
  ['手機號碼','手機號碼'],['公司電話','公司電話'],['電子郵件','Email'],['公司網址','公司網址'],
  ['社群帳號','社群帳號（LINE／IG／FB）'],['公司地址','公司地址'],['服務項目','名片說明（AI 自動撰寫，可修改）']
];
const INDUSTRY_OPTIONS = [
  '健康醫療','美容美業','餐飲食品','零售電商','直銷／社群電商',
  '金融保險','房地產居家','工商專業服務','教育培訓','科技資訊',
  '行銷設計媒體','製造批發貿易','旅遊交通服務','社團協會公益','其他行業'
];
const INDUSTRY_PENDING = '待分類';
const INDUSTRY_RULES = [
  ['健康醫療',/醫療|診所|醫院|藥局|健康|保健|復健|牙醫|護理|中醫|營養/i],
  ['美容美業',/美容|美髮|美甲|美睫|彩妝|造型|SPA|芳療|美體/i],
  ['餐飲食品',/餐飲|食品|餐廳|咖啡|飲料|烘焙|便當|料理|食材/i],
  ['零售電商',/零售|電商|購物|批發|百貨|選物|網拍|商城/i],
  ['直銷／社群電商',/直銷|社群電商|團購|微商|代理|經銷/i],
  ['金融保險',/金融|保險|理財|投資|銀行|證券|貸款/i],
  ['房地產居家',/房地產|房仲|不動產|室內設計|裝潢|家具|居家/i],
  ['工商專業服務',/顧問|法律|會計|工程|建築|貿易|人力|清潔/i],
  ['教育培訓',/教育|培訓|課程|講師|補習|學習|教學/i],
  ['科技資訊',/科技|資訊|軟體|系統|AI|網路|程式|雲端/i],
  ['行銷設計媒體',/行銷|廣告|設計|媒體|社群|公關|攝影|影音/i],
  ['製造批發貿易',/製造|工廠|批發|進出口|貿易|供應鏈|原料/i],
  ['旅遊交通服務',/旅遊|旅行|飯店|民宿|交通|租車|導遊|航空/i],
  ['社團協會公益',/協會|社團|公益|基金會|商會|公會|非營利/i]
];

let scanState = { file:null, processedFile:null, jobId:'', ocr:null, localization:null, cropFile:null, qrLineUrl:'' };
let industryFilterBridgeInstalled = false;

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const getLineToken = () => {
  try { return String(window.liff?.getAccessToken?.() || '').trim(); } catch { return ''; }
};
const workerApiUrl = (path) => {
  const base = String(window.Config?.API_URL || window.WORKER_URL || '').replace(/\/$/, '');
  if (!base) throw new Error('Worker API 尚未設定');
  return base + path;
};
const fileToDataUrl = (file) => new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result||''));r.onerror=()=>reject(new Error('名片圖片讀取失敗'));r.readAsDataURL(file);});

function parseMaybeJson(value){if(typeof value!=='string')return value;try{return JSON.parse(value)}catch{return value}}
function unwrapOcr(ocr){for(const candidate of [ocr?.data?.cardData,ocr?.data?.card,ocr?.data,ocr?.cardData,ocr?.card,ocr?.result,ocr]){const parsed=parseMaybeJson(candidate);if(parsed&&typeof parsed==='object'&&!Array.isArray(parsed))return parsed}return {}}
function pick(source, keys){for(const key of keys){const value=source?.[key];if(value!==undefined&&value!==null&&String(value).trim()!=='')return value}return ''}
function safeLineContactUrl(value){
  const raw=String(value||'').trim();if(!raw)return '';
  try{const url=new URL(/^https?:\/\//i.test(raw)?raw:`https://${raw}`),host=url.hostname.toLowerCase().replace(/^www\./,'');if(!['line.me','lin.ee'].includes(host))return '';url.protocol='https:';url.username='';url.password='';return url.toString()}catch{return ''}
}
function mergeSocialAccounts(source,qrLineUrl=''){
  const exactQr=safeLineContactUrl(qrLineUrl),aiLine=safeLineContactUrl(pick(source,['lineUrl','line_url']));
  const selectedLine=exactQr||aiLine;
  const existing=String(pick(source,['socialAccounts','社群帳號','socials','social','socialMedia'])||'').split(/\s*[｜|;；\n]\s*/).map(item=>item.trim()).filter(Boolean);
  const kept=selectedLine?existing.filter(item=>!/^(?:line\s*(?:id)?|賴)\s*[:：]/i.test(item)):existing;
  return [selectedLine?`LINE: ${selectedLine}`:'',...kept].filter(Boolean).filter((item,index,all)=>all.findIndex(candidate=>candidate.toLowerCase()===item.toLowerCase())===index).join('｜');
}
function serializeSocialAccounts(value){
  const entries=String(value||'').split(/\s*[｜|;；\n]\s*/).map(item=>item.trim()).filter(Boolean).map(item=>{
    const labeled=item.match(/^([^:：]{1,30})[:：]\s*(.+)$/);if(labeled)return {t:labeled[1].trim(),u:labeled[2].trim()};
    return {t:safeLineContactUrl(item)?'LINE':'其他',u:item};
  }).filter(item=>item.u);
  return entries.length?JSON.stringify(entries):'';
}
async function detectLineQrUrl(file){
  if(!file||!('BarcodeDetector' in window)||typeof window.BarcodeDetector.getSupportedFormats!=='function')return '';
  try{
    const formats=await window.BarcodeDetector.getSupportedFormats();if(!formats.includes('qr_code'))return '';
    const bitmap=await createImageBitmap(file);
    try{const codes=await new window.BarcodeDetector({formats:['qr_code']}).detect(bitmap);for(const code of codes){const url=safeLineContactUrl(code?.rawValue);if(url)return url}}finally{bitmap.close?.()}
  }catch(error){console.info('LINE QR progressive detection unavailable',error?.name||'unknown')}
  return '';
}
function normalizeCardData(ocr,qrLineUrl=''){
  const source=unwrapOcr(ocr),out={};
  const aliases={
    '姓名':['姓名','name','displayName','fullName'],'英文名':['英文名','englishName'],'公司名稱':['公司名稱','companyName','company'],'職稱':['職稱','jobTitle','title'],'部門':['部門','department'],
    '手機號碼':['手機號碼','mobile','phone'],'公司電話':['公司電話','companyPhone','officePhone','tel'],'電子郵件':['電子郵件','email'],'公司網址':['公司網址','websiteUrl','website'],'公司地址':['公司地址','address'],'服務項目':['profileDescription','服務項目','serviceDescription','services','description']
  };
  for(const [target,keys] of Object.entries(aliases)){const value=pick(source,keys);if(value!=='')out[target]=value}
  const socials=mergeSocialAccounts(source,qrLineUrl);if(socials)out['社群帳號']=socials;
  return out;
}
function normalizeIndustryArray(value){
  const source=Array.isArray(value)?value:String(value||'').split(/[,，、|]/);
  return [...new Set(source.map(item=>String(item||'').trim()).filter(item=>INDUSTRY_OPTIONS.includes(item)))];
}
function readAiIndustrySuggestion(ocr){
  const source=unwrapOcr(ocr);
  let primary=String(source.primaryIndustry||source['主行業']||source['主要業種']||source['業種']||INDUSTRY_PENDING).trim();
  if(!INDUSTRY_OPTIONS.includes(primary)&&primary!==INDUSTRY_PENDING)primary=INDUSTRY_PENDING;
  const secondary=normalizeIndustryArray(source.secondaryIndustries||source['次行業']||source['次業種']).filter(item=>item!==primary).slice(0,2);
  const confidence=Number(source.industryConfidence??source['業種信心']??0);
  return {primary,secondary,confidence:Number.isFinite(confidence)?Math.max(0,Math.min(1,confidence)):0};
}
function extractLocalization(ocr){return ocr?.localization||ocr?.data?.localization||ocr?.cardLocalization||ocr?.data?.cardLocalization||unwrapOcr(ocr)?.cardLocalization||null}

function industryReviewHtml(suggestion){
  const primaryOptions=[INDUSTRY_PENDING,...INDUSTRY_OPTIONS].map(option=>`<label style="display:inline-flex;align-items:center;gap:6px;border:1px solid ${option===suggestion.primary?'#10b981':'#dbe3ee'};background:${option===suggestion.primary?'#ecfdf5':'#fff'};border-radius:999px;padding:8px 10px;font-size:13px;font-weight:800;color:#334155;cursor:pointer"><input type="radio" name="ak-primary-industry" value="${escapeHtml(option)}" ${option===suggestion.primary?'checked':''}>${escapeHtml(option)}</label>`).join('');
  const secondaryOptions=INDUSTRY_OPTIONS.map(option=>`<label data-ak-secondary-wrap="${escapeHtml(option)}" style="display:inline-flex;align-items:center;gap:6px;border:1px solid ${suggestion.secondary.includes(option)?'#60a5fa':'#dbe3ee'};background:${suggestion.secondary.includes(option)?'#eff6ff':'#fff'};border-radius:999px;padding:8px 10px;font-size:13px;font-weight:800;color:#334155;cursor:pointer;${option===suggestion.primary?'opacity:.45':''}"><input type="checkbox" data-ak-secondary-industry value="${escapeHtml(option)}" ${suggestion.secondary.includes(option)?'checked':''} ${option===suggestion.primary?'disabled':''}>${escapeHtml(option)}</label>`).join('');
  const confidence=Math.round((suggestion.confidence||0)*100);
  return `<section id="ak-industry-review" style="margin-top:16px;padding:14px;border:1px solid #d1fae5;background:#f0fdf4;border-radius:16px"><div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px"><div><div style="font-size:15px;font-weight:900;color:#065f46">業種對應確認</div><div style="margin-top:3px;font-size:12px;font-weight:700;color:#64748b">AI 建議 ${confidence}%；請人工確認後再儲存</div></div><span id="ak-industry-count" style="font-size:12px;font-weight:900;color:#2563eb">次業種 ${suggestion.secondary.length}/2</span></div><div style="margin-top:12px;font-size:12px;font-weight:900;color:#475569">主業種（單選 1 個）</div><div id="ak-primary-industry-options" style="display:flex;flex-wrap:wrap;gap:7px;margin-top:7px">${primaryOptions}</div><div style="margin-top:14px;font-size:12px;font-weight:900;color:#475569">次業種（最多勾選 2 個）</div><div id="ak-secondary-industry-options" style="display:flex;flex-wrap:wrap;gap:7px;margin-top:7px">${secondaryOptions}</div><div id="ak-industry-warning" style="display:${suggestion.primary===INDUSTRY_PENDING?'block':'none'};margin-top:10px;border-radius:10px;background:#fff7ed;padding:9px 10px;font-size:12px;font-weight:800;color:#c2410c">AI 信心不足，現在是「待分類」。可人工選擇主業種後再儲存。</div></section>`;
}
function syncIndustryControls(root){
  const selectedPrimary=root.querySelector('input[name="ak-primary-industry"]:checked')?.value||INDUSTRY_PENDING;
  root.querySelectorAll('[data-ak-secondary-industry]').forEach(input=>{
    const same=input.value===selectedPrimary;
    if(same)input.checked=false;
    input.disabled=same;
    const wrap=input.closest('[data-ak-secondary-wrap]');
    if(wrap){wrap.style.opacity=same?'.45':'1';wrap.style.borderColor=input.checked?'#60a5fa':'#dbe3ee';wrap.style.background=input.checked?'#eff6ff':'#fff'}
  });
  root.querySelectorAll('input[name="ak-primary-industry"]').forEach(input=>{
    const label=input.closest('label');if(!label)return;const active=input.checked;label.style.borderColor=active?'#10b981':'#dbe3ee';label.style.background=active?'#ecfdf5':'#fff';
  });
  const checked=[...root.querySelectorAll('[data-ak-secondary-industry]:checked')];
  const count=root.querySelector('#ak-industry-count');if(count)count.textContent=`次業種 ${checked.length}/2`;
  const warning=root.querySelector('#ak-industry-warning');if(warning)warning.style.display=selectedPrimary===INDUSTRY_PENDING?'block':'none';
}
function wireIndustryControls(root){
  root.querySelectorAll('input[name="ak-primary-industry"]').forEach(input=>input.addEventListener('change',()=>syncIndustryControls(root)));
  root.querySelectorAll('[data-ak-secondary-industry]').forEach(input=>input.addEventListener('change',()=>{
    const checked=[...root.querySelectorAll('[data-ak-secondary-industry]:checked')];
    if(checked.length>2){input.checked=false;window.showToast?.('次業種最多選 2 個',true)}
    syncIndustryControls(root);
  }));
  syncIndustryControls(root);
}
function readIndustryReview(root){
  const primary=root.querySelector('input[name="ak-primary-industry"]:checked')?.value||INDUSTRY_PENDING;
  const secondary=[...root.querySelectorAll('[data-ak-secondary-industry]:checked')].map(input=>input.value).filter(value=>value!==primary).slice(0,2);
  const ai=readAiIndustrySuggestion(scanState.ocr);
  return {primary,secondary,confidence:ai.confidence,locked:true,source:'human_review',reviewedAt:new Date().toISOString()};
}
function applyIndustryClassification(card,classification){
  let cfg={};try{cfg=parseMaybeJson(card['自訂名片設定']||'{}')||{}}catch{}if(!cfg||typeof cfg!=='object'||Array.isArray(cfg))cfg={};
  cfg.industryClassification=classification;
  card['自訂名片設定']=JSON.stringify(cfg);
  card['業種']=classification.primary;
  card['主要業種']=classification.primary;
  card['次業種']=classification.secondary.join('、');
  card.primaryIndustry=classification.primary;
  card.secondaryIndustries=classification.secondary;
  card.industryConfidence=classification.confidence;
  card.industryLocked=true;
  const currentTags=String(card['標籤']||'').split(/[,，、|]/).map(item=>item.trim()).filter(Boolean);
  card['標籤']=[...new Set([...currentTags,...(classification.primary===INDUSTRY_PENDING?[]:[classification.primary]),...classification.secondary])].join(',');
  return card;
}
function readStoredIndustry(card){
  const raw=card?.['自訂名片設定']||card?.customConfig||card?.custom_config||card?.['電子名片設定']||'{}';
  const cfg=parseMaybeJson(raw)||{};
  const stored=cfg?.industryClassification||{};
  const primary=String(stored.primary||card?.primaryIndustry||card?.['業種']||card?.['主要業種']||'').trim();
  const secondary=normalizeIndustryArray(stored.secondary||card?.secondaryIndustries||card?.['次業種']);
  if(INDUSTRY_OPTIONS.includes(primary)||primary===INDUSTRY_PENDING)return {primary,secondary};
  const source=[card?.['服務項目'],card?.services,card?.['標籤'],card?.tags,card?.['公司名稱'],card?.companyName,card?.['職稱'],card?.title].map(value=>String(value||'')).join(' ');
  const matched=INDUSTRY_RULES.find(([,pattern])=>pattern.test(source));
  return {primary:matched?.[0]||'其他行業',secondary};
}
function installIndustryFilterBridge(){
  if(industryFilterBridgeInstalled||typeof window.renderCardList!=='function')return false;
  industryFilterBridgeInstalled=true;
  const originalRender=window.renderCardList.bind(window);
  window.renderCardList=function(cards,options={}){
    originalRender(cards,options);
    const byId=new Map((Array.isArray(cards)?cards:[]).map(card=>[String(card?.rowId||card?.['rowId']||card?.id||''),card]));
    document.querySelectorAll('#card-list [onclick*="openCardDetailByRowId"]').forEach(row=>{
      const match=String(row.getAttribute('onclick')||'').match(/openCardDetailByRowId\('([^']*)'\)/);if(!match)return;
      const card=byId.get(match[1])||(Array.isArray(window.allCards)?window.allCards.find(item=>String(item?.rowId||item?.['rowId']||item?.id||'')===match[1]):null);if(!card)return;
      const badge=row.querySelector('.flex-1.min-w-0 span.inline-flex');if(badge)badge.textContent=readStoredIndustry(card).primary;
    });
  };
  window.filterCards=function(){
    const keyword=String(document.getElementById('search-card-input')?.value||'').toLowerCase().trim();
    const industry=String(window.cardIndustryFilter||'全部');
    const source=Array.isArray(window.harvestCards)?window.harvestCards:(Array.isArray(window.allCards)?window.allCards:[]);
    const filtered=source.filter(card=>{
      const classified=readStoredIndustry(card);
      const text=[card?.['姓名'],card?.name,card?.['英文名'],card?.englishName,card?.['公司名稱'],card?.companyName,card?.['職稱'],card?.title,card?.['手機號碼'],card?.mobile,card?.['公司電話'],card?.officePhone,card?.['電子郵件'],card?.email,card?.['服務項目'],card?.services,card?.['標籤'],card?.tags,classified.primary,...classified.secondary].map(value=>String(value||'')).join(' ').toLowerCase();
      return (!keyword||text.includes(keyword))&&(industry==='全部'||classified.primary===industry||classified.secondary.includes(industry));
    });
    window.renderCardList(filtered);
  };
  window.setCardIndustryFilter=function(industry){
    window.cardIndustryFilter=String(industry||'全部')||'全部';
    document.querySelectorAll('[data-card-industry]').forEach(button=>{const active=button.dataset.cardIndustry===window.cardIndustryFilter;button.className=active?'shrink-0 rounded-full bg-emerald-600 px-4 py-2 text-[13px] font-black text-white':'shrink-0 rounded-full border border-slate-200 bg-white px-4 py-2 text-[13px] font-bold text-slate-600'});
    window.filterCards();
  };
  const container=document.getElementById('card-industry-filters');
  if(container){container.innerHTML=['全部',...INDUSTRY_OPTIONS].map((industry,index)=>`<button type="button" data-card-industry="${escapeHtml(industry)}" class="${index===0?'shrink-0 rounded-full bg-emerald-600 px-4 py-2 text-[13px] font-black text-white':'shrink-0 rounded-full border border-slate-200 bg-white px-4 py-2 text-[13px] font-bold text-slate-600'}">${escapeHtml(industry)}</button>`).join('');container.querySelectorAll('[data-card-industry]').forEach(button=>button.addEventListener('click',()=>window.setCardIndustryFilter(button.dataset.cardIndustry)))}
  return true;
}

// Exact A-kaffit compression policy from public/app-20260815-132.js.
async function compressCardImage(file) {
  if (!file?.type?.startsWith('image/')) throw new Error('請選擇圖片檔案');
  const source = await createImageBitmap(file);
  try {
    let smallest = null;
    for (const maxSide of [1600, 1280, 1024, 800, 640, 512]) {
      const scale = Math.min(1, maxSide / Math.max(source.width, source.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(source.width * scale));
      canvas.height = Math.max(1, Math.round(source.height * scale));
      const context = canvas.getContext('2d');
      context.drawImage(source, 0, 0, canvas.width, canvas.height);
      for (const quality of [0.84, 0.72, 0.60, 0.48, 0.36]) {
        const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', quality));
        if (!blob) continue;
        if (!smallest || blob.size < smallest.size) smallest = blob;
        if (blob.size <= 900 * 1024) return new File([blob], 'card-cover.webp', { type:'image/webp' });
      }
    }
    if (!smallest) throw new Error('圖片壓縮失敗，請改用其他圖片');
    return new File([smallest], 'card-cover.webp', { type:'image/webp' });
  } finally { source.close?.(); }
}

async function uploadCardImageOriginal(file, sideLabel='正面', purpose='collection') {
  if (file.size > 15 * 1024 * 1024) throw new Error('名片原圖不可超過 15MB');
  const token=getLineToken(); if(!token) throw new Error('LINE 登入已逾時，請重新開啟頁面');
  const response=await fetch(workerApiUrl('/v1/card-images'),{method:'POST',headers:{authorization:'Bearer '+token,'content-type':file.type,'x-card-file-size':String(file.size),'x-card-side':sideLabel==='背面'?'back':'front','x-card-purpose':purpose},body:file});
  const body=await response.json().catch(()=>({}));if(!response.ok)throw new Error(body.error||'名片原圖上傳失敗');return body.job;
}
async function saveCardImageProcessingResult(jobId,file,metadata,status='completed'){
  const token=getLineToken(); if(!token) throw new Error('LINE 登入已逾時，請重新開啟頁面');
  const form=new FormData();form.append('image',file);form.append('metadata',JSON.stringify(metadata));form.append('status',status);
  const response=await fetch(workerApiUrl('/v1/card-images/'+encodeURIComponent(jobId)+'/result'),{method:'POST',headers:{authorization:'Bearer '+token},body:form});
  const body=await response.json().catch(()=>({}));if(!response.ok)throw new Error(body.error||'名片影像處理結果儲存失敗');return body.job;
}
async function prepareBusinessCardImage(file,sideLabel='正面',purpose='collection'){
  const [job,processed]=await Promise.all([
    uploadCardImageOriginal(file,sideLabel,purpose),
    compressCardImage(file)
  ]);
  const metadata={processingVersion:'vision-localization-v3',detection:{detected:false,confidence:0,strategy:'vision-pending'},quality:{overall:100,blur:100,brightness:100,glare:100,coverage:100},processing:{perspectiveCorrected:false,cropped:false,rotated:false,lightingEnhanced:false,manualCorrection:false,resolutionNormalized:true},corners:[],warning:'等待單次 AI Vision 同時完成 OCR 與名片定位'};
  await saveCardImageProcessingResult(job.id,processed,metadata,'completed');
  return {file:processed,jobId:job.id,metadata};
}

function ensureModal(id){let modal=document.getElementById(id);if(modal)return modal;modal=document.createElement('div');modal.id=id;modal.style.cssText='position:fixed;inset:0;z-index:13000;background:rgba(15,23,42,.68);backdrop-filter:blur(5px);display:flex;align-items:center;justify-content:center;padding:14px';document.body.appendChild(modal);return modal}
function closeModal(id){document.getElementById(id)?.remove()}
function clearScanError(){const box=document.getElementById('ak-scan-error');if(box){box.textContent='';box.style.display='none'}}
function showScanError(message){
  const box=document.getElementById('ak-scan-error');if(!box)return;
  box.textContent='辨識失敗：'+String(message||'目前無法完成名片辨識，請稍後重試');
  box.style.display='block';box.scrollIntoView?.({block:'nearest'});
}

function showPreparedDraft(){
  const modal=ensureModal('akaffit-scan-draft');
  modal.innerHTML=`<section style="width:min(94vw,430px);background:white;border-radius:24px;padding:20px;box-shadow:0 24px 80px rgba(0,0,0,.3)"><h2 style="margin:0;font-size:21px">掃描建立名片</h2><p style="color:#64748b;line-height:1.6">已智慧校正 1 張（正面）。確認後送出名片，由 AI 在同一次辨識完成 OCR、名片定位與業種建議。</p><div id="ak-scan-error" role="alert" aria-live="assertive" style="display:none;margin:0 0 14px;padding:12px 14px;border:1px solid #fecaca;border-radius:12px;background:#fef2f2;color:#b91c1c;font-size:14px;font-weight:700;line-height:1.55;white-space:pre-wrap"></div><div style="display:grid;grid-template-columns:1fr 2fr;gap:10px"><button id="ak-cancel-scan" style="min-height:48px;border:0;border-radius:14px;background:#e2e8f0;font-weight:800">取消</button><button id="ak-start-ocr" style="min-height:48px;border:0;border-radius:14px;background:#06c755;color:white;font-weight:900">送出名片</button></div></section>`;
  modal.querySelector('#ak-cancel-scan').onclick=()=>{scanState={file:null,processedFile:null,jobId:'',ocr:null,localization:null,cropFile:null,qrLineUrl:''};closeModal('akaffit-scan-draft')};
  modal.querySelector('#ak-start-ocr').onclick=runOcrAndReview;
}

function reviewFields(card){return FIELD_MAP.map(([key,label])=>{const control=key==='服務項目'?`<textarea data-ak-field="${escapeHtml(key)}" rows="3" style="box-sizing:border-box;width:100%;margin-top:5px;padding:11px 12px;border:1px solid #dbe3ee;border-radius:12px;font:inherit;line-height:1.55;resize:vertical">${escapeHtml(card[key]||'')}</textarea>`:`<input data-ak-field="${escapeHtml(key)}" value="${escapeHtml(card[key]||'')}" style="box-sizing:border-box;width:100%;margin-top:5px;padding:11px 12px;border:1px solid #dbe3ee;border-radius:12px;font:inherit">`;return `<label style="display:block;margin:9px 0;font-weight:800;color:#334155">${label}${control}</label>`}).join('')}
function readReviewFields(root){const card={};root.querySelectorAll('[data-ak-field]').forEach(input=>{const key=input.dataset.akField,value=input.value.trim();card[key]=key==='社群帳號'?serializeSocialAccounts(value):value});return card}

async function runOcrAndReview(){
  clearScanError();
  const button=document.querySelector('#ak-start-ocr');if(button){button.disabled=true;button.textContent='AI 辨識中…'}
  try{
    window.showCardOcrProgress?.('A-kaffit 名片智慧建立中');
    window.setCardOcrProgressStage?.(25,'AI 正在同時辨識文字、名片外框與業種...');
    const dataUrl=await fileToDataUrl(scanState.processedFile);
    const [ocr,qrLineUrl]=await Promise.all([
      window.fetchAPI('recognizeCardWithGPT4o',{base64Image:dataUrl,deferImageUpload:true},true),
      detectLineQrUrl(scanState.processedFile)
    ]);
    if(!ocr||ocr.error)throw new Error(ocr?.error||'AI 辨識失敗');
    const localization=normalizedVisionLocalization(extractLocalization(ocr)||{});
    if(localization.incomplete){const edges=(localization.clippedEdges||[]).join('、');throw new Error('名片未完整入鏡'+(edges?'（缺少：'+edges+'）':'')+'，請稍微拉遠重新拍攝。')}
    const cropFile=await cropByVisionLocalization(scanState.processedFile,localization);
    scanState={...scanState,ocr,localization,cropFile,qrLineUrl};
    window.hideCardOcrProgress?.();closeModal('akaffit-scan-draft');showReview();
  }catch(error){const message=error?.message||'名片辨識失敗';window.hideCardOcrProgress?.();showScanError(message);window.showToast?.(message,true);if(button){button.disabled=false;button.textContent='重新送出'}}
}

function showReview(){
  const card=normalizeCardData(scanState.ocr,scanState.qrLineUrl),industry=readAiIndustrySuggestion(scanState.ocr),localization=normalizedVisionLocalization(scanState.localization||{}),preview=scanState.cropFile?URL.createObjectURL(scanState.cropFile):'';
  const modal=ensureModal('akaffit-card-review');
  modal.innerHTML=`<section style="width:min(96vw,520px);max-height:92vh;overflow:auto;background:#fff;border-radius:24px;padding:18px;box-shadow:0 24px 80px rgba(0,0,0,.32)"><h2 style="margin:0">確認名片資料</h2><p style="color:#64748b;line-height:1.5">AI 名片定位 ${Math.round(localization.cropConfidence*100)}%${scanState.cropFile?'，已先分離名片本體':'，定位信心不足；文字仍可先校正'}。</p>${preview?`<img src="${preview}" alt="AI 分離後名片" style="display:block;width:100%;max-height:340px;object-fit:contain;border-radius:16px;background:#f4f4f4;margin:12px 0">`:''}<div id="ak-review-fields">${reviewFields(card)}</div>${industryReviewHtml(industry)}<div style="display:grid;grid-template-columns:1fr 2fr;gap:10px;margin-top:14px"><button id="ak-review-cancel" style="min-height:48px;border:0;border-radius:14px;background:#e2e8f0;font-weight:800">取消</button><button id="ak-review-save" style="min-height:48px;border:0;border-radius:14px;background:#06c755;color:white;font-weight:900">儲存至名片收藏</button></div></section>`;
  wireIndustryControls(modal);
  modal.querySelector('#ak-review-cancel').onclick=()=>{if(preview)URL.revokeObjectURL(preview);closeModal('akaffit-card-review')};
  modal.querySelector('#ak-review-save').onclick=()=>saveReviewedCard(modal,preview);
}

async function uploadFinalCrop(file){if(!file)return '';const dataUrl=await fileToDataUrl(file);const result=await window.fetchAPI('uploadImageToR2',{base64Image:dataUrl},true);const url=result?.url||result?.data?.url||'';if(!url)throw new Error(result?.error||'名片分離圖片儲存失敗');return url}
function applyImage(card,url){if(!url)return card;card['名片圖檔']=url;let cfg={};try{cfg=JSON.parse(card['自訂名片設定']||'{}')||{}}catch{}cfg.imgUrl=url;cfg.imgUrlLandscape=url;cfg.isPrivate=true;card['自訂名片設定']=JSON.stringify(cfg);return card}

async function saveReviewedCard(modal,previewUrl){
  const button=modal.querySelector('#ak-review-save');button.disabled=true;button.textContent='儲存中…';
  try{
    const card=readReviewFields(modal.querySelector('#ak-review-fields'));
    if(scanState.cropFile)applyImage(card,await uploadFinalCrop(scanState.cropFile));
    applyIndustryClassification(card,readIndustryReview(modal));
    const payload={...card,userId:'',creatorId:window.currentUserProfile?.userId||'','建檔者ID':window.currentUserProfile?.userId||'','建檔人/備註':'掃描建立 by '+(window.currentUser?.name||'')};
    const result=await window.fetchAPI('saveCard',payload,true);if(!result||!result.rowId)throw new Error(result?.error||'儲存失敗');
    if(previewUrl)URL.revokeObjectURL(previewUrl);closeModal('akaffit-card-review');
    scanState={file:null,processedFile:null,jobId:'',ocr:null,localization:null,cropFile:null,qrLineUrl:''};
    window.showToast?.('客戶名片建立成功，業種對應已儲存');window.refreshPointBalanceBadge?.();window.goPage?.('card');window.loadCardData?.({force:true});
  }catch(error){button.disabled=false;button.textContent='儲存至名片收藏';window.showToast?.(error.message||'名片儲存失敗',true)}
}

window.__A_KAFFIT_FULL_CARD_WORKFLOW__=true;
window.prepareBusinessCardImage=prepareBusinessCardImage;
window.recognizeCard=async function(input){
  const file=input?.files?.[0];if(!file)return;input.value='';
  window.showCardOcrProgress?.('名片辨識準備中');
  window.setCardOcrProgressStage?.(5,'照片已收到，正在準備辨識...');
  try{
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    window.setCardOcrProgressStage?.(8,'正在上傳並壓縮名片照片...');
    const prepared=await prepareBusinessCardImage(file,'正面','collection');
    scanState={file,processedFile:prepared.file,jobId:prepared.jobId,ocr:null,localization:null,cropFile:null,qrLineUrl:''};
    window.hideCardOcrProgress?.();
    showPreparedDraft();
  }catch(error){window.hideCardOcrProgress?.();window.showToast?.(error.message||'名片圖片處理失敗',true)}
};

if(!installIndustryFilterBridge())setTimeout(installIndustryFilterBridge,0);
