import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './helpers/member-events-fixture.mjs';
import {dmValue} from './helpers/member-event-dm-output.mjs';
import {extractMemberEventDm} from '../worker/member-event-dm.mjs';
import {MEMBER_EVENT_DM_MODEL,MEMBER_EVENT_DM_SCHEMA,memberEventDmInstructions,normalizeMemberEventDmDraft,memberEventDmOutputText} from '../worker/member-event-dm-schema.mjs';
import {ACTIVITY_DM_PROMPT} from '../worker/activity-dm-ai.mjs';
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
const input={file:{type:'image/png',data:png}},actor={memberId:'host'};
const batch={name:'第一場',scheduleText:'2027年10月7日14:00–17:00',startTime:'2027-10-07T14:00',endTime:'2027-10-07T17:00',price:200};
const valid=dmValue({activityName:'交流會',description:'認識人、聊資源',location:'板橋文化路486號3樓',scheduleText:batch.scheduleText,timeStatus:'single',startTime:batch.startTime,endTime:batch.endTime,price:200,rawOcrText:'交流會\n2027年10月7日14:00–17:00\n200元'});

test('fixed member-only DM schema is strict at every object and covers all required fields',()=>{
 assert.equal(MEMBER_EVENT_DM_MODEL,'gpt-5.6-sol');
 const check=s=>{if(s.type==='object'){assert.equal(s.additionalProperties,false);assert.deepEqual(s.required,Object.keys(s.properties));Object.values(s.properties).forEach(check);}if(s.type==='array')check(s.items);};check(MEMBER_EVENT_DM_SCHEMA);
 assert.deepEqual(MEMBER_EVENT_DM_SCHEMA.required,Object.keys(dmValue()));
});

test('one dedicated provider call, existing secret, no shared model override or classification',async t=>{
 const f=fixture(t);f.env.OPENAI_API_KEY='test-only-key';f.env.OPENAI_MODEL='unrelated-card-model';f.env.OPENAI_VISION_MODEL='unrelated-card-vision';let calls=0;
 const result=await extractMemberEventDm(input,f.env,f.db,actor,async(url,init)=>{
  calls++;assert.equal(url,'https://api.openai.com/v1/responses');assert.equal(init.redirect,'manual');const payload=JSON.parse(init.body);
  assert.equal(payload.model,MEMBER_EVENT_DM_MODEL);assert.deepEqual(payload.reasoning,{effort:'low'});assert.equal(payload.store,false);assert.equal(payload.max_output_tokens,4000);
  assert.deepEqual(payload.text.format,{type:'json_schema',name:'member_activity_dm',strict:true,schema:MEMBER_EVENT_DM_SCHEMA});
  assert.equal(payload.input[0].content[1].detail,'high');assert.match(payload.instructions,/rawOcrText/);assert.doesNotMatch(JSON.stringify(payload),/test-only-key|unrelated-card/);
  const year=new Date(Date.now()+8*3600000).getUTCFullYear();assert.match(payload.instructions,new RegExp('台灣當年為 '+year+' 年'));
  return Response.json({status:'completed',output_text:JSON.stringify(valid)});
 });
 assert.equal(result.success,true);assert.equal(result.draft.activityName,valid.activityName);assert.equal(result.draft.rawOcrText,valid.rawOcrText);assert.equal(result.draft.price,200);assert.equal(calls,1);assert.equal(f.writes.length,1);
});

test('year default is computed per request at Taiwan midnight, not cached or taken from the client',()=>{
 assert.match(memberEventDmInstructions(Date.parse('2026-12-31T15:59:59Z')),/台灣當年為 2026 年/);
 assert.match(memberEventDmInstructions(Date.parse('2026-12-31T16:00:00Z')),/台灣當年為 2027 年/);
 assert.match(memberEventDmInstructions(Date.parse('2028-01-01T00:00:00Z')),/台灣當年為 2028 年/);
});

test('member-only default instructions preserve explicit years, original text and missing-date safety',()=>{
 const value=memberEventDmInstructions(Date.parse('2026-10-06T12:00:00Z'));
 assert.doesNotMatch(value,/不能補今年/);assert.match(value,/明示西元年份.*民國年份優先/);
 assert.match(value,/年份未標示，預設為 2026 年，請確認/);assert.match(value,/日期已過去也仍用當年，不改明年/);
 assert.match(value,/scheduleText、rawOcrText 保留圖上原文/);assert.match(value,/沒有月、日或開始時間、無效日期、未寫結束時間仍留空/);
 assert.match(ACTIVITY_DM_PROMPT,/缺少年份、日期或開始時間時不能補今年/);
});

