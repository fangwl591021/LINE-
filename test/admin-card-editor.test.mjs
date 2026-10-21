import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read = path => fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const description = '房屋整修、居家修繕，讓生活空間重新好用、好住。\n拆除打石，為空間改造做好準備。\n垃圾清運，整理工程產生的廢棄物。\n歡迎聊聊整修需求，討論適合的施工方向。';
function fixture(page, enabled = true) {
  const source = read(page), elements = new Map(), messages = [], requests = [];
  const el = id => {
    if (!elements.has(id)) elements.set(id, { value:'', innerHTML:'儲存變更', disabled:false, classList:{add(){},remove(){}} });
    return elements.get(id);
  };
  let mode = enabled, unavailable = false, rejection = false, refreshes = 0;
  const context = vm.createContext({ URL, TextEncoder, AbortController, setTimeout, clearTimeout, console,
    document:{ getElementById:el, querySelector:() => ({checked:true}) },
    fetch:async () => ({ ok:!unavailable, json:async()=>({enabled:mode}) }),
    WORKER_URL:'https://fixture.example',
    showToast:message => messages.push(message),
    renderAdminCardButtons(){}, switchModalTab(){}, refreshAdminCardShareUrls(){}, updateAdminCardPreview(){},
    syncAdminEcardImageInput(){}, getAdminCardLayout:()=>'landscape',
    loadCards(){ refreshes++; },
    fetchAPI:async (action, payload) => {
      requests.push({action,payload});
      if (rejection) { messages.push('Access Denied'); return null; }
      try {
        const config = context.CardLinks.saveConfig(stored['自訂名片設定'], payload.data['自訂名片設定'], mode);
        stored = {...stored,...payload.data,'自訂名片設定':JSON.stringify(config)};
        return structuredClone(stored);
      } catch(error) { messages.push(error.message); return null; }
    }
  });
  context.window = context;
  vm.runInContext(read('js/shared/card-links.js'), context);
  vm.runInContext(read('js/shared/admin-card-editor.js'), context);
  const legacy = {desc:'舊說明',title:'保留標題',buttons:[{l:'電話',u:'tel:0912345678',c:'#123456'}],
    imgUrl:'landscape.jpg',imgUrlPortrait:'portrait.jpg',imgUrlSquare:'square.jpg',
    imgRatioPortrait:'2:3',video:{url:'movie.mp4'},versions:{square:{crop:'original'}}};
  const initial = context.CardLinks.saveConfig(legacy,{...legacy,_cardLinksEditing:'v2',desc:'目前新版說明'},true);
  let stored = {rowId:'CARD_fixture','姓名':'測試名片','自訂名片設定':JSON.stringify(initial)};
  context.allCardsData = [structuredClone(stored)];
  vm.runInContext('let currentAdminCardSession=null, adminCardOpenSequence=0, currentAdminEcardImgs={}, currentAdminEcardRatios={}, currentEditButtons=[];',context);
  for (const name of ['openEditCardModal','saveCardEdit','closeEditCardModal']) {
    const start = source.search(new RegExp('    (?:async )?function ' + name + '\\('));
    const rest = source.slice(start + 1);
    const next = rest.search(/\n    (?:async )?function /);
    vm.runInContext(source.slice(start, next < 0 ? undefined : start + 1 + next), context);
  }
  return {context,el,messages,requests,legacy,initial,
    open:()=>context.openEditCardModal('CARD_fixture'), save:()=>context.saveCardEdit(),
    stored:()=>JSON.parse(stored['自訂名片設定']),
    mode:value=>{mode=value;}, unavailable:()=>{unavailable=true;}, deny:()=>{rejection=true;},
    concurrent(){ const config=context.CardLinks.saveConfig(stored['自訂名片設定'],{...context.CardLinks.project(stored['自訂名片設定'],{},true),_cardLinksEditing:'v2',desc:'另一頁已更新'},true); stored['自訂名片設定']=JSON.stringify(config); },
    refreshes:()=>refreshes
  };
}
for (const page of ['admin.html','admin-v2.html']) {
  test(page + ': active projection, four lines, original revision, repeat edit and saved cache', async()=>{
    const f=fixture(page); await f.open(); assert.equal(f.el('edit-v-desc').value,'目前新版說明');
    f.el('edit-v-desc').value=description; await f.save();
    assert.equal(f.requests.length,1);
    assert.equal(JSON.parse(f.requests[0].payload.data['自訂名片設定'])._cardLinksRevision,1);
    assert.equal(f.stored().contactLinksV2.desc,description);
    assert.equal(f.stored()._cardLinksRevision,2);
    assert.equal(f.stored().desc,f.legacy.desc);
    assert.deepEqual(f.stored().video,f.legacy.video);
    assert.deepEqual(f.stored().versions,f.legacy.versions);
    assert.equal(f.stored().imgUrlPortrait,'portrait.jpg');
    assert.equal(f.stored().imgUrlSquare,'square.jpg');
    assert.equal(f.stored().contactLinksV2.title,'保留標題');
    await f.open(); assert.equal(f.el('edit-v-desc').value,description);
    f.el('edit-v-desc').value='再次編輯'; await f.save();
    assert.equal(f.stored()._cardLinksRevision,3);
    assert.equal(f.stored().contactLinksV2.desc,'再次編輯');
    assert.equal(f.el('btn-save-card').disabled,false);
  });
  test(page + ': stale revision rejected, failed draft and original baseline remain', async()=>{
    const f=fixture(page); await f.open(); f.el('edit-v-desc').value=description;
    f.concurrent(); await f.save();
    assert.equal(f.stored().contactLinksV2.desc,'另一頁已更新');
    assert.equal(f.el('edit-v-desc').value,description);
    assert.match(f.messages.at(-1),/其他頁面更新/);
    await f.save(); assert.match(f.messages.at(-1),/其他頁面更新/);
    assert.equal(f.refreshes(),0); assert.equal(f.el('btn-save-card').disabled,false);
  });
  test(page + ': rollback edits legacy while preserving v2 snapshot', async()=>{
    const f=fixture(page,false); await f.open(); assert.equal(f.el('edit-v-desc').value,'舊說明');
    f.el('edit-v-desc').value=description; await f.save();
    assert.equal(f.stored().desc,description);
    assert.deepEqual(f.stored().contactLinksV2,JSON.parse(JSON.stringify(f.initial.contactLinksV2)));
  });
  test(page + ': mode changes or unreachable config block write without losing draft',async()=>{
    for(const fail of ['mode','unavailable']) {
      const f=fixture(page); await f.open(); f.el('edit-v-desc').value=description;
      if(fail==='mode')f.mode(false);else f.unavailable(); await f.save();
      assert.equal(f.requests.length,0); assert.equal(f.el('edit-v-desc').value,description);
      assert.equal(f.el('btn-save-card').disabled,false); assert.match(f.messages.at(-1),/保留/);
    }
  });
  test(page + ': server permission rejection keeps draft; no retry or forced update', async()=>{
    const f=fixture(page);await f.open();f.deny();f.el('edit-v-desc').value=description;await f.save();
    assert.equal(f.requests.length,1);assert.equal(f.el('edit-v-desc').value,description);
    assert.equal(f.stored()._cardLinksRevision,1);assert.equal(f.refreshes(),0);
  });
  test(page + ': cancel/edit buttons never mutate the cached original config',async()=>{
    const f=fixture(page);await f.open();
    vm.runInContext("currentEditButtons[0].l='草稿電話'",f.context);
    f.context.closeEditCardModal();await f.open();
    assert.equal(vm.runInContext('currentEditButtons[0].l',f.context),'電話');
    assert.equal(f.requests.length,0);
  });
  test(page + ': HTML includes shared helpers and all inline scripts parse',()=>{
    const html=read(page);assert.match(html,/js\/shared\/card-links\.js\?v=4/);
    assert.match(html,/js\/shared\/admin-card-editor\.js\?v=1/);
    for(const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g))new vm.Script(match[1]);
  });
}
