import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import '../js/shared/card-links.js';
const links=globalThis.CardLinks;
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const script=read('js/card-email-compose.js');
const html=read('card-email.html');
function fixture(hash='#to=demo%2Bcard%40example.com',clipboard=true){
  const elements=new Map(),listeners={},copies=[],navigations=[];
  const element=id=>{if(!elements.has(id))elements.set(id,{value:'',hidden:false,events:{},addEventListener(type,fn){this.events[type]=fn;},removeAttribute(key){delete this[key];},focus(){this.focused=true;},select(){this.selected=true;}});return elements.get(id);};
  const location={hash,replace:v=>navigations.push(v)},history={length:1,back:()=>navigations.push('back')};
  const context=vm.createContext({document:{getElementById:element},window:{CardLinks:links,addEventListener:(type,fn)=>listeners[type]=fn},location,history,URLSearchParams,navigator:clipboard?{clipboard:{writeText:async value=>copies.push(value)}}:{}});
  vm.runInContext(script,context);
  return {element,location,history,copies,navigations,changeHash(value){location.hash=value;listeners.hashchange();}};
}

test('mail is a compose action, never clipboard, and original saved mailto is unchanged',()=>{
  for(const value of ['demo@example.com','mailto:demo@example.com','MAILTO:demo+card@example.com']){
    const url=new URL(links.emailComposeUrl(value));assert.equal(url.protocol,'https:');assert.equal(url.hostname,'fangwl591021.github.io');assert.equal(url.pathname,'/LINE-/card-email.html');assert.equal(url.search,'?openExternalBrowser=1');
    const email=links.emailAddress(value);assert.equal(new URLSearchParams(url.hash.slice(1)).get('to'),email);
    const saved=links.saveConfig({}, {_cardLinksEditing:'v2',buttons:[{l:'電子郵件',u:value,c:'#F59E0B'}]},true);
    assert.equal(saved.contactLinksV2.buttons[0].u,'mailto:'+email);
    const action=links.flexRows(saved.contactLinksV2.buttons)[0].contents[0].action;assert.equal(action.type,'uri');assert.equal(action.uri,url.href);assert.equal(action.clipboardText,undefined);
  }
});

test('reject malformed addresses, header injection and arbitrary schemes, never creates a send URL',()=>{
  for(const value of ['bad','mailto:bad','a@example.com?subject=hello','a@example.com#x','a@example.com&bcc=b@example.com','a@example.com\r\nBcc:b@example.com','a%0d%0a@example.com','<img>@example.com','javascript:a@example.com','mailto:a@example.com,b@example.com','https://a@example.com','a@@example.com','a@-bad.com','a@bad..com','x'.repeat(65)+'@example.com']){
    assert.equal(links.emailAddress(value),'',value);assert.equal(links.emailComposeUrl(value),'',value);assert.equal(links.emailTargets(value),null,value);
  }
  const target=links.emailTargets('demo+card@example.com');assert.equal(target.app,'mailto:demo+card@example.com');
  for(const key of ['gmail','outlook']){const url=new URL(target[key]);assert.equal(url.searchParams.get('to'),'demo+card@example.com');assert.deepEqual([...url.searchParams.keys()].filter(k=>/bcc|cc|body|subject|send/.test(k)),[]);}
});

