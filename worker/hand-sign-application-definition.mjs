import {ShopError} from './store-shop.mjs';
import {resolveIslandMember,IslandAccessError} from './island-interaction-access.mjs';

// The actual source documents and legal text are provisioned privately into D1.
// No request can upload, choose another template version or change these source pins.
export const handSignTemplates=Object.freeze({
 partner:Object.freeze({version:'partner-115.10-hand-sign-2026-10-28-v1',sourceSha256:'224dac420aba1f0990f5de713e7125c4d9699a6a11f84ee6aed6f8ddee7da4aa',title:'點數通「共創夥伴」合作推展合約書'}),
 full:Object.freeze({version:'full-2026-10-28-v1',sourceSha256:'27fcbe65095b3a5fd06e2ec51b312d44b5e8ae5f60a241a880d1e03613cf1821',title:'雙向完整版申請書'})
});
const fail=(message,status=400)=>{throw new ShopError(message,status);};
export const sha256Text=async text=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),byte=>byte.toString(16).padStart(2,'0')).join('');
const descriptor=(name,label,maxLength,required=false,type='text',extra={})=>Object.freeze({name,label,type,maxLength,required,...extra});
export const handSignFields=Object.freeze({
 partner:Object.freeze([
  descriptor('unit_name','乙方姓名／公司名稱',150,true),
  descriptor('party_type','簽約身分',20,true,'select',{options:[{value:'natural_person',label:'自然人'},{value:'company',label:'公司／商號／法人'}]}),
  descriptor('representative_name','代表人（公司／商號／法人必填）',150),
  descriptor('applicant_name','本人／代表簽署人姓名',80,true),
  descriptor('phone','行動電話',30,true,'tel'),descriptor('address','聯絡地址',300,true),
  descriptor('referrer_name','推薦人姓名（依 CRM 紀錄）',150,false,'text',{readonly:true}),
  descriptor('referrer_member_number','推薦人會員編號（依 CRM 紀錄）',20,false,'text',{readonly:true}),
  descriptor('bank_name','獎金匯款銀行名稱',100,true),descriptor('bank_code','銀行代碼（三碼）',3,true),
  descriptor('bank_branch','分行名稱',100,true),descriptor('bank_account_holder','獎金收款戶名',150,true),
  descriptor('bank_account','銀行帳號',40,true)
 ]),
 full:Object.freeze([
  descriptor('unit_name','公司／店家名稱',120,true),descriptor('applicant_name','負責人／申請人',80,true),
  descriptor('address','地址',300,true),descriptor('services','主要商品／服務',600,true),
  descriptor('phone','行動電話',30,true,'tel'),descriptor('line_contact','LINE ID（選填）',80),
  descriptor('assisted_partner','協助申請之點數通共好夥伴（申報資訊，非 CRM 歸屬）',100)
 ])
});
const baseConfirmations={
 electronic:'我同意以電子方式簽署本次完整文件，手寫簽名與確認內容一併保存，並可下載本人副本。',
 terms:'我已閱讀本次文件的全部申請資料、完整條款及列明的補充說明，確認內容正確。',
 authority:'我是本人或有權代表本單位簽署的人員，所填資料及收款資料正確。我了解目前驗證 LINE 帳號，仍須平台核對。'
};
export const handSignConfirmations=Object.freeze({
 partner:Object.freeze({...baseConfirmations,policy:'我已核對115.10版共創夥伴契約及本次列明的制度決議；本次送出由平台審核，不會直接建立獎金資格。'}),
 full:Object.freeze({...baseConfirmations,fees:'我確認雙向完整版為一年期，未稅6,000元、營業稅300元、含稅6,300元；公司確認款項後另行開通。',discount:'我同意依完整申請書提供購物金折抵優惠，實際商品與折抵設定另行核對。',separate_partner:'我了解完整版使用申請不等同共創夥伴契約，若申請共創夥伴須另行簽署該份契約。'})
});

export async function readHandSignTemplate(db,kind){
 const pin=handSignTemplates[kind];if(!pin)fail('申請類型不正確');
 const row=await db.prepare('SELECT kind,version,title,terms_json,source_sha256,content_sha256,active FROM signing_application_templates WHERE kind=?').bind(kind).first();
 if(!row||row.active!==1||row.version!==pin.version||row.source_sha256!==pin.sourceSha256||row.title!==pin.title||typeof row.terms_json!=='string'||row.terms_json.length>150000||!/^[a-f0-9]{64}$/.test(row.content_sha256||''))fail('簽署範本尚未核對或已停止使用，請聯絡管理員',503);
 if(await sha256Text(row.terms_json)!==row.content_sha256)fail('簽署範本內容校驗不符，請聯絡管理員',503);
 let terms;try{terms=JSON.parse(row.terms_json);}catch{fail('簽署範本格式不正確，請聯絡管理員',503);}
 if(!terms||terms.version!==pin.version||terms.title!==pin.title||!Array.isArray(terms.paragraphs)||!terms.paragraphs.length||terms.paragraphs.some(p=>typeof p!=='string'||!p.trim()||p.length>10000)||!Array.isArray(terms.clarifications)||terms.clarifications.some(p=>typeof p!=='string'||!p.trim()||p.length>3000))fail('簽署範本格式不正確，請聯絡管理員',503);
 return {terms,template:{kind,version:row.version,source_sha256:row.source_sha256,content_sha256:row.content_sha256},fields:handSignFields[kind],field_labels:Object.fromEntries(handSignFields[kind].map(field=>[field.name,field.label])),confirmations:handSignConfirmations[kind],options:{}};
}

