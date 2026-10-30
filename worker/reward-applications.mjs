import {authorizeStoreAdmin, DirectoryError} from './store-admin.mjs';
import {readJson, ShopError} from './store-shop.mjs';
import {discountTerms,discountOptions,discountConfirmations,normalizeDiscountApplication} from './discount-application-definition.mjs';
import {readHandSignTemplate,normalizeHandSignApplication,handSignConfirmations,handSignTemplateGate} from './hand-sign-application-definition.mjs';
const PATH='/v1/reward-applications';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UID=/^U[0-9a-f]{32}$/i;
const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type, Authorization','Access-Control-Allow-Methods':'GET, POST, OPTIONS'};
const fail=(message,status=400)=>{throw new ShopError(message,status);};
const reply=(data,status=200)=>Response.json(data,{status,headers});
export const rewardTerms=Object.freeze({version:'reward-unit-2026-10-23-v1',title:'購物金贈點單位合作申請書',paragraphs:[
 '申請加入點數通購物金贈點合作，透過活動、繳費、獎勵、回饋等方式發送購物金，共同創造更多消費與合作機會。',
 '購物金不只是回饋，更可以讓您的會員、員工、住戶、學員或客戶，開始尋找可以使用購物金的特約折抵店家，創造更多跨產業合作與消費機會。',
 '合作方式：申請加入贈點單位為 0 元。申請單位可依實際需求，透過點數通發送購物金給指定對象。購物金持有人可依平台公布之特約折抵店家及使用規則進行消費折抵。',
 '使用舉例：消費金額 1,000 元，購物金折抵 100 元，實際支付 900 元。實際折抵比例依各特約折抵店家公告為準，特約折抵店家至少提供 10% 優惠。',
 '本人／本單位確認申請加入點數通「購物金贈點單位」，並同意以下事項：',
 '一、本申請為免費加入，申請單位可依核准之功能發送購物金。',
 '二、購物金可依活動、繳費、獎勵、回饋等不同情境發送，實際發送方式依平台規則辦理。',
 '三、購物金之使用地點、折抵比例及相關優惠，以各特約折抵店家及平台當時公告為準。',
 '四、申請單位應提供正確資料，不得以購物金從事違法、虛偽或誤導性活動。',
 '五、智點通得提供必要之操作說明、活動資訊及合作服務；如平台規則調整，依最新公告辦理。',
 '六、申請單位如欲停止合作，可通知智點通辦理。',
 '智點通股份有限公司｜服務電話：02-6637-4988｜地址：新北市板橋區文化路二段486號3樓之2'
]});
export const confirmations=Object.freeze({
 electronic:'我同意以電子方式提出本申請，確認下方手寫簽名用於本次完整申請文件，並可於我的申請下載副本。',
 terms:'我已閱讀本次申請的全部資料與合作條款，確認內容正確。',
 authority:'我是申請人本人，且有權代表本申請單位提出申請。我了解目前僅驗證 LINE 帳號，尚須平台審核。'
});
export const applicationOptions=Object.freeze({
 unit_types:['企業','福委會','社區','商會','協會／公會','社團','學院／課程','公益單位','店家／品牌','其他'],
 recipients:['員工','會員','住戶','學員','客戶','活動參與者','來賓','其他'],
 scenarios:['員工福利','會員回饋','活動獎勵','繳費回饋','課程／活動參與','節慶回饋','客戶回饋','公益活動','其他']
});
const limits={unit_name:120,applicant_name:80,phone:30,line_contact:80,unit_types_other:100,recipients_other:100,scenarios_other:200};
function keys(value,allowed){if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!allowed.includes(k)))fail('申請資料格式不正確');}
export function normalizeApplication(value){
 keys(value,[...Object.keys(limits),...Object.keys(applicationOptions)]);const out={};
 for(const [key,max]of Object.entries(limits)){const v=value[key]??'';if(typeof v!=='string'||v.length>max||/[\x00-\x1f]/.test(v))fail('欄位格式或長度不正確');out[key]=v.trim();}
 if(!out.unit_name||!out.applicant_name||!out.phone)fail('請填寫單位、申請人與行動電話');
 if(!/^(?:09\d{8}|\+8869\d{8})$/.test(out.phone.replace(/[ -]/g,'')))fail('請填寫正確的台灣行動電話');
 for(const [key,options]of Object.entries(applicationOptions)){
  const v=value[key];if(!Array.isArray(v)||!v.length||v.length>options.length||new Set(v).size!==v.length||v.some(x=>!options.includes(x)))fail('請選擇單位類型、發送對象及使用情境');
  out[key]=options.filter(x=>v.includes(x));if(v.includes('其他')&&!out[key+'_other'])fail('勾選其他時請補充說明');
 }
 return out;
}
export function normalizeSigning(value,required=confirmations){
 keys(value,['preview_id','strokes',...Object.keys(required)]);
 if(!UUID.test(value.preview_id||''))fail('簽署預覽編號不正確');
 for(const k of Object.keys(required))if(value[k]!==true)fail('請完成所有閱讀、電子簽署及合作條款確認');
 const strokes=value.strokes;
 if(!Array.isArray(strokes)||!strokes.length||strokes.length>80)fail('請手寫簽名');
 let count=0,distance=0;
 for(const stroke of strokes){if(!Array.isArray(stroke)||stroke.length<2)fail('請完整手寫簽名');count+=stroke.length;
  for(let i=0;i<stroke.length;i++){const p=stroke[i];if(!Array.isArray(p)||p.length!==2||p.some(x=>!Number.isFinite(x))||p[0]<0||p[0]>1000||p[1]<0||p[1]>400)fail('簽名格式不正確');if(i)distance+=Math.hypot(p[0]-stroke[i-1][0],p[1]-stroke[i-1][1]);}
 }
 if(count<8||count>2500||distance<80)fail('請完整手寫簽名，不可空白或只點一下');
 return {preview_id:value.preview_id,strokes,...Object.fromEntries(Object.keys(required).map(k=>[k,true]))};
}
async function member(request,env,fetcher){
 const token=request.headers.get('Authorization')?.match(/^Bearer (\S+)$/i)?.[1];if(!token||token.length>4096)fail('請先登入 LINE',401);
 let response;try{response=await fetcher('https://api.line.me/v2/profile',{headers:{Authorization:'Bearer '+token},redirect:'manual',signal:AbortSignal.timeout(8000)});}catch{fail('LINE 驗證暫時無法完成',503);}
 if(response.status===401||response.status===403)fail('LINE 登入已失效，請重新登入',401);if(!response.ok)fail('LINE 驗證暫時無法完成',503);
 const profile=await readJson(response,8192);if(!UID.test(profile.userId||''))fail('LINE 登入身分無效',401);
 const db=env.ACTMASTER_DB.withSession?env.ACTMASTER_DB.withSession('first-primary'):env.ACTMASTER_DB;
 const rows=(await db.prepare('SELECT line_id,referrer_id FROM users WHERE line_id=? LIMIT 2').bind(profile.userId).all()).results;
 if(rows?.length!==1)fail('請先完成會員註冊或聯絡管理員確認身分',403);
 return {uid:profile.userId,db,referrer:rows[0].referrer_id||'',referrerRaw:rows[0].referrer_id??null};
}
const sha=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),x=>x.toString(16).padStart(2,'0')).join('');
async function record(db,id){return db.prepare('SELECT a.*,r.decision,r.note,r.reviewed_at FROM reward_applications a LEFT JOIN reward_application_reviews r ON r.application_id=a.id WHERE a.id=?').bind(id).first();}
function view(row){return {id:row.id,snapshot:JSON.parse(row.snapshot_json),content_sha256:row.content_sha256,signed_at:row.signed_at,status:row.decision||'pending',review_note:row.note||'',reviewed_at:row.reviewed_at||''};}
function reviewIdentityGate(proof){
 if(!Array.isArray(proof?.ids)||!proof.ids.length||proof.ids.length>8||!Array.isArray(proof.links)||proof.links.length>1)throw Error('Administrator identity proof unavailable');
 const ids="SELECT value FROM json_each(p.value,'$.ids')";
 const touches=`(l.old_line_id IN(${ids}) OR l.new_line_id IN(${ids}))`;
 return {sql:`EXISTS(SELECT 1 FROM json_each(?) p
  WHERE (SELECT COUNT(*) FROM users a WHERE ${['line_id','row_id','legacy_line_id','point_line_id'].map(field=>`a.${field} IN(${ids})`).join(' OR ')})=1
  AND (SELECT COUNT(*) FROM user_identity_links l WHERE l.status='active' AND ${touches})=json_array_length(p.value,'$.links')
  AND NOT EXISTS(SELECT 1 FROM user_identity_links l WHERE l.status='active' AND ${touches}
   AND NOT EXISTS(SELECT 1 FROM json_each(p.value,'$.links') known
    WHERE l.old_line_id=json_extract(known.value,'$.old_line_id') AND l.new_line_id=json_extract(known.value,'$.new_line_id'))))`,args:[JSON.stringify([proof])]};
}
export async function handleRewardApplications(request,env,profileMapper,fetcher=fetch){
 const url=new URL(request.url),paths={reward:PATH,discount:'/v1/discount-applications',partner:'/v1/partner-applications',full:'/v1/full-applications'};
 const kind=Object.keys(paths).find(kind=>url.pathname===paths[kind]||url.pathname.startsWith(paths[kind]+'/'));
 if(!kind)return null;
 const path=paths[kind],discount=kind==='discount',extended=kind==='partner'||kind==='full';
 const terms=discount?discountTerms:rewardTerms,consent=extended?handSignConfirmations[kind]:discount?discountConfirmations:confirmations,options=discount?discountOptions:applicationOptions;
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
 try{
  const route=url.pathname.slice(path.length),admin=route==='/admin'||route==='/review';
  if(!['','/template','/preview','/submit','/admin','/review'].includes(route))fail('查無申請功能',404);
  if(!['GET','POST'].includes(request.method))fail('不支援此操作',405);
  const {uid,db:authenticatedDb,actor,identityProof,referrer,referrerRaw}=admin?await authorizeStoreAdmin(request,env,profileMapper,fetcher):await member(request,env,fetcher);
  // Map only these three fixed identifiers to one of four server-owned table sets.
  // No request value or query selector can choose an SQL table.
  const db=kind==='reward'?authenticatedDb:{prepare:sql=>authenticatedDb.prepare(sql.replace(/\breward_application(s|_previews|_reviews)\b/g,kind+'_application$1'))};
  const allowed=route==='/admin'?['id','target','after']:route===''?['id','after']:[];
  for(const key of url.searchParams.keys())if(!allowed.includes(key)||url.searchParams.getAll(key).length!==1)fail('查詢條件不正確');
  if(request.method==='GET'){
   if(route==='/template'){
    if(extended){const definition=await readHandSignTemplate(authenticatedDb,kind);return reply({success:true,...definition,...(kind==='partner'?{attribution_mode:'applicant_performance_v1'}:{})});}
    return reply({success:true,terms,confirmations:consent,options});
   }
   if(!['','/admin'].includes(route))fail('不支援此操作',405);
   const id=url.searchParams.get('id'),target=url.searchParams.get('target')||'',after=url.searchParams.get('after')||'';
   if((id&&!UUID.test(id))||(after&&!UUID.test(after))||(target&&!UID.test(target)))fail('查詢編號不正確');
   if(id){const row=await record(db,id);if(!row||(!admin&&row.owner_uid!==uid)||(target&&row.owner_uid!==target))fail('查無可讀取的申請',404);return reply({success:true,application:view(row)});}
   const owner=admin?target:uid;
   const rows=(await db.prepare("SELECT a.id,a.unit_name,a.applicant_name,a.signed_at,COALESCE(r.decision,'pending') AS status FROM reward_applications a LEFT JOIN reward_application_reviews r ON r.application_id=a.id WHERE (?='' OR a.owner_uid=?) AND a.id>? ORDER BY a.id LIMIT 21").bind(owner,owner,after).all()).results;
   return reply({success:true,applications:rows.slice(0,20),next:rows.length>20?rows[19].id:''});
  }
  if(!['/preview','/submit','/review'].includes(route))fail('不支援此操作',405);
  if(url.search)fail('送出不可附加查詢參數');
  if(!/^application\/json(?:;|$)/i.test(request.headers.get('Content-Type')||''))fail('請使用 JSON 資料',415);
  const data=await readJson(request,100000),now=new Date().toISOString();
  if(route==='/preview'){
   keys(data,['fields']);const fields=extended?normalizeHandSignApplication(kind,data.fields):(discount?normalizeDiscountApplication:normalizeApplication)(data.fields),id=crypto.randomUUID();
   const definition=extended?await readHandSignTemplate(authenticatedDb,kind):null;
   const snapshot={...(kind!=='reward'?{form_kind:kind}:{}),terms:definition?.terms||terms,confirmations:consent,fields,referrer_uid:referrer||'',...(definition?{template:definition.template,field_labels:definition.field_labels}:{}),...(kind==='partner'?{attribution_mode:'applicant_performance_v1'}:{}),assurance:'LINE 帳號驗證；非實名或憑證式數位簽章'};
   const expires=new Date(Date.now()+30*60*1000).toISOString();
   if(extended){
    const gate=handSignTemplateGate(definition.template);
    const memberGate=kind==='partner'?'EXISTS(SELECT 1 FROM users WHERE line_id=?)':'EXISTS(SELECT 1 FROM users WHERE line_id=? AND referrer_id IS ?)';
    const memberArgs=kind==='partner'?[uid]:[uid,referrerRaw];
    const result=await db.prepare(`INSERT INTO reward_application_previews(owner_uid,id,snapshot_json,expires_at)
     SELECT ?,?,?,? WHERE ${gate.sql} AND ${memberGate}
     ON CONFLICT(owner_uid) DO UPDATE SET id=excluded.id,snapshot_json=excluded.snapshot_json,expires_at=excluded.expires_at`).bind(uid,id,JSON.stringify(snapshot),expires,...gate.args,...memberArgs).run();
    if(result.success===false)throw Error('preview unavailable');
    if(!result.meta?.changes)fail('簽署範本或推薦資料已變更，請重新載入',409);
   }else await db.prepare('INSERT INTO reward_application_previews(owner_uid,id,snapshot_json,expires_at) VALUES(?,?,?,?) ON CONFLICT(owner_uid) DO UPDATE SET id=excluded.id,snapshot_json=excluded.snapshot_json,expires_at=excluded.expires_at').bind(uid,id,JSON.stringify(snapshot),expires).run();
   return reply({success:true,preview_id:id,snapshot,expires_at:expires});
  }
  if(route==='/submit'){
   const signing=normalizeSigning(data,consent),serialized=JSON.stringify(signing),old=await record(db,signing.preview_id);
   if(old){if(old.owner_uid!==uid||old.request_json!==serialized)fail('此編號已送出不同內容，請重新開啟申請',409);return reply({success:true,application:view(old),replayed:true});}
   const draft=await db.prepare('SELECT * FROM reward_application_previews WHERE owner_uid=? AND id=? AND expires_at>?').bind(uid,signing.preview_id,now).first();
   if(!draft)fail('預覽已失效或資料已變更，請重新預覽並簽名',409);
   const originalSnapshot=JSON.parse(draft.snapshot_json);
   let extraSql='',extraArgs=[];
   if(extended){
    const currentTemplate=await readHandSignTemplate(authenticatedDb,kind),template=originalSnapshot.template;
    if(originalSnapshot.form_kind!==kind||!template||JSON.stringify(template)!==JSON.stringify(currentTemplate.template)||(kind!=='partner'&&originalSnapshot.referrer_uid!==(referrer||'')))fail('簽署範本或推薦資料已變更，請重新預覽',409);
    const gate=handSignTemplateGate(template);extraSql=` AND ${gate.sql}`;extraArgs=[...gate.args];
    if(kind==='partner'){
     if(originalSnapshot.attribution_mode!=='applicant_performance_v1')fail('推薦人欄位已更新，請重新填寫、預覽並簽名',409);
     normalizeHandSignApplication(kind,originalSnapshot.fields);
     extraSql+=' AND EXISTS(SELECT 1 FROM users WHERE line_id=?)';extraArgs.push(uid);
    }else{
     extraSql+=' AND EXISTS(SELECT 1 FROM users WHERE line_id=? AND referrer_id IS ?)';extraArgs.push(uid,referrerRaw);
    }
   }
   const snapshot={...originalSnapshot,signing,signer_uid:uid,signed_at:now};
   const json=JSON.stringify(snapshot),hash=await sha(json);
   const result=await db.prepare(`INSERT INTO reward_applications(id,owner_uid,unit_name,applicant_name,snapshot_json,request_json,content_sha256,signed_at)
    SELECT ?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM reward_application_previews WHERE owner_uid=? AND id=? AND expires_at>?)${extraSql} ON CONFLICT(id) DO NOTHING`).bind(signing.preview_id,uid,snapshot.fields.unit_name,snapshot.fields.applicant_name,json,serialized,hash,now,uid,signing.preview_id,now,...extraArgs).run();
   if(result.success===false)throw Error('write unavailable');
   const saved=await record(db,signing.preview_id);if(!saved||saved.owner_uid!==uid||saved.request_json!==serialized)fail('申請內容已變更，請重新核對',409);
   return reply({success:true,application:view(saved),replayed:!(result.meta?.changes>0)});
  }
  keys(data,['id','decision','note']);
  if(!UUID.test(data.id||'')||!['accepted','rejected'].includes(data.decision)||typeof data.note!=='string'||!data.note.trim()||data.note.length>1000)fail('請選擇審核結果並填寫說明');
  if(!await record(db,data.id))fail('查無申請',404);
  const authFields=['row_id','line_id','legacy_line_id','point_line_id','role','name','phone'];
  const identityGate=reviewIdentityGate(identityProof);
  const result=await db.prepare(`INSERT INTO reward_application_reviews(application_id,reviewer_uid,decision,note,reviewed_at)
    SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM users WHERE ${authFields.map(k=>k+' IS ?').join(' AND ')}) AND ${identityGate.sql} ON CONFLICT(application_id) DO NOTHING`).bind(data.id,uid,data.decision,data.note.trim(),now,...authFields.map(k=>actor[k]??null),...identityGate.args).run();
  if(result.success===false)throw Error('review unavailable');
  const review=await db.prepare('SELECT * FROM reward_application_reviews WHERE application_id=?').bind(data.id).first();
  if(!review||review.reviewer_uid!==uid||review.decision!==data.decision||review.note!==data.note.trim())fail('審核狀態或管理員權限已變更，請重新載入',409);
  return reply({success:true,application:view(await record(db,data.id))});
 }catch(error){
  if(error instanceof ShopError||error instanceof DirectoryError)return reply({success:false,error:error.message},error.status||400);
  console.error(JSON.stringify({event:kind+'_application_unavailable'}));return reply({success:false,error:'申請服務暫時無法完成，請重試或重新開啟確認結果'},503);
 }
}