test('render prefilled compose options only; no startup navigation, clipboard, request, login or mutation',()=>{
  const f=fixture();assert.equal(f.element('recipient').value,'demo+card@example.com');assert.equal(f.element('compose').hidden,false);
  assert.equal(f.element('mail-app').href,'mailto:demo+card@example.com');assert.match(f.element('gmail').href,/^https:\/\/mail.google.com/);assert.match(f.element('outlook').href,/^https:\/\/outlook.live.com/);
  assert.deepEqual(f.copies,[]);assert.deepEqual(f.navigations,[]);
  f.element('mail-app').events.click();assert.match(f.element('status').textContent,/尚未寄出/);assert.equal(f.copies.length,0);
  assert.doesNotMatch(script,/fetch\(|fetchAPI|localStorage|sessionStorage|liff\.|sendMail|sendEmail|innerHTML/);
});

test('invalid/duplicate/unknown/oversized hash disables every action; stale recipient cannot remain clickable',()=>{
  const f=fixture();for(const hash of ['', '#to=bad','#to=a%40example.com&to=b%40example.com','#to=a%40example.com&redirect=https://evil.test','#to=a%40example.com%0d%0aBcc%3Ab%40example.com','#to='+ 'a'.repeat(1201)]){
    f.changeHash(hash);assert.equal(f.element('compose').hidden,true);assert.equal(f.element('error').hidden,false);assert.equal(f.element('recipient').value,'');
    for(const id of ['mail-app','gmail','outlook'])assert.equal(f.element(id).href,undefined);
  }
  f.changeHash('#to=another%40example.com');assert.equal(f.element('recipient').value,'another@example.com');assert.equal(f.element('compose').hidden,false);
});

test('copy is explicit fallback with manual selection on failure; back is visible and fixed local fallback',async()=>{
  const f=fixture();await f.element('copy').events.click();assert.deepEqual(f.copies,['demo+card@example.com']);assert.match(f.element('status').textContent,/已複製.*尚未寄出/);
  const failed=fixture(undefined,false);await failed.element('copy').events.click();assert.equal(failed.element('recipient').selected,true);assert.match(failed.element('status').textContent,/長按/);
  failed.element('back').events.click();assert.deepEqual(failed.navigations,['./']);f.history.length=2;f.element('back').events.click();assert.deepEqual(f.navigations,['back']);
  assert.match(html,/<nav>.*id="back".*返回.*href="\.\/"/);assert.match(html,/name="referrer" content="no-referrer"/);assert.match(html,/Content-Security-Policy/);assert.doesNotMatch(html,/https:\/\/.*(?:script|stylesheet)/);
  assert.match(read('js/modules/mycard.js'),/收件人自動帶入，不會直接複製/);
});

test('Chromium mobile/desktop walks actual compose page links without sending mail or accessing external accounts', {skip:!process.env.RUN_CARD_EMAIL_BROWSER_TESTS},async()=>{
  const {createRequire}=await import('node:module');const {chromium}=createRequire(import.meta.url)('playwright');
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try{
    for(const width of [320,390,1280]){
      const page=await browser.newPage({viewport:{width,height:844}}),requests=[];
      await page.route('**/*',async route=>{const url=new URL(route.request().url()),path=url.pathname;
        if(url.origin!=='https://fangwl591021.github.io'){requests.push(url.href);return route.abort();}
        if(path==='/LINE-/card-email.html')return route.fulfill({contentType:'text/html',body:html});
        if(path==='/LINE-/js/shared/card-links.js')return route.fulfill({contentType:'text/javascript',body:read('js/shared/card-links.js')});
        if(path==='/LINE-/js/card-email-compose.js')return route.fulfill({contentType:'text/javascript',body:script});
        return route.abort();
      });
      // Intercept native/provided-mailbox navigation before any real account
      // opens. This proves click targets, not device mail-client activation.
      await page.addInitScript(()=>{window.clickTargets=[];window.copyCalls=[];Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async v=>window.copyCalls.push(v)}});document.addEventListener('click',e=>{const a=e.target.closest('a');if(a&&a.href&&(/^(mailto:|https:\/\/mail.google.com|https:\/\/outlook.live.com)/.test(a.href))){window.clickTargets.push(a.href);e.preventDefault();}},true);});
      await page.goto(links.emailComposeUrl('demo+card@example.com'));await page.locator('#compose').waitFor({state:'visible'});
      assert.equal(await page.locator('#recipient').inputValue(),'demo+card@example.com');assert.deepEqual(await page.evaluate(()=>copyCalls),[]);
      for(const id of ['mail-app','gmail','outlook'])await page.locator('#'+id).click();
      const targets=await page.evaluate(()=>clickTargets);assert.equal(targets[0],'mailto:demo+card@example.com');assert.match(targets[1],/^https:\/\/mail.google.com/);assert.match(targets[2],/^https:\/\/outlook.live.com/);
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      await page.getByText('其他方式',{exact:true}).click();await page.locator('#copy').click();assert.deepEqual(await page.evaluate(()=>copyCalls),['demo+card@example.com']);assert.deepEqual(requests,[]);
      await page.evaluate(()=>location.hash='to=bad&redirect=https://evil.test');await page.locator('#error').waitFor({state:'visible'});assert.equal(await page.locator('#mail-app').getAttribute('href'),null);
      await page.close();
    }
  }finally{await browser.close();}
});
