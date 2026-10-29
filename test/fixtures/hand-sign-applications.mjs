// Synthetic clauses only. The user's actual private source documents never enter fixtures or Pages.
import {readFileSync} from 'node:fs';
import {rewardFixture,ADMIN,REWARD,OTHER,mapper} from './reward-unit-directory.mjs';
import {handleRewardApplications} from '../../worker/reward-applications.mjs';
import {handSignTemplates,sha256Text} from '../../worker/hand-sign-application-definition.mjs';
export {ADMIN,REWARD,OTHER,mapper};
export const fullFields=()=>({unit_name:'合成完整版公司',applicant_name:'測試申請人',address:'合成路1號',services:'合成生活服務',phone:'0912345678',line_contact:'test',assisted_partner:''});
export const partnerFields=()=>({unit_name:'合成共創公司',party_type:'company',representative_name:'合成代表',applicant_name:'合成代表',phone:'0912345678',address:'合成路2號',referrer_name:'',referrer_member_number:'',bank_name:'合成測試銀行',bank_code:'999',bank_branch:'合成分行',bank_account_holder:'合成共創公司',bank_account:'1234567890'});
export const signing=(id,kind)=>({preview_id:id,strokes:[Array.from({length:15},(_,i)=>[100+i*30,100+i%2*90])],electronic:true,terms:true,authority:true,...(kind==='partner'?{policy:true}:{fees:true,discount:true,separate_partner:true})});
export const syntheticTerms=(kind,pin=handSignTemplates[kind])=>({version:pin.version,title:pin.title,paragraphs:['合成測試條款，非正式契約全文。','第二段合成條款，不含真實銀行或私人文件內容。'],clarifications:['合成補充說明一。','合成補充說明二。','合成補充說明三。','合成補充說明四。']});
export async function seedHandSignTemplate(sql,kind){
 const terms=syntheticTerms(kind),json=JSON.stringify(terms),pin=handSignTemplates[kind];
 sql.prepare('INSERT INTO signing_application_templates(kind,version,title,terms_json,source_sha256,content_sha256,active) VALUES(?,?,?,?,?,?,1)').run(kind,pin.version,pin.title,json,pin.sourceSha256,await sha256Text(json));return terms;
}
export async function replaceHandSignTemplate(sql,kind,pin){
 const terms=syntheticTerms(kind,pin),json=JSON.stringify(terms);
 sql.prepare('UPDATE signing_application_templates SET version=?,title=?,terms_json=?,source_sha256=?,content_sha256=?,active=1 WHERE kind=?').run(pin.version,pin.title,json,pin.sourceSha256,await sha256Text(json),kind);
 return terms;
}
export async function handSignFixture(t){
 const f=rewardFixture();t.after(()=>f.sql.close());
 f.sql.exec("ALTER TABLE users ADD COLUMN referrer_id TEXT DEFAULT '';ALTER TABLE users ADD COLUMN member_number TEXT DEFAULT '';"+['0068_reward_applications.sql','0069_discount_applications.sql','0077_hand_sign_contracts.sql'].map(file=>readFileSync(new URL('../../migrations/'+file,import.meta.url),'utf8')).join('\n'));
 await seedHandSignTemplate(f.sql,'partner');await seedHandSignTemplate(f.sql,'full');
 const fetcher=async(url,options)=>{if(url!=='https://api.line.me/v2/profile'||options.redirect!=='manual')throw Error('Unexpected external request');const uid={admin:ADMIN,reward:REWARD,user:OTHER}[options.headers.Authorization.slice(7)];return uid?Response.json({userId:uid}):new Response('',{status:401});};
 f.call=async(kind='partner',path='',data,token='user')=>{
  const response=await handleRewardApplications(new Request('https://test/v1/'+kind+'-applications'+path,{method:data?'POST':'GET',headers:{Authorization:'Bearer '+token,...(data?{'Content-Type':'application/json'}:{})},body:data?JSON.stringify(data):undefined}),f.env,mapper,fetcher);
  return {http:response.status,...await response.json()};
 };
 f.submit=async(kind='partner',fields=kind==='partner'?partnerFields():fullFields())=>{const preview=await f.call(kind,'/preview',{fields});if(preview.http!==200)throw Error(JSON.stringify(preview));const payload=signing(preview.preview_id,kind);return {preview,payload,result:await f.call(kind,'/submit',payload)};};
 return f;
}
