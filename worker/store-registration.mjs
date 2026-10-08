// Fixed, public government endpoints only. A tax number is a lookup key, not ownership proof.
import {boundedText} from './partner-onboarding-ai.mjs';
const ROOT='https://data.gcis.nat.gov.tw/od/data/api/';
export const registryApis={company:'5F64D864-61CB-4D0D-8AD9-492047CC1EA6',business:'426D5542-5F05-43EB-83F9-F1300F14E1F1',items:'236EE382-4942-41A9-BD03-CA0709025E7C'};
export class RegistrationError extends Error {constructor(message,status=503){super(message);this.status=status;}}
const text=value=>typeof value==='string'?value.trim():'';
function urlFor(kind,taxId){const url=new URL(ROOT+registryApis[kind]);url.search=new URLSearchParams({'$format':'json','$filter':`${kind==='business'?'President_No':'Business_Accounting_NO'} eq ${taxId}`,'$skip':'0','$top':'2'}).toString();return url.href;}
async function readRows(kind,taxId,fetcher,signal){
  const url=urlFor(kind,taxId);
  const response=await fetcher(url,{redirect:'manual',credentials:'omit',signal,headers:{Accept:'application/json'}});
  if(!response.ok){await response.body?.cancel();throw new RegistrationError('官方登記查詢服務暫時無法使用；請稍後再試，尚未帶入任何資料。');}
  if(!/^application\/json(?:;|$)/i.test(response.headers.get('Content-Type')||'')){await response.body?.cancel();throw new RegistrationError('官方登記查詢回覆異常，請稍後再試。');}
  let raw;try{raw=await boundedText(response,65536);}catch{throw new RegistrationError('官方登記查詢回覆過大或不完整，請稍後再試。');}
  let rows;try{rows=JSON.parse(raw);}catch{throw new RegistrationError('官方登記查詢回覆異常，請稍後再試。');}
  // The platform may return an authorization/IP error with HTTP 200. Never treat it as an empty result.
  if(!Array.isArray(rows)||rows.length>2||rows.some(row=>!row||typeof row!=='object'||Array.isArray(row)))throw new RegistrationError('官方登記服務拒絕介接或回覆異常；請聯絡管理員確認官方介接設定。');
  return {url,rows};
}
export async function lookupStoreRegistration(taxId,fetcher=fetch){
  if(typeof taxId!=='string'||!/^\d{8}$/.test(taxId))throw new RegistrationError('統一編號請填 8 位數字。',400);
  const signal=AbortSignal.timeout(12000);
  for(const kind of ['company','business']){
    const {url,rows}=await readRows(kind,taxId,fetcher,signal);
    if(!rows.length)continue;
    const idKey=kind==='company'?'Business_Accounting_NO':'President_No';
    if(rows.length!==1||text(rows[0][idKey])!==taxId)throw new RegistrationError('官方回覆的統編無法核對，未帶入任何公司資料。',502);
    const row=rows[0],name=text(row[kind==='company'?'Company_Name':'Business_Name']),address=text(row[kind==='company'?'Company_Location':'Business_Address']);
    if(name.length<2||name.length>80||address.length>200||/[\u0000-\u001f]/.test(name+address))throw new RegistrationError('官方登記欄位不完整，請核對原始資料。',502);
    const status=text(row[kind==='company'?'Company_Status_Desc':'Business_Current_Status_Desc']).slice(0,100);
    // Whitelist only the public facts needed by this form; exclude responsible person and capital.
    const source=JSON.stringify({taxId,name,address,status});
    return {taxId,name,address,status,kind,page:{url,source},result:{success:true,match:'matched',fields:{name,description:'',category:'',address,phone:'',hours:''},sources:[{url,title:'經濟部商工登記資料'}],warnings:[`已核對統編 ${taxId}${status?'；登記狀態：'+status:''}。`,'此為登記地址，可能不同於實際營業／分店地址，請核對後帶入。','官方基本資料未提供電話、營業時間與店家介紹，請自行補上或使用 AI 補充。']}};
  }
  return null;
}
export async function registrationItemPage(registration,fetcher=fetch){
  if(registration.kind!=='company')return null;
  const {url,rows}=await readRows('items',registration.taxId,fetcher,AbortSignal.timeout(8000));
  if(rows.length!==1||text(rows[0].Business_Accounting_NO)!==registration.taxId||text(rows[0].Company_Name)!==registration.name)return null;
  const items=rows[0].Cmp_Business;if(!Array.isArray(items))return null;
  const descriptions=items.slice(0,80).map(item=>text(item?.Business_Item_Desc)).filter(item=>item&&item.length<=120);
  return descriptions.length?{url,source:JSON.stringify({taxId:registration.taxId,name:registration.name,registeredBusinessItems:descriptions})}:null;
}
