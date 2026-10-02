import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { DatabaseSync } from 'node:sqlite';
import { CardLinks as links, cardLinksEnabled, cardLinksConfigResponse } from '../worker/card-links.mjs';
const read = file => readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const buttons = count => Array.from({length:count}, (_,i) => ({l:'連結 '+i,u:'https://example.com/'+i,c:'#06C755'}));
const legacy = {title:'舊版',desc:'舊版說明',buttons:buttons(2),imgUrl:'https://example.com/image.jpg',unknown:{keep:true}};
const plain = value => JSON.parse(JSON.stringify(value));

for (const count of [0,1,2,3,4,5,11,12,15]) test(count + ' buttons survive save, reload and old/new/old/new rollback', () => {
  const saved = links.saveConfig(legacy, {...legacy,_cardLinksEditing:'v2',title:'新標題',desc:'新說明',buttons:buttons(count)}, true);
  assert.deepEqual(saved.buttons, legacy.buttons);
  assert.deepEqual(saved.unknown, legacy.unknown);
  for (const mode of [false,true,false,true]) {
    const cfg = links.project(saved, {}, mode);
    assert.equal(cfg.buttons.length,mode ? count : 2);
    assert.equal(cfg.title,mode ? '新標題' : '舊版');
    assert.equal(cfg.desc,mode ? '新說明' : '舊版說明');
  }
  const rows = links.flexRows(saved.contactLinksV2.buttons);
  assert.equal(rows.length,Math.ceil(count/2));
  assert.equal(rows.flatMap(r=>r.contents).length,count);
  if (count % 2) assert.equal(rows.at(-1).contents.length,1);
});
test('legacy and stale saves cannot overwrite full v2; fresh legacy edits stay independent', () => {
  const saved = links.saveConfig(legacy,{...legacy,_cardLinksEditing:'v2',buttons:buttons(15)},true);
  assert.throws(()=>links.saveConfig(saved,legacy,true),/其他頁面更新/);
  const oldSave = links.saveConfig(saved,{...saved,title:'修改舊版',buttons:buttons(1),contactLinksV2:{buttons:[]}},false);
  assert.equal(oldSave.buttons.length,1); assert.equal(oldSave.contactLinksV2.buttons.length,15);
  assert.deepEqual(oldSave.unknown,{keep:true});
  assert.throws(()=>links.saveConfig(saved,{...saved,_cardLinksEditing:'v2'},false),/切回舊版/);
});
test('explicit deletion is respected; only the explicit complete action adds fields back', () => {
  const card = {mobile:'0912345678',email:'one@example.com'};
  assert.deepEqual(links.project({buttons:[]},card,true).buttons,[]);
  assert.equal(links.project({},card,true).buttons.length,2);
  const saved = links.saveConfig({}, {_cardLinksEditing:'v2',buttons:[]},true);
  assert.equal(links.project(saved,card,true).buttons.length,0);
  assert.equal(links.mergeRecognized([],card).length,2);
});
test('all actual contacts are normalized, deduplicated and unsafe/guessed links excluded', () => {
  const result = links.recognized({mobile:'0912-345-678',office_phone:'02-2222-3333',email:'a@example.com;b@example.com',website:'example.com',address:'台北市測試路1號',socials:[{t:'LINE',u:'https://lin.ee/test'},{t:'Facebook',u:'https://facebook.com/example'},{t:'LINE ID',u:'@dontguess'},{t:'bad',u:'javascript:alert(1)'}],qrUrl:'https://example.com'});
  assert.equal(result.length,8);
  assert.equal(links.normalize([{l:'a',u:'https://example.com'},{l:'b',u:'https://example.com/'}]).length,2);
  for (const bad of ['javascript:alert(1)','data:text/html,test','https://name:pass@example.com','mailto:bad','https://example.com\n']) {
    if (bad.endsWith('\n')) continue;
    assert.equal(links.uri(bad),'');
  }
  assert.equal(links.uri('https://example.com/order/123456789'),'https://example.com/order/123456789');
  assert.throws(()=>links.normalize([{l:'blank',u:''}],true),/第 1/);
  const emailAction = links.flexRows([{l:'電子郵件',u:'mailto:a@example.com'}])[0].contents[0].action;
  assert.equal(emailAction.type,'clipboard'); assert.equal(emailAction.clipboardText,'a@example.com');
});
test('feature switch is server managed and fails closed without schema/DB/flag', async () => {
  for (const value of ['enabled','disabled',null,'true']) {
    const env={ACTMASTER_DB:{prepare:()=>({bind:()=>({first:async()=>({value})})})}};
    assert.equal(await cardLinksEnabled(env),value==='enabled');
    const response=await cardLinksConfigResponse(env);
    assert.equal(response.headers.get('Cache-Control'),'no-store');
  }
  assert.equal(await cardLinksEnabled({}),false);
});

