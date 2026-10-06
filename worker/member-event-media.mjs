// Member-only attachment storage. The existing image bucket may have a public domain,
// so bytes are encrypted; the per-object key remains in D1 and is never serialized.
export const MEMBER_MEDIA_LIMIT=Math.ceil(4*1024*1024/3)*4+20000;
const MAX=4*1024*1024,UUID='[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}';
const PATH=new RegExp('^/v1/member-events/('+UUID+')/media/('+UUID+')\\.(jpg|png|webp|pdf)$','i');
const types={jpg:'image/jpeg',png:'image/png',webp:'image/webp',pdf:'application/pdf'};
const fail=(code,message,status=400)=>{throw Object.assign(new Error(message),{code,status});};
export function mediaRef(value){
  try{const u=new URL(value),m=u.pathname.match(PATH);if(!m)return null;return {eventId:m[1],id:m[2],ext:m[3],path:u.pathname,url:u.origin+u.pathname,key:u.hash.slice(1),objectKey:'member-events/'+m[1]+'/'+m[2]};}catch{return null;}
}
export const visibleCover=value=>mediaRef(value)?.url||value;
function fileBytes(file){
  if(!file||typeof file!=='object'||Array.isArray(file)||Object.keys(file).some(k=>!['type','data'].includes(k)))fail('INVALID_MEDIA','請重新選擇活動 DM');
  const ext=Object.keys(types).find(k=>types[k]===file.type),data=file.data;
  if(!ext||typeof data!=='string'||data.length>MEMBER_MEDIA_LIMIT-19000)fail('INVALID_MEDIA','DM 須為 4 MB 內的 JPG／PNG／WebP／PDF');
  const m=data.match(/^data:([^;]+);base64,([A-Za-z0-9+/]+={0,2})$/);if(!m||m[1]!==file.type||m[2].length%4)fail('INVALID_MEDIA','DM 檔案格式不正確');
  let raw;try{raw=atob(m[2]);}catch{fail('INVALID_MEDIA','DM 檔案格式不正確');}
  const valid={jpg:raw.startsWith('\xff\xd8\xff'),png:raw.startsWith('\x89PNG\r\n\x1a\n'),webp:raw.startsWith('RIFF')&&raw.slice(8,12)==='WEBP',pdf:raw.startsWith('%PDF-')}[ext];
  if(!raw.length||raw.length>MAX||!valid)fail('INVALID_MEDIA','DM 內容或大小不正確');
  return {ext,bytes:Uint8Array.from(raw,c=>c.charCodeAt(0))};
}
export async function storeMedia(bucket,eventId,file){
  const {ext,bytes}=fileBytes(file);if(!bucket)fail('MEDIA_UNAVAILABLE','DM 儲存暫時無法使用，活動尚未發布',503);
  const id=crypto.randomUUID(),key=crypto.getRandomValues(new Uint8Array(32)),iv=crypto.getRandomValues(new Uint8Array(12));
  const encryptionKey=await crypto.subtle.importKey('raw',key,'AES-GCM',false,['encrypt']);
  const encrypted=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode(eventId+'/'+id)},encryptionKey,bytes));
  const payload=new Uint8Array(iv.length+encrypted.length);payload.set(iv);payload.set(encrypted,iv.length);
  const objectKey='member-events/'+eventId+'/'+id;
  const result=await bucket.put(objectKey,payload,{httpMetadata:{contentType:'application/octet-stream',cacheControl:'no-store'}});
  if(!result)fail('MEDIA_UNAVAILABLE','DM 儲存失敗，活動尚未發布',503);
  return {objectKey,url:'https://line-engine.fangwl591021.workers.dev/v1/member-events/'+eventId+'/media/'+id+'.'+ext+'#'+Array.from(key,v=>v.toString(16).padStart(2,'0')).join('')};
}
export async function readMedia(bucket,stored,url,headers){
  const ref=mediaRef(stored);if(!ref||ref.path!==url.pathname||!ref.key.match(/^[a-f0-9]{64}$/))fail('NOT_FOUND','找不到這份活動 DM',404);
  const object=await bucket?.get(ref.objectKey);if(!object||object.size>MAX+28)fail('NOT_FOUND','找不到這份活動 DM',404);
  const data=new Uint8Array(await object.arrayBuffer());if(data.length<29)fail('MEDIA_UNAVAILABLE','DM 暫時無法讀取',503);
  const key=await crypto.subtle.importKey('raw',Uint8Array.from(ref.key.match(/../g),v=>parseInt(v,16)),'AES-GCM',false,['decrypt']);
  const bytes=await crypto.subtle.decrypt({name:'AES-GCM',iv:data.slice(0,12),additionalData:new TextEncoder().encode(ref.eventId+'/'+ref.id)},key,data.slice(12));
  return new Response(bytes,{headers:{...headers,'Content-Type':types[ref.ext],'X-Content-Type-Options':'nosniff','Content-Disposition':'inline; filename="activity.'+ref.ext+'"'}});
}