test('default-year single and multiple drafts normalize without overwriting explicit years or original text',()=>{
 const result=normalizeMemberEventDmDraft({...valid,scheduleText:'10月8日（四）14:00至16:00',startTime:'2026-10-08T14:00',endTime:'2026-10-08T16:00',confidenceNote:'年份未標示，預設為 2026 年，請確認'});
 assert.equal(result.startTime,'2026-10-08T14:00');assert.equal(result.endTime,'2026-10-08T16:00');assert.equal(result.scheduleText,'10月8日（四）14:00至16:00');assert.match(result.confidenceNote,/預設為 2026 年/);
 assert.equal(normalizeMemberEventDmDraft(valid).startTime,'2027-10-07T14:00');
 const multiple=normalizeMemberEventDmDraft({...valid,timeStatus:'multiple',batches:[{...batch,startTime:'2026-10-07T14:00',endTime:'2026-10-07T17:00',scheduleText:'10/7 14:00–17:00'},batch]});
 assert.equal(multiple.startTime,'');assert.equal(multiple.batches[0].startTime,'2026-10-07T14:00');assert.equal(multiple.batches[1].startTime,'2027-10-07T14:00');
 for(const startTime of ['2026-02-29T14:00','2026-10T14:00','2026-10-08'])assert.equal(normalizeMemberEventDmDraft({...valid,startTime}).startTime,'');
});

test('Responses output_text and message content forms both supported without unsafe coercion',()=>{
 assert.equal(memberEventDmOutputText({output_text:'{}'}),'{}');
 assert.equal(memberEventDmOutputText({output:[{type:'reasoning',content:[]},{content:[{type:'output_text',text:'{'},{type:'output_text',text:'}'}]}]}),'{}');
 for(const value of [null,{}, {output:{}},{output:[{content:{}}]},{output:[{content:[{type:'refusal',refusal:'private'}]}]},{output:[{content:[{type:'output_text',text:123}]}]}])assert.equal(memberEventDmOutputText(value),'');
});

test('missing or ambiguous dates and fees stay blank; all multiple sessions remain separate',()=>{
 const result=normalizeMemberEventDmDraft(dmValue({activityName:'交流會',description:'內容',timeStatus:'multiple',startTime:batch.startTime,endTime:batch.endTime,batches:[batch,{...batch,name:'第二場',scheduleText:'10/21下午',startTime:'10/21',endTime:'',price:null}]}));
 assert.equal(result.startTime,'');assert.equal(result.endTime,'');assert.equal(result.price,null);assert.equal(result.batches.length,2);assert.equal(result.batches[1].startTime,'');assert.equal(result.batches[1].price,null);
 const invalidDate=normalizeMemberEventDmDraft({...valid,startTime:'2027-02-30T14:00'});assert.equal(invalidDate.startTime,'');assert.equal(invalidDate.endTime,'');
});

const invalidCases=[
 ['unknown ownership field',{...valid,memberId:'forged'}],
 ['missing field',(({rawOcrText,...rest})=>rest)(valid)],
 ['wrong title type',{...valid,activityName:123}],
 ['invalid enum',{...valid,timeStatus:'guess'}],
 ['string fee',{...valid,price:'200'}],
 ['negative fee',{...valid,price:-1}],
 ['fractional fee',{...valid,price:1.5}],
 ['null title',{...valid,activityName:null}],
 ['OCR over limit',{...valid,rawOcrText:'字'.repeat(3001)}],
 ['description over limit',{...valid,description:'字'.repeat(9001)}],
 ['too many sessions',{...valid,batches:Array.from({length:25},()=>batch)}],
 ['unknown session property',{...valid,batches:[{...batch,role:'admin'}]}],
 ['missing session field',{...valid,batches:[{name:'第一場'}]}],
];
for(const [name,value]of invalidCases)test('reject invalid provider schema: '+name,()=>assert.throws(()=>normalizeMemberEventDmDraft(value),/Invalid activity DM schema/));

test('invalid structured provider output fails once, cannot become a saved event or task',async t=>{
 const f=fixture(t);f.env.OPENAI_API_KEY='test-only-key';let calls=0;const logs=[];t.mock.method(console,'error',v=>logs.push(JSON.parse(v)));
 await assert.rejects(extractMemberEventDm(input,f.env,f.db,actor,async()=>{calls++;return Response.json({status:'completed',output_text:JSON.stringify({...valid,role:'admin'})});}),e=>e.code==='DM_FAILED');
 assert.equal(calls,1);assert.equal(logs[0].reason,'invalid_draft_schema');assert.equal(f.writes.length,1);
 for(const table of ['member_hosted_events','member_event_registrations','activities','personal_tasks','points_ledger'])assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM '+table).get().n,0);
});
