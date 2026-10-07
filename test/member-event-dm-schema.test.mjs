import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './helpers/member-events-fixture.mjs';
import {dmValue} from './helpers/member-event-dm-output.mjs';
import {extractMemberEventDm} from '../worker/member-event-dm.mjs';
import {MEMBER_EVENT_DM_MODEL,MEMBER_EVENT_DM_SCHEMA,memberEventDmInstructions,normalizeMemberEventDmDraft,memberEventDmOutputText} from '../worker/member-event-dm-schema.mjs';
import {ACTIVITY_DM_PROMPT} from '../worker/activity-dm-ai.mjs';
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
const input={file:{type:'image/png',data:png}},actor={memberId:'host'};
const batch={name:'第一場',scheduleText:'2027年10月7日14:00–17:00',startTime:'2027-10-07T14:00',endTime:'2027-10-07T17:00',startYearText:'2027年',endYearText:'',price:200};
const valid=dmValue({activityName:'交流會',description:'認識人、聊資源',location:'板橋文化路486號3樓',scheduleText:batch.scheduleText,timeStatus:'single',startTime:batch.startTime,endTime:batch.endTime,startYearText:batch.startYearText,price:200,rawOcrText:'交流會\n2027年10月7日14:00–17:00\n200元'});
const now2026=Date.parse('2026-10-07T04:00:00Z');

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
 const result=normalizeMemberEventDmDraft({...valid,startYearText:'',scheduleText:'10月8日（四）14:00至16:00',startTime:'2026-10-08T14:00',endTime:'2026-10-08T16:00',confidenceNote:'年份未標示，預設為 2026 年，請確認'},now2026);
 assert.equal(result.startTime,'2026-10-08T14:00');assert.equal(result.endTime,'2026-10-08T16:00');assert.equal(result.scheduleText,'10月8日（四）14:00至16:00');assert.match(result.confidenceNote,/預設為 2026 年/);
 assert.equal(normalizeMemberEventDmDraft(valid).startTime,'2027-10-07T14:00');
 const multiple=normalizeMemberEventDmDraft({...valid,timeStatus:'multiple',batches:[{...batch,startYearText:'',startTime:'2026-10-07T14:00',endTime:'2026-10-07T17:00',scheduleText:'10/7 14:00–17:00'},batch]},now2026);
 assert.equal(multiple.startTime,'');assert.equal(multiple.batches[0].startTime,'2026-10-07T14:00');assert.equal(multiple.batches[1].startTime,'2027-10-07T14:00');
 for(const startTime of ['2026-02-29T14:00','2026-10T14:00','2026-10-08'])assert.equal(normalizeMemberEventDmDraft({...valid,startTime}).startTime,'');
});

test('unprinted year is enforced even when AI supplies a past or future year, without mutating the source',()=>{
 for(const modelYear of [2025,2027]){
  const source=dmValue({activityName:'交流會',description:'內容',scheduleText:'10月15日（三）14:30–17:00',timeStatus:'single',startTime:modelYear+'-10-15T14:30',endTime:modelYear+'-10-15T17:00',confidenceNote:'年份未標示，預設為 '+modelYear+' 年，請確認；星期請核對',rawOcrText:'10月15日（三）14:30–17:00',price:150});
  const before=structuredClone(source),result=normalizeMemberEventDmDraft(source,now2026);
  assert.equal(result.startTime,'2026-10-15T14:30');assert.equal(result.endTime,'2026-10-15T17:00');assert.equal(result.price,150);
  assert.equal(result.scheduleText,source.scheduleText);assert.equal(result.rawOcrText,source.rawOcrText);assert.deepEqual(source,before);
  assert.match(result.confidenceNote,/年份未標示，預設為 2026 年，請確認/);assert.doesNotMatch(result.confidenceNote,/預設為 2025|預設為 2027/);assert.match(result.confidenceNote,/星期請核對/);
  assert.equal(Object.hasOwn(result,'startYearText'),false);assert.equal(Object.hasOwn(result,'endYearText'),false);
 }
});

test('explicit Western, ROC and fullwidth source years override the model year, not the server year',()=>{
 for(const [yearText,year]of [['2025',2025],['2027年',2027],['民國115年',2026],['中華民國114年',2025],['２０２７年',2027]]){
  const result=normalizeMemberEventDmDraft({...valid,scheduleText:yearText+'10月15日14:30–17:00',startYearText:yearText,startTime:'2024-10-15T14:30',endTime:'2024-10-15T17:00'},now2026);
  assert.equal(result.startTime,year+'-10-15T14:30');assert.equal(result.endTime,year+'-10-15T17:00');assert.doesNotMatch(result.confidenceNote,/年份未標示/);
 }
});

test('explicit cross-year end is preserved, while an unprinted end year cannot invent a rollover',()=>{
 const source={...valid,scheduleText:'2026年12月31日23:00至2027年1月1日01:00',startYearText:'2026年',endYearText:'2027年',startTime:'2025-12-31T23:00',endTime:'2025-01-01T01:00'};
 const result=normalizeMemberEventDmDraft(source,now2026);assert.equal(result.startTime,'2026-12-31T23:00');assert.equal(result.endTime,'2027-01-01T01:00');
 const noRollover=normalizeMemberEventDmDraft({...source,scheduleText:'12月31日23:00至1月1日01:00',startYearText:'',endYearText:''},now2026);
 assert.equal(noRollover.startTime,'2026-12-31T23:00');assert.equal(noRollover.endTime,'');
});