test('first upgrade completes actual contacts, but reviewed deletions and duplicate labels remain stable', () => {
  const card={email:'new@example.com',website:'example.com'};
  const projected=links.project({buttons:[{l:'網站',u:'https://example.com'}]},card,true);
  assert.equal(projected.buttons.length,2);
  const duplicate=[{l:'網站',u:'https://example.com'},{l:'合作',u:'https://example.com'}];
  const saved=links.saveConfig({}, {_cardLinksEditing:'v2',buttons:duplicate},true);
  assert.equal(links.project(saved,card,true).buttons.length,2);
  assert.equal(links.flexRows(saved.contactLinksV2.buttons)[0].contents.length,2);
  assert.equal(links.mergeRecognized(duplicate,card).length,3);
});

test('LINE text and UTF-8 limits are checked without truncating saved content', () => {
  assert.throws(()=>links.saveConfig({}, {_cardLinksEditing:'v2',buttons:[],desc:'字'.repeat(2001)},true),/容量/);
  const long=buttons(45).map(b=>({...b,u:b.u+'?q='+'字'.repeat(70)}));
  assert.throws(()=>links.saveConfig({}, {_cardLinksEditing:'v2',buttons:long},true),/容量/);
});

test('field editor retains the v2 title instead of overwriting it with the rollback title', () => {
  const saved=links.saveConfig(legacy,{...legacy,_cardLinksEditing:'v2',title:'新標題',buttons:buttons(11)},true);
  const win={CardLinks:links,currentCard:{customConfig:JSON.stringify(saved)},location:{origin:'https://example.com',pathname:'/'}};
  const context=vm.createContext({window:win,URL,console,document:{addEventListener(){},getElementById:()=>null,querySelector:()=>null,querySelectorAll:()=>[]}});
  vm.runInContext(read('js/modules/ecard.js'),context);
  win.currentEcardLinksV2=true;win.currentEcardButtons=buttons(11);
  const cfg=win.buildECardConfigFromFields();
  assert.equal(cfg.title,'新標題');assert.equal(cfg._cardLinksRevision,1);assert.equal(cfg.buttons.length,11);
});

