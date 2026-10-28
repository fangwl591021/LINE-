import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {labelsFor,displayFieldValue,sourceHashFor,policyNotesFor} from '../js/modules/reward-application-pdf.mjs';
const read=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8');
const id='11111111-2222-4333-8444-555555555555';
function entry(){const window={};vm.runInNewContext(read('js/modules/reward-applications-entry.js'),{window,URL,Set,document:{currentScript:{src:'https://fixture.test/js/modules/reward-applications-entry.js'}}});return window;}

test('notification review routes carry only an opaque application and fixed kind, never member authority',()=>{
 const {readSignedApplicationReviewEntry:parse}=entry();
 for(const kind of ['reward','discount','partner','full']){
  const parsed=parse(new URLSearchParams({shopSection:'mine',applicationReview:'1',applicationKind:kind,applicationId:id}));
  assert.equal(JSON.stringify(parsed),JSON.stringify({kind,applicationId:id}));
 }
 for(const suffix of ['&applicationId='+id,'&applicationKind=reward','&shopSection=manage','&role=admin','&target=U'+'a'.repeat(32),'&shopItem=other','&shareCardId=other','&checkin=1']){
  assert.equal(parse(new URLSearchParams('shopSection=mine&applicationReview=1&applicationKind=partner&applicationId='+id+suffix)),null);
 }
 for(const changes of [{applicationReview:'0'},{applicationKind:'other'},{applicationId:'../private'},{applicationId:'<script>'},{shopSection:'manage'}]){
  assert.equal(parse(new URLSearchParams({shopSection:'mine',applicationReview:'1',applicationKind:'partner',applicationId:id,...changes})),null);
 }
 assert.equal(parse(new URLSearchParams({shopSection:'mine'})),null);
});

test('signed snapshot labels and metadata preserve all new kind fields and old PDF values',()=>{
 const partner={form_kind:'partner',fields:{unit_name:'合成公司',party_type:'company',bank_account:'1234567890'},field_labels:{unit_name:'簽約方',bank_account:'獎金帳號'},template:{source_sha256:'a'.repeat(64),content_sha256:'b'.repeat(64)},terms:{clarifications:['已核對的制度說明']}};
 const labels=labelsFor(partner);assert.equal(labels.unit_name,'簽約方');assert.equal(labels.bank_account,'獎金帳號');assert.equal(labels.party_type,'簽約身分');
 assert.equal(displayFieldValue('party_type','company'),'公司／行號／法人團體');assert.equal(displayFieldValue('party_type','natural_person'),'自然人');
 assert.equal(sourceHashFor(partner),'a'.repeat(64));assert.deepEqual(policyNotesFor(partner),['已核對的制度說明']);
 assert.equal(labelsFor({form_kind:'reward'}).unit_types,'單位類型');assert.equal(labelsFor({form_kind:'discount'}).services,'主要商品／服務');assert.equal(labelsFor({form_kind:'full'}).address,'地址');
 assert.equal(displayFieldValue('unit_types',['企業','商會']),'企業、商會');
});

test('four-kind form and notification navigation retain account, review and retry boundaries',()=>{
 const ui=read('js/modules/reward-applications.js'),auth=read('js/auth.js'),shop=read('js/modules/store-shop.js'),entrySource=read('js/modules/store-shop-entry.js');
 assert.match(ui,/const kinds=\['reward','discount','partner','full'\]/);assert.match(ui,/class="ra-kind-tabs"/);assert.match(ui,/fieldDescriptors=Array\.isArray\(template\.fields\)/);
 assert.match(ui,/formDraft\.referrer_name=template\.referral/);assert.match(ui,/field\.readonly\?'readonly aria-readonly/);
 assert.match(ui,/strokes:JSON\.parse\(JSON\.stringify\(strokes\)\)/);assert.match(ui,/用原簽署內容重試送出/);assert.match(ui,/getAccessToken\(\)===token/);
 assert(auth.indexOf('readSignedApplicationReviewEntry')<auth.indexOf("const cashierEntryConflict = shopSection === 'cashier'"));
 assert.match(auth,/請使用平台管理員帳號登入後查看此申請/);assert.match(auth,/applicationReview:reviewEntry/);
 assert.match(entrySource,/options\.applicationReview\|\|null/);assert.match(shop,/kind:applicationReview\.kind,applicationId:applicationReview\.applicationId,isCurrent/);
 const css=read('css/reward-applications.css');assert.match(css,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
});

test('every affected served entry uses the new signing/editor cache versions',()=>{
 for(const file of ['index.html','admin.html','admin-v2.html']){assert.match(read(file),/reward-applications-entry\.js\?v=3/);assert.match(read(file),/partner-contracts-entry\.js\?v=11510-2/);}
 assert.match(read('index.html'),/js\/auth\.js\?v=11\.09/);assert.match(read('index.html'),/store-shop-entry\.js\?v=76/);
 for(const file of ['js/modules/store-shop-entry.js','store-shop.html'])assert.match(read(file),/store-shop\.js\?v=73/);
 assert.match(read('js/modules/reward-applications.js'),/reward-application-pdf\.mjs\?v=3/);assert.match(read('js/modules/reward-applications.js'),/reward-applications\.css\?v=2/);
});
