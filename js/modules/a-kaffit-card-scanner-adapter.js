import { cropByVisionLocalization, normalizedVisionLocalization } from './a-kaffit-vision-v3-crop.js';

const FIELD_MAP = [
  ['姓名','姓名'],['英文名','英文姓名'],['公司名稱','公司名稱'],['職稱','職稱'],['部門','部門'],
  ['手機號碼','手機號碼'],['公司電話','公司電話'],['電子郵件','Email'],['公司網址','公司網址'],
  ['公司地址','公司地址'],['服務項目','服務項目']
];

let scanState = { file:null, processedFile:null, jobId:'', ocr:null, localization:null, cropFile:null };

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
function normalizeCardData(ocr){
  const source=unwrapOcr(ocr),out={};
  const aliases={
    '姓名':['姓名','name','displayName','fullName'],'英文名':['英文名','englishName'],'公司名稱':['公司名稱','companyName','company'],'職稱':['職稱','jobTitle','title'],'部門':['部門','department'],
    '手機號碼':['手機號碼','mobile','phone'],'公司電話':['公司電話','companyPhone','officePhone','tel'],'電子郵件':['電子郵件','email'],'公司網址':['公司網址','websiteUrl','website'],'公司地址':['公司地址','address'],'服務項目':['服務項目','serviceDescription','services','description']
  };
  for(const [target,keys] of Object.entries(aliases)){const value=pick(source,keys);if(value!=='')out[target]=value}
  return out;
}
function extractLocalization(ocr){return ocr?.localization||ocr?.data?.localization||ocr?.cardLocalization||ocr?.data?.cardLocalization||unwrapOcr(ocr)?.cardLocalization||null}

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
  const job=await uploadCardImageOriginal(file,sideLabel,purpose);
  const processed=await compressCardImage(file);
  const metadata={processingVersion:'vision-localization-v3',detection:{detected:false,confidence:0,strategy:'vision-pending'},quality:{overall:100,blur:100,brightness:100,glare:100,coverage:100},processing:{perspectiveCorrected:false,cropped:false,rotated:false,lightingEnhanced:false,manualCorrection:false,resolutionNormalized:true},corners:[],warning:'等待單次 AI Vision 同時完成 OCR 與名片定位'};
  await saveCardImageProcessingResult(job.id,processed,metadata,'completed');
  return {file:processed,jobId:job.id,metadata};
}

function ensureModal(id){let modal=document.getElementById(id);if(modal)return modal;modal=document.createElement('div');modal.id=id;modal.style.cssText='position:fixed;inset:0;z-index:13000;background:rgba(15,23,42,.68);backdrop-filter:blur(5px);display:flex;align-items:center;justify-content:center;padding:14px';document.body.appendChild(modal);return modal}
function closeModal(id){document.getElementById(id)?.remove()}

function showPreparedDraft(){
  const modal=ensureModal('akaffit-scan-draft');
  modal.innerHTML=`<section style="width:min(94vw,430px);background:white;border-radius:24px;padding:20px;box-shadow:0 24px 80px rgba(0,0,0,.3)"><h2 style="margin:0;font-size:21px">掃描建立名片</h2><p style="color:#64748b;line-height:1.6">已智慧校正 1 張（正面）。確認後送出名片，由 AI 在同一次辨識完成 OCR 與名片定位。</p><div style="display:grid;grid-template-columns:1fr 2fr;gap:10px"><button id="ak-cancel-scan" style="min-height:48px;border:0;border-radius:14px;background:#e2e8f0;font-weight:800">取消</button><button id="ak-start-ocr" style="min-height:48px;border:0;border-radius:14px;background:#06c755;color:white;font-weight:900">送出名片</button></div></section>`;
  modal.querySelector('#ak-cancel-scan').onclick=()=>{scanState={file:null,processedFile:null,jobId:'',ocr:null,localization:null,cropFile:null};closeModal('akaffit-scan-draft')};
  modal.querySelector('#ak-start-ocr').onclick=runOcrAndReview;
}

function reviewFields(card){return FIELD_MAP.map(([key,label])=>`<label style="display:block;margin:9px 0;font-weight:800;color:#334155">${label}<input data-ak-field="${escapeHtml(key)}" value="${escapeHtml(card[key]||'')}" style="box-sizing:border-box;width:100%;margin-top:5px;padding:11px 12px;border:1px solid #dbe3ee;border-radius:12px;font:inherit"></label>`).join('')}
function readReviewFields(root){const card={};root.querySelectorAll('[data-ak-field]').forEach(input=>card[input.dataset.akField]=input.value.trim());return card}