export function normalizeHandSignApplication(kind,value){
 const fields=handSignFields[kind];
 if(!fields||!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!fields.some(field=>field.name===key)))fail('申請資料格式不正確');
 const out={};
 for(const field of fields){
  const raw=value[field.name]??'';
  if(typeof raw!=='string'||raw.length>field.maxLength||/[\x00-\x1f\x7f]/.test(raw))fail('欄位格式或長度不正確');
  out[field.name]=raw.trim();if(field.required&&!out[field.name])fail('請完整填寫：'+field.label);
 }
 if(!/^(?:09\d{8}|\+8869\d{8})$/.test(out.phone.replace(/[ -]/g,'')))fail('請填寫正確的台灣行動電話');
 if(kind==='partner'){
  if(!['natural_person','company'].includes(out.party_type)||out.party_type==='company'&&!out.representative_name)fail('請完整填寫簽約身分及公司代表人');
  if(!/^\d{3}$/.test(out.bank_code)||!/^\d{5,30}$/.test(out.bank_account.replace(/[ -]/g,'')))fail('請填寫正確的三碼銀行代碼與帳號');
  out.bank_account=out.bank_account.replace(/[ -]/g,'');
  if(out.referrer_member_number&&!/^\d{11,20}$/.test(out.referrer_member_number))fail('推薦人會員編號格式不正確');
 }
 return out;
}

// Only the already stored CRM relationship may supply a referrer; never user input.
export async function handSignReferral(db,referrer){
 if(!referrer||referrer==='admin')return {required:false,name:'',memberNumber:'',proof:null};
 const read=async(sql,...args)=>{const result=await db.prepare(sql).bind(...args).all();if(result.success===false||!Array.isArray(result.results))throw Error('referrer unavailable');return result.results;};
 const source=await read('SELECT row_id,line_id FROM users WHERE line_id=? OR row_id=? LIMIT 3',referrer,referrer);
 if(source.length>1)fail('CRM推薦來源對應不唯一，請聯絡管理員',409);
 const sourceUid=source[0]?.line_id||referrer;
 if(!/^U[0-9a-f]{32}$/i.test(sourceUid))fail('CRM推薦來源尚未核對，請聯絡管理員',409);
 let member;try{member=await resolveIslandMember(db,sourceUid);}catch(error){if(error instanceof IslandAccessError)fail('CRM推薦來源身分尚未核對，請聯絡管理員',409);throw error;}
 if(!member)fail('CRM推薦來源尚未核對，請聯絡管理員',409);
 const members=await read('SELECT row_id,line_id,name,member_number FROM users WHERE line_id=? LIMIT 2',member.user.line_id);
 if(members.length!==1||!String(members[0].name||'').trim()||!/^\d{11,20}$/.test(members[0].member_number||''))fail('CRM推薦人姓名或會員編號尚未完整，請聯絡管理員核對',409);
 const current=members[0],name=String(current.name).trim();
 const links=await read("SELECT old_line_id,new_line_id FROM user_identity_links WHERE status='active' AND (old_line_id IN (?,?) OR new_line_id IN (?,?)) ORDER BY old_line_id,new_line_id LIMIT 3",sourceUid,current.line_id,sourceUid,current.line_id);
 if(links.length>1)fail('CRM推薦來源身分對應不唯一，請聯絡管理員',409);
 return {required:true,name,memberNumber:current.member_number,proof:{sourceRowId:source[0]?.row_id||'',sourceUid,memberRowId:current.row_id,memberUid:current.line_id,name,memberNumber:current.member_number,links}};
}

export const publicHandSignReferral=({required,name,memberNumber})=>({required,name,memberNumber});
export function handSignReferralGate(referral,rawReferrer){
 const proof=referral?.proof;if(!proof)return {sql:'1=1',args:[]};
 const sql=["EXISTS(SELECT 1 FROM users WHERE row_id=? AND line_id=? AND TRIM(name)=? AND member_number=?)","(SELECT count(*) FROM users WHERE line_id=?)=1"];
 const args=[proof.memberRowId,proof.memberUid,proof.name,proof.memberNumber,proof.memberUid];
 if(proof.sourceRowId){sql.push('EXISTS(SELECT 1 FROM users WHERE row_id=? AND line_id=?)','(SELECT count(*) FROM users WHERE line_id=? OR row_id=?)=1');args.push(proof.sourceRowId,proof.sourceUid,rawReferrer,rawReferrer);}
 else{sql.push('NOT EXISTS(SELECT 1 FROM users WHERE line_id=? OR row_id=?)');args.push(rawReferrer,rawReferrer);}
 const endpoints="status='active' AND (old_line_id IN (?,?) OR new_line_id IN (?,?))";
 sql.push(`(SELECT count(*) FROM user_identity_links WHERE ${endpoints})=?`);args.push(proof.sourceUid,proof.memberUid,proof.sourceUid,proof.memberUid,proof.links.length);
 if(proof.links.length){sql.push("EXISTS(SELECT 1 FROM user_identity_links WHERE status='active' AND old_line_id=? AND new_line_id=?)");args.push(proof.links[0].old_line_id,proof.links[0].new_line_id);}
 return {sql:sql.join(' AND '),args};
}

export function handSignTemplateGate(template){
 return {sql:'EXISTS(SELECT 1 FROM signing_application_templates WHERE kind=? AND version=? AND source_sha256=? AND content_sha256=? AND active=1)',args:[template.kind,template.version,template.source_sha256,template.content_sha256]};
}