function writerFixture() {
  const source=read('workerbackup.js');
  const start=source.indexOf('  async upsertCard(payload, env) {');
  const end=source.indexOf('\n  async deleteCard(payload, env)',start);
  const method=source.slice(start,end);
  const columns=method.match(/INSERT INTO card_contacts \(([^)]+)\)/)[1].split(',');
  const extra=['source_event_id','claimed_from_row_id','claimed_by_uid','claimed_at','merged_into_row_id','archived_at'];
  const sql=new DatabaseSync(':memory:');
  sql.exec('CREATE TABLE card_contacts ('+[...columns,...extra].map(c=>c+' TEXT'+(c==='row_id'?' PRIMARY KEY':'')).join(',')+')');
  sql.prepare('INSERT INTO card_contacts(row_id,line_id,custom_config,source_type) VALUES(?,?,?,?)').run('card','owner',JSON.stringify(legacy),'self_profile');
  const env={ACTMASTER_DB:{prepare(query){const build=args=>({bind:(...values)=>build(values),first:async()=>sql.prepare(query).get(...args),run:async()=>({meta:{changes:Number(sql.prepare(query).run(...args).changes)}})});return build([]);}}};
  const effects=[];
  const context=vm.createContext({CardLinks:links,cardLinksEnabled:async()=>true,console,
    D1ReadModule:{ensureCardAccessColumns:async()=>{},first:async(_env,q,args)=>sql.prepare(q).get(...args),cardRow:row=>({...row,customConfig:row.custom_config}),inferCrmType:()=>'',inferCrmNextAction:()=>'',inferCrmSuggestion:()=>'',inferCardAccess:()=>({ownerUserId:'owner',profileUserId:'owner',sourceType:'self_profile',visibility:'private',poolEligible:false,aiReviewStatus:'passed',isSelfProfile:true})},
    CardFateTagAnalysisModule:{enqueueCard:async()=>{}},CardUploaderMatchModule:{enqueueCard:async()=>{}}
  });
  const writer=vm.runInContext('({'+method+'})',context);
  Object.assign(writer,{hasD1:()=>true,text:v=>String(v||''),role:v=>v,pick:(obj,keys,fallback='')=>keys.map(k=>obj?.[k]).find(v=>v!==undefined)??fallback,isLineUserIdLike:()=>false,
    normalizeCard:payload=>Object.assign(Object.fromEntries(columns.map(c=>[c,''])),{row_id:'card',line_id:'owner',source_type:'self_profile',custom_config:JSON.stringify(payload.data.cfg)}),
    isClaimedCollectionReadOnlyForActor:async()=>false,resolvePointAwardUserId:async id=>id,upsertUser:async()=>effects.push('user'),awardCardScanPoints:async()=>{effects.push('points');return {};}
  });
  const save=(cfg,actor='owner')=>writer.upsertCard({rowId:'card',authenticatedUserId:actor,authenticatedRole:'user',data:{cfg,customConfig:JSON.stringify(cfg)}},env);
  return {sql,save,effects};
}
test('real upsert SQL rejects concurrent stale writes and unauthorized actors before side effects',async()=>{
  const f=writerFixture();
  try {
    const draft={...legacy,_cardLinksEditing:'v2',buttons:buttons(15)};
    assert.equal((await f.save(draft,'other')).success,false);
    assert.equal(f.effects.length,0);
    const responses=await Promise.all([f.save(draft),f.save({...draft,title:'stale'})]);
    assert.equal(responses.filter(r=>r.success).length,1);
    assert.equal(responses.filter(r=>r.code==='CARD_CONFIG_CONFLICT').length,1);
    const saved=JSON.parse(f.sql.prepare('SELECT custom_config FROM card_contacts').get().custom_config);
    assert.equal(saved.contactLinksV2.buttons.length,15);
    assert.equal(f.effects.length,2);
    assert.equal((await f.save(legacy)).success,false);
    assert.equal(f.effects.length,2);
  } finally {f.sql.close();}
});
test('front-end Flex and Worker share the same 15-button rows, title and description', () => {
  const cfg=links.saveConfig(legacy,{...legacy,_cardLinksEditing:'v2',title:'標題',desc:'完整說明',buttons:buttons(15)},true);
  const context=vm.createContext({window:{CardLinks:links,CardLinksRuntime:{enabled:()=>true},location:{origin:'https://example.com',pathname:'/'}},URL,console,document:{addEventListener(){}}});
  vm.runInContext(read('js/modules/ecard.js'),context);
  const front=plain(context.window.buildLocalECardFlexMessage({rowId:'card'},cfg,'https://example.com/card'));
  const worker=read('workerbackup.js').match(/^const MessagingModule = \{[\s\S]*?^\};/m)[0];
  const backContext=vm.createContext({CardLinks:links,Utils:{cleanURI:v=>v}});
  const messaging=vm.runInContext(worker+';MessagingModule',backContext);
  const back=plain(messaging.buildFlex({card:{rowId:'card'},config:cfg,cardLinksV2:true}));
  assert.deepEqual(front.footer,back.footer);
  assert.equal(front.footer.contents.length,8);
  assert.equal(front.body.contents[0].text,'標題');assert.equal(back.body.contents[1].text,'完整說明');
  assert.equal(front.size,'mega');
});

