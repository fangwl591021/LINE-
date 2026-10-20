// Public, explicitly reviewed snapshots of CRM reward units. Never awards points.
import {authorizeStoreAdmin,DirectoryError} from './store-admin.mjs';
import {readJson,ShopError} from './store-shop.mjs';
import {requireListingReview,ListingReviewError,listingReviewFailure} from './store-listing-review.mjs';
const PATH='/v1/reward-units',ADMIN=PATH+'/admin';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,UID=/^U[0-9a-f]{32}$/i;
const FIELDS=['name','description','image_url','phone','address','website_url','reward_terms','status'];
const LIMITS=[160,2000,500,40,300,500,500,10];
const ACTOR=['row_id','line_id','legacy_line_id','point_line_id','role','name','phone'];
const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type, Authorization','Access-Control-Allow-Methods':'GET, POST, OPTIONS'};
const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers});
const fail=(code,message,status=400)=>{throw new DirectoryError(code,message,status);};
const publicView=row=>Object.fromEntries(['id',...FIELDS.filter(k=>k!=='status')].map(k=>[k,row[k]]));
async function rows(db,query,args=[]){const r=await db.prepare(query).bind(...args).all();if(r.success===false||!Array.isArray(r.results))throw Error('Reward directory unavailable');return r.results;}
function query(params,allowed){if([...params.keys()].some(k=>!allowed.includes(k)||params.getAll(k).length!==1))fail('INVALID_QUERY','贈點單位查詢條件不正確');}
function normalize(data){
  const value=data?.unit;
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!FIELDS.includes(k)))fail('INVALID_FIELDS','請核對贈點單位公開欄位');
  const unit={};
  FIELDS.forEach((key,i)=>{if(typeof value[key]!=='string'||value[key].length>LIMITS[i])fail('INVALID_FIELDS','公開資料缺漏或過長');unit[key]=value[key].trim();});
  if(unit.name.length<2||!['draft','active','hidden'].includes(unit.status))fail('INVALID_FIELDS','請填寫單位名稱及正確公開狀態');
  for(const key of ['image_url','website_url'])if(unit[key]){let url;try{url=new URL(unit[key]);}catch{fail('INVALID_URL','圖片與網站請使用完整 HTTPS 網址');}if(url.protocol!=='https:'||url.username||url.password)fail('INVALID_URL','圖片與網站只允許 HTTPS 網址');unit[key]=url.href;}
  if(unit.phone&&!/^\+?\d{8,15}$/.test(unit.phone.replace(/[\s().-]/g,'')))fail('INVALID_PHONE','請填寫有效公司電話，勿填私人會員資料');
  if(unit.status==='active'&&(data.confirmed_public!==true||unit.description.length<8||unit.reward_terms.length<5||(!unit.phone&&!unit.website_url)))fail('PUBLIC_CONFIRMATION_REQUIRED','公開前請核對介紹、贈點條件、公司聯絡方式並勾選公開確認');
  return unit;
}
async function receipt(db,key,uid,payload){
  const row=(await rows(db,'SELECT actor_uid,payload_json,unit_id,new_version FROM reward_unit_publication_audit WHERE request_key=?',[key]))[0];
  if(!row)return null;
  if(row.actor_uid!==uid||row.payload_json!==payload)fail('REQUEST_CONFLICT','儲存編號已使用，請重新開啟表單',409);
  return {success:true,id:row.unit_id,version:row.new_version};
}
async function target(db,id){
  const found=await rows(db,'SELECT row_id,line_id,role,name FROM users WHERE line_id=? LIMIT 2',[id]);
  if(found.length!==1||found[0].role!=='reward')fail('REWARD_ROLE_REQUIRED','此 CRM 帳號目前不是贈點用戶，不能刊登贈點單位',403);
  return found[0];
}
async function adminGet(db,id){
  const member=await target(db,id),saved=(await rows(db,'SELECT * FROM reward_unit_publications WHERE target_uid=?',[id]))[0];
  if(saved)return {success:true,member_name:member.name,unit:{...publicView(saved),status:saved.status,version:saved.version}};
  // Source is a strict owned personal card only; never use scanned contacts or users.phone.
  const card=(await rows(db,`SELECT company_name,services,office_phone,address,website FROM card_contacts
    WHERE line_id=? AND profile_user_id=? AND source_type='self_profile'
      AND (owner_user_id='' OR owner_user_id=?) AND archived_at='' AND merged_into_row_id=''
    ORDER BY updated_at DESC,row_id DESC LIMIT 1`,[id,id,id]))[0]||{};
  const bounded=(value,max)=>String(value||'').trim().slice(0,max);
  return {success:true,member_name:member.name,unit:{id:'',version:0,status:'draft',name:bounded(card.company_name,160),description:bounded(card.services,2000),phone:bounded(card.office_phone,40),address:bounded(card.address,300),website_url:bounded(card.website,500),image_url:'',reward_terms:''}};
}
async function save(request,env,db,uid,actor,fetcher){
  const data=await readJson(request);
  if(Object.keys(data).some(k=>!['target_uid','version','request_key','unit','confirmed_public'].includes(k))||typeof data.target_uid!=='string'||!UID.test(data.target_uid)||typeof data.request_key!=='string'||!UUID.test(data.request_key)||!Number.isSafeInteger(data.version)||data.version<0||data.version>1e9)fail('INVALID_REQUEST','儲存資料不正確，請重新開啟表單');
  const unit=normalize(data),payload=JSON.stringify({target_uid:data.target_uid,version:data.version,unit,confirmed_public:data.confirmed_public===true});
  const previous=await receipt(db,data.request_key,uid,payload);if(previous)return {...previous,replayed:true};
  const member=await target(db,data.target_uid),old=(await rows(db,'SELECT * FROM reward_unit_publications WHERE target_uid=?',[data.target_uid]))[0];
  if((old?.version||0)!==data.version)fail('VERSION_CONFLICT','資料已更新，請重新開啟後再修改',409);
  const id=old?.id||crypto.randomUUID();
  await requireListingReview({value:{status:unit.status,name:unit.name,description:[unit.description,unit.address].filter(Boolean).join('\n'),image_url:unit.image_url,website:unit.website_url,policy_note:unit.reward_terms},scope:'reward-unit:'+id,uid,env,fetcher});
  const auditId=crypto.randomUUID(),now=new Date().toISOString();
  const gate=`EXISTS(SELECT 1 FROM users a WHERE ${ACTOR.map(k=>'a.'+k+' IS ?').join(' AND ')})
    AND EXISTS(SELECT 1 FROM users t WHERE t.row_id=? AND t.line_id=? AND t.role='reward')
    AND COALESCE((SELECT version FROM reward_unit_publications WHERE target_uid=?),0)=?`;
  const result=await db.batch([
    db.prepare(`INSERT INTO reward_unit_publication_audit(id,request_key,actor_uid,target_uid,unit_id,old_version,new_version,payload_json,before_json,after_json,created_at)
      SELECT ?,?,?,?,?,?,?,?,?,?,? WHERE ${gate} ON CONFLICT(request_key) DO NOTHING`)
      .bind(auditId,data.request_key,uid,data.target_uid,id,data.version,data.version+1,payload,JSON.stringify(old?{...publicView(old),status:old.status}:null),JSON.stringify(unit),now,...ACTOR.map(k=>actor[k]??null),member.row_id,member.line_id,data.target_uid,data.version),
    db.prepare(`INSERT INTO reward_unit_publications(id,target_uid,${FIELDS.join(',')},version,updated_at)
      SELECT ?,?,${FIELDS.map(()=>'?').join(',')},?,? WHERE EXISTS(SELECT 1 FROM reward_unit_publication_audit WHERE id=?)
      ON CONFLICT(target_uid) DO UPDATE SET ${FIELDS.map(k=>k+'=excluded.'+k).join(',')},version=excluded.version,updated_at=excluded.updated_at`)
      .bind(id,data.target_uid,...FIELDS.map(k=>unit[k]),data.version+1,now,auditId)
  ]);
  if(result.length!==2||result.some(r=>r.success===false))throw Error('Reward publication unavailable');
  const saved=await receipt(db,data.request_key,uid,payload);
  if(!saved)fail('VERSION_CONFLICT','角色或資料已變更，尚未儲存，請重新開啟表單',409);
  return {...saved,replayed:!(result[1].meta?.changes>0)};
}
export async function handleRewardUnits(request,env,profileMapper,fetcher=fetch){
  const url=new URL(request.url);if(![PATH,ADMIN].includes(url.pathname))return null;
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
  if(!['GET',...(url.pathname===ADMIN?['POST']:[])].includes(request.method))return reply({success:false,error:'不支援此操作'},405);
  try{
    if(url.pathname===ADMIN){
      const {uid,db,actor}=await authorizeStoreAdmin(request,env,profileMapper,fetcher);
      if(request.method==='POST'){if(url.search)fail('INVALID_QUERY','儲存不可附加查詢參數');return reply(await save(request,env,db,uid,actor,fetcher));}
      query(url.searchParams,['target']);const id=url.searchParams.get('target');if(!UID.test(id||''))fail('INVALID_TARGET','請從 CRM 贈點帳號開啟');
      return reply(await adminGet(db,id));
    }
    const params=url.searchParams;query(params,['id','q','after']);
    const id=params.get('id')||'',q=(params.get('q')||'').trim(),after=params.get('after')||'';
    if((params.has('id')&&(!UUID.test(id)||params.size!==1))||(after&&!UUID.test(after))||q.length>80)fail('INVALID_QUERY','贈點單位查詢條件不正確');
    const db=env.ACTMASTER_DB?.withSession?env.ACTMASTER_DB.withSession('first-primary'):env.ACTMASTER_DB;if(!db)throw Error('Database unavailable');
    const units=await rows(db,`SELECT p.id,${FIELDS.filter(k=>k!=='status').map(k=>'p.'+k).join(',')} FROM reward_unit_publications p
      WHERE p.status='active' AND (SELECT count(*) FROM users u WHERE u.line_id=p.target_uid)=1 AND EXISTS(SELECT 1 FROM users u WHERE u.line_id=p.target_uid AND u.role='reward')
      AND (?='' OR p.id=?) AND p.id>? AND (?='' OR instr(lower(p.name),lower(?))>0 OR instr(lower(p.description),lower(?))>0 OR instr(p.address,?)>0)
      ORDER BY p.id LIMIT 21`,[id,id,after,q,q,q,q]);
    if(id)return units[0]?reply({success:true,unit:publicView(units[0])}):reply({success:false,code:'NOT_FOUND',error:'此贈點單位尚未公開或已停止展示'},404);
    return reply({success:true,units:units.slice(0,20).map(publicView),next:units.length>20?units[19].id:''});
  }catch(error){
    if(error instanceof ListingReviewError)return reply(listingReviewFailure(error),error.status);
    if(error instanceof DirectoryError||error instanceof ShopError)return reply({success:false,code:error.code||'INVALID_REQUEST',error:error.message},error.status);
    console.error(JSON.stringify({event:'reward_unit_directory_error',stage:url.pathname===ADMIN?'admin':'public'}));
    return reply({success:false,code:'REWARD_DIRECTORY_UNAVAILABLE',error:'贈點單位服務暫時無法完成，請重試確認；未確認儲存成功'},503);
  }
}
