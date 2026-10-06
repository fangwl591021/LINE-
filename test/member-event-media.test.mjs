import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fixture} from './helpers/member-events-fixture.mjs';
import {handleMemberEvents} from '../worker/member-hosted-events.mjs';
import {mediaRef} from '../worker/member-event-media.mjs';
const png={type:'image/png',data:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII='};
function setup(t){const f=fixture(t),objects=new Map(),puts=[];f.env.IMG_BUCKET={async put(key,bytes,metadata){objects.set(key,{bytes:new Uint8Array(bytes),metadata});puts.push(key);return {key};},async get(key){const v=objects.get(key);return v?{size:v.bytes.length,arrayBuffer:async()=>v.bytes.slice().buffer}:null;},async delete(key){objects.delete(key);}};return {...f,objects,puts};}
function fileRequest(f,value,member='guest'){return handleMemberEvents(new Request(value,{headers:member?{Authorization:'Bearer '+member}:{}}),f.env,f.fetcher);}
test('explicit publish saves one encrypted DM, all registered members see thumbnail reference, never encryption key',async t=>{
  const f=setup(t),e=await f.create({...f.input(),dmFile:png});assert.equal(f.objects.size,1);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM member_hosted_events').get().n,1);assert.match(e.coverUrl,/\/media\/.*\.png$/);assert.equal(e.status,'active');
  const row=f.sql.prepare('SELECT cover_url FROM member_hosted_events').get(),ref=mediaRef(row.cover_url);assert.match(ref.key,/^[a-f0-9]{64}$/);const stored=f.objects.get(ref.objectKey);assert.notDeepEqual(stored.bytes,Buffer.from(png.data.split(',')[1],'base64'));assert.equal(stored.metadata.httpMetadata.contentType,'application/octet-stream');
  for(const member of ['host','guest','other','old']){const result=await f.api('/overview',{member});assert.equal(result.sessions[0].coverUrl,e.coverUrl);assert.doesNotMatch(JSON.stringify(result),new RegExp(ref.key));}
  const response=await fileRequest(f,e.coverUrl);assert.equal(response.status,200);assert.equal(response.headers.get('Content-Type'),'image/png');assert.equal(response.headers.get('Cache-Control'),'no-store');assert.equal(response.headers.get('X-Content-Type-Options'),'nosniff');assert.deepEqual(Buffer.from(await response.arrayBuffer()),Buffer.from(png.data.split(',')[1],'base64'));
  for(const table of ['activities','personal_tasks','points_ledger'])assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM '+table).get().n,0);
});
test('invalid/unregistered identities, unpublished/arbitrary/wrong-event/replaced attachments fail closed',async t=>{
  const f=setup(t),input=f.input(),e=await f.create({...input,dmFile:png});for(const member of ['', 'invalid'])assert.equal((await fileRequest(f,e.coverUrl,member)).status,401);
  assert.equal((await fileRequest(f,e.coverUrl.replace(e.id,crypto.randomUUID()))).status,404);assert.equal((await fileRequest(f,e.coverUrl.replace(mediaRef(e.coverUrl).id,crypto.randomUUID()))).status,404);
  const changed=await f.api('/'+e.id+'/update',{data:{...input,requestKey:crypto.randomUUID(),revision:0,coverUrl:e.coverUrl,dmFile:png}});assert.equal(changed.success,true);assert.equal(changed.event.id,e.id);assert.notEqual(changed.event.coverUrl,e.coverUrl);assert.equal((await fileRequest(f,e.coverUrl)).status,404);assert.equal((await fileRequest(f,changed.event.coverUrl)).status,200);
  const rejected=await f.api('/events',{member:'other',data:{...f.input(),coverUrl:changed.event.coverUrl}});assert.equal(rejected.code,'INVALID_COVER');assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM member_hosted_events').get().n,1);
});
test('editing without replacing media preserves its private key; owners only, stale and retries do not upload',async t=>{
  const f=setup(t),input=f.input(),data={...input,dmFile:png},e=await f.create(data);assert.equal((await f.create(data)).id,e.id);assert.equal(f.puts.length,1);
  const update={...input,title:'更新說明',requestKey:crypto.randomUUID(),revision:0,coverUrl:e.coverUrl};assert.equal((await f.api('/'+e.id+'/update',{member:'guest',data:{...update,dmFile:png}})).httpStatus,403);assert.equal(f.puts.length,1);
  assert.equal((await f.api('/'+e.id+'/update',{data:update})).event.coverUrl,e.coverUrl);assert.equal((await fileRequest(f,e.coverUrl)).status,200);assert.equal((await f.api('/'+e.id+'/update',{data:{...update,requestKey:crypto.randomUUID(),dmFile:png}})).code,'STALE_EVENT');assert.equal(f.puts.length,1);
});
test('bad type/header/base64/oversize and text limits never upload or publish',async t=>{
  const f=setup(t);for(const file of [null,{}, {...png,extra:'x'},{...png,type:'image/svg+xml'},{...png,data:'https://example.com/a.png'},{...png,data:'data:image/png;base64,AAAA'},{...png,data:'data:image/png;base64,?bad'},{...png,data:'data:image/png;base64,'+'A'.repeat(6*1024*1024)}]){const r=await f.api('/events',{data:{...f.input(),dmFile:file}});assert.ok([400,413].includes(r.httpStatus));}
  assert.equal((await f.api('/events',{data:{...f.input(),description:'字'.repeat(20000),dmFile:png}})).httpStatus,413);assert.equal(f.puts.length,0);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM member_hosted_events').get().n,0);
});
test('R2/SQL failures do not publish missing media or leave a readable draft',async t=>{
  const f=setup(t);f.env.IMG_BUCKET.put=async()=>{throw Error('synthetic upload failure');};assert.equal((await f.api('/events',{data:{...f.input(),dmFile:png}})).httpStatus,503);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM member_hosted_events').get().n,0);
  const g=setup(t);g.setBadWrite(true);assert.equal((await g.api('/events',{data:{...g.input(),dmFile:png}})).httpStatus,503);assert.equal(g.objects.size,0);assert.equal(g.puts.length,1);
  const h=setup(t);await h.create();assert.equal((await h.api('/events',{data:{...h.input(),dmFile:png}})).code,'hosted_event_active');assert.equal(h.objects.size,0);
});
test('simultaneous create is one activity; losing media removed, winner remains readable',async t=>{
  const f=setup(t),input={...f.input(),dmFile:png};const results=await Promise.all([f.api('/events',{data:input}),f.api('/events',{data:input})]);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM member_hosted_events').get().n,1);assert.equal(f.objects.size,1);const winner=results.find(r=>r.success).event;assert.equal((await fileRequest(f,winner.coverUrl)).status,200);
});
test('PDF and removed image: full document served safely; removal invalidates former reference',async t=>{
  const f=setup(t),input=f.input(),pdf={type:'application/pdf',data:'data:application/pdf;base64,'+Buffer.from('%PDF-1.4\nsynthetic document').toString('base64')},e=await f.create({...input,dmFile:pdf}),r=await fileRequest(f,e.coverUrl);assert.equal(r.status,200);assert.equal(r.headers.get('Content-Type'),'application/pdf');assert.match(await r.text(),/^%PDF-1.4/);
  assert.equal((await f.api('/'+e.id+'/update',{data:{...input,requestKey:crypto.randomUUID(),revision:0,coverUrl:''}})).event.coverUrl,'');assert.equal((await fileRequest(f,e.coverUrl)).status,404);
});
test('thumbnail/full proportion/home entry/media draft carry and publish-only attachment, no identity persistence',()=>{
  const ui=readFileSync(new URL('../js/modules/member-hosted-events.js',import.meta.url),'utf8'),dm=readFileSync(new URL('../js/modules/member-event-dm.js',import.meta.url),'utf8'),html=readFileSync(new URL('../index.html',import.meta.url),'utf8'),css=readFileSync(new URL('../css/member-hosted-events.css',import.meta.url),'utf8');
  assert.match(ui,/mountCover\(article,e,m,true\)/);assert.match(ui,/mountCover\(m.body,e,m\)/);assert.match(ui,/返回活動明細/);assert.match(css,/me-full-dm.*height:auto;object-fit:contain/);assert.match(css,/me-thumbnail-image.*object-fit:contain/);assert.match(ui,/URL.revokeObjectURL/);assert.match(ui,/actor.uid!==current.uid\|\|actor.token!==current.token/);assert.match(ui,/actor.uid!==boundActor.uid\|\|actor.token!==boundActor.token/);assert.match(ui,/dmFile:dm\?\.dmFile/);assert.match(dm,/options.apply\(fields,actor,prepared\)/);assert.match(html,/查看所有平台會員發布的活動/);assert.doesNotMatch(ui+dm,/localStorage|sessionStorage|OPENAI_API_KEY|[?&]token=/);
});