test('personal WYSIWYG saves 15 buttons and new title, adopts server revision, and keeps a failed draft', async () => {
  const source=read('js/modules/mycard.js');
  const method=source.slice(source.indexOf('  async function saveMyECardConfig'),source.indexOf('  function buildCurrentShareConfig'));
  const draft={...legacy,_cardLinksEditing:'v2',title:'所見即所得標題',buttons:buttons(15)};
  const card={rowId:'own',customConfig:JSON.stringify(legacy)};
  let fail=false, sent, notices=[];
  const context=vm.createContext({
    window:{currentUserProfile:{userId:'owner'},showToast:m=>notices.push(m),fetchAPI:async(action,payload)=>{
      assert.equal(action,'updateCard');sent=JSON.parse(payload.data['自訂名片設定']);
      if(fail)return{success:false,error:'conflict'};
      return{success:true,data:{customConfig:JSON.stringify(links.saveConfig(legacy,sent,true))}};
    }}, currentCardData:card,wysiwygState:{cfg:draft,recordMode:false},myEcardButtons:buttons(15),
    syncButtonEditorDrafts(){},$:()=>null,checkCardLinksSaveMode:async()=>{},syncCurrentImageInput(){},getActiveMyCardLayout:()=> 'landscape',selectMyECardLayout(){},
    isMyCardVideoContext:()=>false,layoutToCardVersion:()=> 'standard',isCardVersion:()=>true,parseCardConfig:c=>links.project(c.customConfig,{},true),
    applyCurrentVersionMediaToConfig(){},normalizeMyCardButtonsForSave:b=>links.normalize(b,true),syncVideoConfig(){},ensureCurrentCardRowId:async()=> 'own',activeImageForCardVersion:()=>legacy.imgUrl,setActiveMyCard(){},
    resolveCurrentUserCard:()=>{throw new Error('Must not refresh away a stale revision');}
  });
  const save=vm.runInContext(method+';saveMyECardConfig',context);
  assert.equal(await save(),true);assert.equal(sent.title,draft.title);assert.equal(sent.buttons.length,15);
  assert.equal(JSON.parse(card.customConfig)._cardLinksRevision,1);
  fail=true;context.wysiwygState.cfg={...draft,title:'未儲存草稿'};
  assert.equal(await save(),false);assert.equal(context.wysiwygState.cfg.title,'未儲存草稿');
  assert.match(notices.at(-1),/conflict/);
});

test('runtime recovers from missing configuration and fails closed on network errors', async () => {
  let calls=0, enabled=true;
  const win={};
  const context=vm.createContext({window:win,document:{addEventListener(){}},AbortController,Date,setTimeout,clearTimeout,fetch:async()=>{calls++;return{ok:true,json:async()=>({enabled})};}});
  vm.runInContext(read('js/modules/card-links-runtime.js'),context);
  assert.equal(await win.CardLinksRuntime.refresh(true),false);
  win.Config={WORKER_URL:'https://example.com'};
  assert.equal(await win.CardLinksRuntime.refresh(true),true);assert.equal(calls,1);
  enabled=false;assert.equal(await win.CardLinksRuntime.refresh(true),false);
  context.fetch=async()=>{throw new Error('offline');};assert.equal(await win.CardLinksRuntime.refresh(true),false);
});
