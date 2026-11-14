import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../js/modules/card-page-banner-shortcuts.js',import.meta.url),'utf8');
function element(){
  const attrs={}, classes=new Set();
  return {textContent:'',style:{setProperty(){},removeProperty(){}},
    classList:{add(v){classes.add(v);},remove(v){classes.delete(v);},contains(v){return classes.has(v);},toggle(v,on){on?classes.add(v):classes.delete(v);}},
    setAttribute(k,v){attrs[k]=v;},getAttribute(k){return attrs[k]??null;},removeAttribute(k){delete attrs[k];}};
}
function fixture(){
  const controls={points:element(),checkin:element(),home:element(),profile:element()};
  for(const name of ['points','checkin','home']){
    const parts={'.material-symbols-outlined':element(),'.home-top-shortcut-label':element(),'.home-top-shortcut-value':element()};
    controls[name].parts=parts;controls[name].querySelector=key=>parts[key];
  }
  const children=[controls.profile,controls.points,controls.checkin,controls.home];
  const row={querySelector:()=>controls.profile,get firstElementChild(){return children[0];},get lastElementChild(){return children.at(-1);},
    prepend(el){children.splice(children.indexOf(el),1);children.unshift(el);},append(el){children.splice(children.indexOf(el),1);children.push(el);}};
  controls.home.parentElement=row;
  const pages={card:element(),customers:element(),home:element()};
  pages.card.classList.add('hidden');pages.customers.classList.add('hidden');
  const banner={querySelector(s){return controls[s.match(/"(\w+)"/)?.[1]];}};
  const document={readyState:'complete',head:{appendChild(){}},createElement:()=>element(),
    getElementById(id){return id==='home-profile-card'?banner:id.startsWith('page-')?pages[id.slice(5)]:null;}};
  const window={currentPage:'home',goPage(page){this.currentPage=page;}};
  vm.runInNewContext(source,{document,window,setTimeout});
  return {window,controls};
}
test('home wallet QR stays separate from share, cashier, card and customer shortcuts',()=>{
  const {window,controls}=fixture(), third=controls.checkin, fourth=controls.home;
  const label=()=>third.parts['.home-top-shortcut-label'].textContent;
  const value=()=>third.parts['.home-top-shortcut-value'].textContent;
  assert.equal(label(),'我的 QR');assert.equal(value(),'（累積／折抵）');
  assert.equal(third.getAttribute('onclick'),'window.openHomeMemberQr()');
  assert.equal(fourth.getAttribute('onclick'),'window.showInviteLink?.()');
  window.goPage('card');assert.equal(label(),'我的客戶');assert.equal(third.getAttribute('onclick'),"window.goPage('customers')");
  window.goPage('customers');assert.equal(label(),'我的客戶');
  window.goPage('points-wallet');assert.equal(label(),'簽到贈點');assert.equal(value(),'每日 10 點');
  window.goPage('home');assert.equal(label(),'我的 QR');assert.equal(third.getAttribute('onclick'),'window.openHomeMemberQr()');
});
