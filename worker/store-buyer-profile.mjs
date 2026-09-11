// Private reusable shopping contact. Owner is supplied only by verified commerce authentication.
export class BuyerProfileError extends Error {constructor(message,status=400){super(message);this.status=status;}}
const fail=(message,status)=>{throw new BuyerProfileError(message,status);};
const columns='name,phone,email,postal_code,city,district,address,carrier,store_info,version,updated_at';
function text(data,key,max,required=true){
 const value=data?.[key]??'';
 if(typeof value!=='string'||value.length>max||/[\u0000-\u001f]/.test(value))fail(key+' 格式錯誤');
 if(required&&!value.trim())fail(key+' 不可空白');return value.trim();
}
export function normalizeBuyerProfile(data){
 const carrier=data.carrier??'POST';
 if(!['POST','FAMILY','SEVEN'].includes(carrier))fail('請選擇郵寄、全家或 7-11 店到店');
 const post=carrier==='POST';
 const profile={name:text(data,'name',80),phone:text(data,'phone',30).replace(/[ ()-]/g,'').replace(/^\+8860?/,'0'),email:text(data,'email',254,false),postal_code:text(data,'postal_code',6,false),city:text(data,'city',20,post),district:text(data,'district',20,post),address:text(data,'address',200,post),carrier,store_info:text(data,'store_info',120,!post)};
 if(!/^09\d{8}$/.test(profile.phone))fail('手機須為 09 開頭的 10 碼號碼');
 if(profile.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.email))fail('Email 格式錯誤');
 if(profile.postal_code&&!/^\d{3,6}$/.test(profile.postal_code))fail('郵遞區號須為 3 至 6 碼');
 return profile;
}
export async function readBuyerProfile(db,owner){
 return db.prepare('SELECT '+columns+' FROM store_buyer_profiles WHERE owner_uid=?').bind(owner).first();
}
export async function saveBuyerProfile(db,owner,data){
 if(data.consent!==true)fail('請同意儲存私人網購資料');
 const profile=normalizeBuyerProfile(data),version=data.version;
 if(!Number.isSafeInteger(version)||version<0||version>1000000000)fail('資料版本不正確');
 const now=new Date().toISOString();
 const result=version===0
  ?await db.prepare('INSERT INTO store_buyer_profiles(owner_uid,name,phone,email,postal_code,city,district,address,carrier,store_info,updated_at,consented_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(owner_uid) DO NOTHING').bind(owner,...Object.values(profile),now,now).run()
  :await db.prepare('UPDATE store_buyer_profiles SET name=?,phone=?,email=?,postal_code=?,city=?,district=?,address=?,carrier=?,store_info=?,updated_at=?,consented_at=?,version=version+1 WHERE owner_uid=? AND version=?').bind(...Object.values(profile),now,now,owner,version).run();
 if(!result.meta.changes)fail('網購人資料已變更，請重新讀取後再儲存',409);
 return readBuyerProfile(db,owner);
}