test('explicit source date year cannot be overwritten even if the provider omits year evidence',()=>{
 for(const [scheduleText,year]of [['2025年10月15日14:30–17:00',2025],['2027/10/15 14:30–17:00',2027],['民國115年10月15日14:30–17:00',2026]]){
  const result=normalizeMemberEventDmDraft({...valid,startYearText:'',scheduleText,startTime:'2024-10-15T14:30',endTime:'2024-10-15T17:00'},now2026);
  assert.equal(result.startTime,year+'-10-15T14:30');assert.equal(result.endTime,year+'-10-15T17:00');assert.doesNotMatch(result.confidenceNote,/年份未標示/);
 }
 const ambiguous=normalizeMemberEventDmDraft({...valid,startYearText:'',scheduleText:'2026年12月31日23:00至2027年1月1日01:00'},now2026);
 assert.equal(ambiguous.startTime,'');assert.match(ambiguous.confidenceNote,/原圖年份證據不明/);
});

test('calendar validation happens after year enforcement, including leap days and missing times',()=>{
 const source={...valid,scheduleText:'2月29日14:00–17:00',startYearText:'',startTime:'2024-02-29T14:00',endTime:'2024-02-29T17:00'};
 const invalid=normalizeMemberEventDmDraft(source,now2026);assert.equal(invalid.startTime,'');assert.equal(invalid.endTime,'');
 const leap=normalizeMemberEventDmDraft({...source,startTime:'2025-02-29T14:00',endTime:'2025-02-29T17:00'},Date.parse('2028-01-01T00:00:00Z'));
 assert.equal(leap.startTime,'2028-02-29T14:00');assert.equal(leap.endTime,'2028-02-29T17:00');
 const missing=normalizeMemberEventDmDraft({...source,startTime:'',endTime:''},now2026);assert.equal(missing.startTime,'');assert.equal(missing.endTime,'');
});

test('each multiple session gets its own explicit or default year and missing dates remain blank',()=>{
 const result=normalizeMemberEventDmDraft({...valid,timeStatus:'multiple',batches:[
  {...batch,startYearText:'',scheduleText:'10/15 14:30–17:00',startTime:'2025-10-15T14:30',endTime:'2025-10-15T17:00'},
  batch,{...batch,startYearText:'',scheduleText:'10/21下午',startTime:'',endTime:''}
 ]},now2026);
 assert.equal(result.startTime,'');assert.equal(result.endTime,'');assert.equal(result.batches[0].startTime,'2026-10-15T14:30');assert.equal(result.batches[1].startTime,'2027-10-07T14:00');assert.equal(result.batches[2].startTime,'');
 assert.equal(Object.hasOwn(result.batches[0],'startYearText'),false);
});

test('unsupported or ungrounded nonempty year evidence clears related dates instead of silently overwriting',()=>{
 for(const startYearText of ['115','2025','2027年10月7日']){
  const result=normalizeMemberEventDmDraft({...valid,scheduleText:'10月15日14:30–17:00',startYearText},now2026);
  assert.equal(result.startTime,'');assert.equal(result.endTime,'');assert.match(result.confidenceNote,/原圖年份證據不明/);
 }
});

test('request year remains fixed if provider wait crosses Taiwan New Year',async t=>{
 let clock=Date.parse('2026-12-31T15:59:59Z');t.mock.method(Date,'now',()=>clock);
 const f=fixture(t);f.env.OPENAI_API_KEY='test-only-key';
 const result=await extractMemberEventDm(input,f.env,f.db,actor,async(url,init)=>{
  assert.match(JSON.parse(init.body).instructions,/台灣當年為 2026 年/);clock=Date.parse('2026-12-31T16:00:01Z');
  return Response.json({status:'completed',output_text:JSON.stringify({...valid,startYearText:'',scheduleText:'10月15日14:30–17:00',startTime:'2025-10-15T14:30',endTime:'2025-10-15T17:00'})});
 });
 assert.equal(result.draft.startTime,'2026-10-15T14:30');assert.equal(result.draft.endTime,'2026-10-15T17:00');assert.equal(f.writes.length,1);
});

test('Responses output_text and message content forms both supported without unsafe coercion',()=>{
 assert.equal(memberEventDmOutputText({output_text:'{}'}),'{}');
 assert.equal(memberEventDmOutputText({output:[{type:'reasoning',content:[]},{content:[{type:'output_text',text:'{'},{type:'output_text',text:'}'}]}]}),'{}');
 for(const value of [null,{}, {output:{}},{output:[{content:{}}]},{output:[{content:[{type:'refusal',refusal:'private'}]}]},{output:[{content:[{type:'output_text',text:123}]}]}])assert.equal(memberEventDmOutputText(value),'');
});

test('missing or ambiguous dates and fees stay blank; all multiple sessions remain separate',()=>{
 const result=normalizeMemberEventDmDraft(dmValue({activityName:'交流會',description:'內容',timeStatus:'multiple',startTime:batch.startTime,endTime:batch.endTime,batches:[batch,{...batch,startYearText:'',name:'第二場',scheduleText:'10/21下午',startTime:'10/21',endTime:'',price:null}]}));
 assert.equal(result.startTime,'');assert.equal(result.endTime,'');assert.equal(result.price,null);assert.equal(result.batches.length,2);assert.equal(result.batches[1].startTime,'');assert.equal(result.batches[1].price,null);
 const invalidDate=normalizeMemberEventDmDraft({...valid,startTime:'2027-02-30T14:00'});assert.equal(invalidDate.startTime,'');assert.equal(invalidDate.endTime,'');
});

const invalidCases=[
 ['unknown ownership field',{...valid,memberId:'forged'}],
 ['missing field',(({rawOcrText,...rest})=>rest)(valid)],
 ['wrong title type',{...valid,activityName:123}],
 ['missing year evidence field',(({startYearText,...rest})=>rest)(valid)],
 ['wrong year evidence type',{...valid,startYearText:2025}],
 ['year evidence over limit',{...valid,endYearText:'字'.repeat(41)}],
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
