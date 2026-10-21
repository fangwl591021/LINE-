import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import {CardLinks as links} from '../worker/card-links.mjs';
const read=path=>fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');
const plain=value=>JSON.parse(JSON.stringify(value));
const mixed='03-3151679 / FAX 03-3150997';
const cases=[
  [mixed,['033151679']],
  ['FAX 03-3150997',[]],['傳真：03-3150997',[]],['ＦＡＸ：０３－３１５０９９７',[]],
  ['TEL/FAX: 03-3150997',[]],['電話／傳真：03-3150997',[]],
  ['03-3150997 (FAX)',[]],['F:03-3150997 / 03-3150998',[]],
  ['FAX:03-3150997 / TEL:03-3151679',['033151679']],
  ['03-3151679 / 03-3151680',['033151679','033151680']],
  ['公司電話：03-3151679 分機 123',['033151679']],
  ['0926-809669',['0926809669']],['+886 3 3151679',['+88633151679']],
  ['00886-3-3151679',['+88633151679']],['88633151679',['+88633151679']],
  ['請打電話給我 03-3151679',[]],['03-3151679ABC',[]],['',[]]
];
for(const [input,expected] of cases)test('voice extraction: '+input,()=>assert.deepEqual(links.phoneNumbers(input),expected));
test('screenshot creates two voice buttons, neither FAX nor a combined number',()=>{
  const card={mobile:'0926-809669',officePhone:mixed,fax:'03-3150997'};
  assert.deepEqual(links.recognized(card).map(b=>b.u),['tel:0926809669','tel:033151679']);
  assert.equal(card.officePhone,mixed);
  assert.deepEqual(links.recognized({officePhone:'03-3150997',fax:'FAX:03-3150997'}),[]);
});
test('explicit save rejects FAX and mixed tel in both legacy and v2',()=>{
  for(const button of [
    {l:'FAX',u:'tel:033150997'}, {l:'傳真',u:'tel:033150997'},
    {l:'公司電話',u:'tel:'+mixed}, {l:'公司電話',u:'tel:03-3151679/03-3150997'},
    {l:'公司電話',u:'tel:03-3151679ABC'}, {l:'公司電話',u:mixed}
  ]) {
    assert.equal(links.normalize([button]).length,0);
    assert.throws(()=>links.normalize([button],true),/FAX|電話/);
    for(const enabled of [false,true])assert.throws(()=>links.saveConfig({}, {buttons:[button],...(enabled?{_cardLinksEditing:'v2'}:{})},enabled),/FAX|電話/);
  }
});
test('old FAX button hidden in projection/Flex without rewriting saved snapshots',()=>{
  const raw={buttons:[{l:'市話',u:'tel:033151679'},{l:'FAX',u:'tel:033150997'}],videoUrl:'https://example.com/movie.mp4'};
  const before=JSON.stringify(raw);
  for(const enabled of [false,true])assert.equal(links.project(raw,{},enabled).buttons.length,1);
  assert.equal(links.flexRows(raw.buttons)[0].contents.length,1);
  assert.equal(JSON.stringify(raw),before);
  assert.equal(links.project({contactLinksV2:{buttons:[{l:'誤標公司電話',u:'tel:033150997'}]}},{fax:'03-3150997'},true).buttons.length,0);
});
test('frontend recognized buttons and explicit save use shared rules',()=>{
  const win={CardLinks:links,currentEcardLinksV2:true};
  const ctx=vm.createContext({window:win,console,URL,document:{addEventListener(){},getElementById:()=>null}});
  vm.runInContext(read('js/modules/ecard.js'),ctx);
  assert.deepEqual(plain(ctx.buildRecognizedCardButtons({officePhone:mixed})).map(b=>b.u),['tel:033151679']);
  assert.equal(ctx.firstPhoneForTel('FAX 03-3150997'),'');
  for(const mode of [false,true]) {
    win.currentEcardLinksV2=mode;
    assert.throws(()=>ctx.normalizeECardButtonsForSave([{l:'FAX',u:'tel:033150997'}]),/FAX/);
  }
});
test('actual Worker OCR and display phone helpers share safe extraction',()=>{
  const source=read('workerbackup.js');
  const method=name=>{
    const start=source.indexOf('  '+name+'('),end=source.indexOf('\n  },',start)+5;
    return vm.runInNewContext('({'+source.slice(start,end)+'})',{CardLinks:links})[name];
  };
  const helper={text:v=>String(v||'')};
  for(const name of ['firstPhoneForTel','normalizePhoneForTel']) {
    const fn=method(name);
    assert.equal(fn.call(helper,mixed),'033151679');
    assert.equal(fn.call(helper,'FAX 03-3150997'),'');
  }
  const fn=method('normalizeCardButton');
  helper.normalizeActionUri=v=>links.uri(v);
  assert.equal(fn.call(helper,{l:'FAX',u:'tel:033150997'}),null);
  assert.equal(fn.call(helper,{l:'市話',u:'tel:'+mixed}),null);
  assert.equal(fn.call(helper,{l:'市話',u:'tel:03-3151679'}).u,'tel:033151679');
});
