import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './helpers/member-events-fixture.mjs';
import {extractMemberEventDm} from '../worker/member-event-dm.mjs';
import {handleMemberEvents} from '../worker/member-hosted-events.mjs';
import {dmValue} from './helpers/member-event-dm-output.mjs';

const secret='DO_NOT_LOG_key_member_private_dm',png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
const input={file:{type:'image/png',data:png}},actor={memberId:secret};
const output=text=>Response.json({status:'completed',output:[{content:[{type:'output_text',text}]}]});
const fields=['message','diagnosticCode','stage','reason','httpStatus','responseStatus','incompleteReason','providerCode','outputTextChars','elapsedMs'];
function setup(t){const f=fixture(t);f.env.OPENAI_API_KEY=secret;f.sql.prepare('UPDATE users SET row_id=?,name=? WHERE row_id=?').run(secret,secret,'host');return f;}
function capture(t){const records=[];t.mock.method(console,'error',value=>records.push(JSON.parse(value)));return records;}
function safe(record,error){
  assert.deepEqual(Object.keys(record),fields);
  assert.equal(record.message,'member_event_dm_failed');
  assert.match(record.diagnosticCode,/^DM-[0-9a-f]{12}$/);
  assert.ok(error.message.includes(record.diagnosticCode));
  assert.ok(Number.isFinite(record.elapsedMs)&&record.elapsedMs>=0);
  assert.ok(Number.isFinite(record.outputTextChars)&&record.outputTextChars>=0);
  assert.doesNotMatch(JSON.stringify(record),/DO_NOT_LOG|data:image|base64|Authorization|Bearer|prompt|stack/);
  assert.doesNotMatch(error.message,/DO_NOT_LOG/);
}
function noBusinessWrites(f){
  assert.equal(f.writes.length,1);
  assert.match(f.writes[0],/member_event_dm_usage/);
  for(const table of ['member_hosted_events','member_event_registrations','activities','personal_tasks','points_ledger'])assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM '+table).get().n,0);
}

test('successful DM draft remains identical and produces no diagnostic or extra writes',async t=>{
  const f=setup(t),logs=capture(t),draft=dmValue({activityName:'交流活動',description:secret,timeStatus:'unclear'});
  const result=await extractMemberEventDm(input,f.env,f.db,actor,async()=>output(JSON.stringify(draft)));
  assert.equal(result.success,true);assert.equal(result.draft.description,secret);assert.equal(logs.length,0);noBusinessWrites(f);
});

const failures=[
 ['network','provider_request','network_or_request_failure',()=>{throw new TypeError(secret);}],
 ['abort','provider_request','timeout_or_cancelled',()=>{throw Object.assign(Error(secret),{name:'AbortError'});}],
 ['timeout','provider_request','timeout_or_cancelled',()=>{throw Object.assign(Error(secret),{name:'TimeoutError'});}],
 ['malformed response','provider_json','invalid_provider_json',()=>new Response(secret)],
 ['bounded response','provider_json','response_too_large',()=>new Response(secret.repeat(7000))],
 ['incomplete','provider_status','incomplete_response',()=>Response.json({status:'incomplete',incomplete_details:{reason:'max_output_tokens'},private:secret})],
 ['untrusted incomplete reason','provider_status','incomplete_response',()=>Response.json({status:'failed',incomplete_details:{reason:secret}})],
 ['missing output','output_text','missing_output_text',()=>Response.json({status:'completed',output:[{content:[{type:'refusal',refusal:secret}]}]})],
 ['long output','output_text','output_too_large',()=>output(secret.repeat(1300))],
 ['invalid draft JSON','draft_json','invalid_draft_json',()=>output(secret)],
 ['missing core fields','core_fields','missing_core_fields',()=>output(JSON.stringify(dmValue({rawOcrText:secret})))],
 ['invalid draft schema','normalize_draft','invalid_draft_schema',()=>output(JSON.stringify({private:secret}))],
 ['provider unauthorized','provider_http','provider_http_error',()=>Response.json({error:{code:'invalid_api_key',message:secret}},{status:401})],
 ['provider billing','provider_http','provider_http_error',()=>Response.json({error:{code:'insufficient_quota',message:secret}},{status:429})],
 ['provider rate limit','provider_http','provider_http_error',()=>Response.json({error:{code:'rate_limit_exceeded',message:secret}},{status:429})],
 ['untrusted provider code','provider_http','provider_http_error',()=>Response.json({error:{code:secret,message:secret}},{status:500})],
];
for(const [name,stage,reason,provider]of failures)test('safe diagnostic: '+name,async t=>{
  const f=setup(t),logs=capture(t);let caught,calls=0;
  try{await extractMemberEventDm(input,f.env,f.db,actor,async()=>{calls++;return provider();});}catch(e){caught=e;}
  assert.ok(caught);assert.ok([422,503].includes(caught.status));assert.equal(calls,1);assert.equal(logs.length,1);
  const record=logs[0];safe(record,caught);assert.equal(record.stage,stage);assert.equal(record.reason,reason);noBusinessWrites(f);
  if(name==='incomplete')assert.equal(record.incompleteReason,'max_output_tokens');
  if(name==='untrusted incomplete reason')assert.equal(record.incompleteReason,'unknown');
  if(name==='provider unauthorized'){assert.equal(record.httpStatus,401);assert.equal(record.providerCode,'invalid_api_key');}
  if(name==='provider billing')assert.equal(record.providerCode,'insufficient_quota');
  if(name==='provider rate limit')assert.equal(record.providerCode,'rate_limit_exceeded');
  if(name==='untrusted provider code')assert.equal(record.providerCode,'unknown');
});

test('existing HTTP error envelope exposes only the safe matching diagnostic code',async t=>{
  const f=setup(t),logs=capture(t),request=new Request('https://test/v1/member-events/dm-draft',{method:'POST',headers:{Authorization:'Bearer old','Content-Type':'application/json'},body:JSON.stringify(input)});
  const result=await handleMemberEvents(request,f.env,async(url,init)=>url.includes('api.line.me')?f.fetcher(url,init):output(secret));
  assert.equal(result.status,503);const data=await result.json();assert.equal(data.success,false);assert.equal(data.code,'DM_FAILED');
  assert.match(data.error,/原表單未變更/);assert.ok(data.error.includes(logs[0].diagnosticCode));assert.doesNotMatch(JSON.stringify(data),/DO_NOT_LOG/);
});

test('diagnostic sink failure cannot mask the original safe error',async t=>{
  const f=setup(t);t.mock.method(console,'error',()=>{throw Error(secret);});
  await assert.rejects(extractMemberEventDm(input,f.env,f.db,actor,async()=>output(secret)),e=>e.code==='DM_FAILED'&&/診斷碼：DM-[0-9a-f]{12}/.test(e.message)&&!e.message.includes(secret));
});

for(const status of [301,302,303,307,308])test('provider redirect '+status+' never follows or applies a draft',async t=>{
  const f=setup(t),logs=capture(t);let calls=0,caught;
  try{await extractMemberEventDm(input,f.env,f.db,actor,async(url,init)=>{
    calls++;assert.equal(url,'https://api.openai.com/v1/responses');assert.equal(init.redirect,'manual');
    return new Response(null,{status,headers:{Location:'https://untrusted.example/'+secret}});
  });}catch(error){caught=error;}
  assert.equal(calls,1);assert.equal(caught?.code,'AI_UNAVAILABLE');assert.equal(logs.length,1);
  safe(logs[0],caught);assert.equal(logs[0].stage,'provider_http');assert.equal(logs[0].httpStatus,status);noBusinessWrites(f);
});