async function runOcrAndReview(){
  const button=document.querySelector('#ak-start-ocr');if(button){button.disabled=true;button.textContent='AI 辨識中…'}
  try{
    window.showCardOcrProgress?.('A-kaffit 名片智慧建立中');
    window.setCardOcrProgressStage?.(25,'AI 正在同時辨識文字與名片外框...');
    const dataUrl=await fileToDataUrl(scanState.processedFile);
    const ocr=await window.fetchAPI('recognizeCardWithGPT4o',{base64Image:dataUrl,deferImageUpload:true},true);
    if(!ocr||ocr.error)throw new Error(ocr?.error||'AI 辨識失敗');
    const localization=normalizedVisionLocalization(extractLocalization(ocr)||{});
    if(localization.incomplete){const edges=(localization.clippedEdges||[]).join('、');throw new Error('名片未完整入鏡'+(edges?'（缺少：'+edges+'）':'')+'，請稍微拉遠重新拍攝。')}
    const cropFile=await cropByVisionLocalization(scanState.processedFile,localization);
    scanState={...scanState,ocr,localization,cropFile};
    window.hideCardOcrProgress?.();closeModal('akaffit-scan-draft');showReview();
  }catch(error){window.hideCardOcrProgress?.();window.showToast?.(error.message||'名片辨識失敗',true);if(button){button.disabled=false;button.textContent='送出名片'}}
}

function showReview(){
  const card=normalizeCardData(scanState.ocr),localization=normalizedVisionLocalization(scanState.localization||{}),preview=scanState.cropFile?URL.createObjectURL(scanState.cropFile):'';
  const modal=ensureModal('akaffit-card-review');
  modal.innerHTML=`<section style="width:min(96vw,520px);max-height:92vh;overflow:auto;background:#fff;border-radius:24px;padding:18px;box-shadow:0 24px 80px rgba(0,0,0,.32)"><h2 style="margin:0">確認名片資料</h2><p style="color:#64748b;line-height:1.5">AI 名片定位 ${Math.round(localization.cropConfidence*100)}%${scanState.cropFile?'，已先分離名片本體':'，定位信心不足；文字仍可先校正'}。</p>${preview?`<img src="${preview}" alt="AI 分離後名片" style="display:block;width:100%;max-height:340px;object-fit:contain;border-radius:16px;background:#f4f4f4;margin:12px 0">`:''}<div id="ak-review-fields">${reviewFields(card)}</div><div style="display:grid;grid-template-columns:1fr 2fr;gap:10px;margin-top:14px"><button id="ak-review-cancel" style="min-height:48px;border:0;border-radius:14px;background:#e2e8f0;font-weight:800">取消</button><button id="ak-review-save" style="min-height:48px;border:0;border-radius:14px;background:#06c755;color:white;font-weight:900">儲存至名片收藏</button></div></section>`;
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
    const payload={...card,userId:'',creatorId:window.currentUserProfile?.userId||'','建檔者ID':window.currentUserProfile?.userId||'','建檔人/備註':'掃描建立 by '+(window.currentUser?.name||'')};
    const result=await window.fetchAPI('saveCard',payload,true);if(!result||!result.rowId)throw new Error(result?.error||'儲存失敗');
    if(previewUrl)URL.revokeObjectURL(previewUrl);closeModal('akaffit-card-review');
    scanState={file:null,processedFile:null,jobId:'',ocr:null,localization:null,cropFile:null};
    window.showToast?.('客戶名片建立成功');window.refreshPointBalanceBadge?.();window.goPage?.('card');window.loadCardData?.({force:true});
  }catch(error){button.disabled=false;button.textContent='儲存至名片收藏';window.showToast?.(error.message||'名片儲存失敗',true)}
}

window.__A_KAFFIT_FULL_CARD_WORKFLOW__=true;
window.prepareBusinessCardImage=prepareBusinessCardImage;
window.recognizeCard=async function(input){
  const file=input?.files?.[0];if(!file)return;input.value='';
  try{
    const prepared=await prepareBusinessCardImage(file,'正面','collection');
    scanState={file,processedFile:prepared.file,jobId:prepared.jobId,ocr:null,localization:null,cropFile:null};
    showPreparedDraft();
  }catch(error){window.showToast?.(error.message||'名片圖片處理失敗',true)}
};
