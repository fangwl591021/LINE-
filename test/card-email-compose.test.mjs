import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import '../js/shared/card-links.js';
const links=globalThis.CardLinks;
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const script=read('js/card-email-compose.js');
const html=read('card-email.html');
function fixture(hash='#to=demo%2Bcard%40example.com',blocked=false){
  const elements=new Map(),listeners={},copies=[],navigations=[];
  const element=id=>{if(!elements.has(id))elements.set(id,{value:'',hidden:false,events:{},addEventListener(type,fn){this.events[type]=fn;},removeAttribute(key){delete this[key];},focus(){this.focused=true;},select(){this.selected=true;}});return elements.get(id);};
  const location={hash,replace:v=>{if(blocked&&v.startsWith('https:'))throw Error('Navigation blocked');navigations.push(v);}},history={length:1,back:()=>navigations.push('back')};
  const context=vm.createContext({document:{getElementById:element},window:{CardLinks:links,addEventListener:(type,fn)=>listeners[type]=fn},location,history,URLSearchParams,navigator:{clipboard:{writeText:async value=>copies.push(value)}}});
  vm.runInContext(script,context);
  return {element,location,history,copies,navigations,changeHash(value){location.hash=value;listeners.hashchange();}};
}

test('mail is a compose action, never clipboard, and original saved mailto is unchanged',()=>{
  for(const value of ['demo@example.com','mailto:demo@example.com','MAILTO:demo+card@example.com']){
    const url=new URL(links.emailComposeUrl(value));assert.equal(url.protocol,'https:');assert.equal(url.hostname,'mail.google.com');assert.equal(url.pathname,'/mail/');assert.equal(url.searchParams.get('openExternalBrowser'),'1');
    const email=links.emailAddress(value);assert.equal(url.searchParams.get('to'),email);assert.equal(url.searchParams.get('view'),'cm');assert.equal(url.searchParams.get('fs'),'1');assert.equal(url.hash,'');
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

test('old HTTPS entry automatically redirects to Gmail, with no chooser, native mail, clipboard, login or mutation',()=>{
  const f=fixture();assert.equal(f.element('compose').hidden,false);
  assert.equal(f.element('gmail').href,links.emailComposeUrl('demo+card@example.com'));
  assert.deepEqual(f.copies,[]);assert.deepEqual(f.navigations,[links.emailComposeUrl('demo+card@example.com')]);
  assert.match(f.element('status').textContent,/尚未寄出/);
  assert.doesNotMatch(script,/fetch\(|fetchAPI|localStorage|sessionStorage|liff\.|sendMail|sendEmail|innerHTML/);
  assert.doesNotMatch(script,/mailto:|clipboard|mail-app|outlook/);assert.doesNotMatch(html,/id="(?:mail-app|copy|outlook)"|選擇寄信方式/);
});

test('invalid/duplicate/unknown/oversized hash disables every action; stale recipient cannot remain clickable',()=>{
  const f=fixture();for(const hash of ['', '#to=bad','#to=a%40example.com&to=b%40example.com','#to=a%40example.com&redirect=https://evil.test','#to=a%40example.com%0d%0aBcc%3Ab%40example.com','#to='+ 'a'.repeat(1201)]){
    f.changeHash(hash);assert.equal(f.element('compose').hidden,true);assert.equal(f.element('error').hidden,false);
    assert.equal(f.element('gmail').href,undefined);assert.equal(f.navigations.length,1);
  }
  f.changeHash('#to=another%40example.com');assert.equal(f.navigations.at(-1),links.emailComposeUrl('another@example.com'));assert.equal(f.element('compose').hidden,false);
});

test('blocked redirect has a single manual Gmail fallback and visible back, with no app or copy options',async()=>{
  const failed=fixture(undefined,true);assert.match(failed.element('status').textContent,/直接開啟 Gmail/);assert.equal(failed.element('gmail').href,links.emailComposeUrl('demo+card@example.com'));assert.deepEqual(failed.copies,[]);
  failed.element('back').events.click();assert.deepEqual(failed.navigations,['./']);const f=fixture();f.history.length=2;f.element('back').events.click();assert.equal(f.navigations.at(-1),'back');
  assert.match(html,/<nav>.*id="back".*返回.*href="\.\/"/);assert.match(html,/name="referrer" content="no-referrer"/);assert.match(html,/Content-Security-Policy/);assert.doesNotMatch(html,/https:\/\/.*(?:script|stylesheet)/);
  assert.match(read('js/modules/mycard.js'),/不經選擇頁、不呼叫 App/);
});

test('Chromium direct Flex and old HTTPS entry both reach Gmail without choosing, sending or accessing real accounts', {skip:!process.env.RUN_CARD_EMAIL_BROWSER_TESTS},async()=>{
  const {createRequire}=await import('node:module');const {chromium}=createRequire(import.meta.url)('playwright');
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try{
    for(const width of [320,390,1280]){
      const page=await browser.newPage({viewport:{width,height:844}}),requests=[];
      await page.route('**/*',async route=>{const url=new URL(route.request().url()),path=url.pathname;
        if(url.origin==='https://mail.google.com'){requests.push(url.href);return route.fulfill({contentType:'text/html',body:'<meta name="viewport" content="width=device-width,initial-scale=1"><title>Isolated Gmail destination</title><p>Navigation intercepted. No account access or mail sent.</p>'});}
        if(url.origin!=='https://fangwl591021.github.io')return route.abort();
        if(path==='/LINE-/card-email.html')return route.fulfill({contentType:'text/html',body:html});
        if(path==='/LINE-/js/shared/card-links.js')return route.fulfill({contentType:'text/javascript',body:read('js/shared/card-links.js')});
        if(path==='/LINE-/js/card-email-compose.js')return route.fulfill({contentType:'text/javascript',body:script});
        return route.abort();
      });
      await page.goto(links.flexRows([{l:'電子郵件',u:'mailto:demo+card@example.com'}])[0].contents[0].action.uri);
      assert.equal(await page.title(),'Isolated Gmail destination');assert.equal(requests.length,1);assert.equal(new URL(page.url()).searchParams.get('to'),'demo+card@example.com');
      await page.goto('https://fangwl591021.github.io/LINE-/card-email.html#to=demo%2Bcard%40example.com');
      await page.waitForURL(url=>url.hostname==='mail.google.com');assert.equal(requests.length,2);assert.equal(new URL(page.url()).searchParams.get('to'),'demo+card@example.com');
      await page.goto('https://fangwl591021.github.io/LINE-/card-email.html#to=bad&redirect=https://evil.test');await page.locator('#error').waitFor({state:'visible'});assert.equal(await page.locator('#gmail').getAttribute('href'),null);assert.equal(requests.length,2);
      assert.equal(await page.locator('#mail-app,#copy,#outlook').count(),0);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      await page.close();
    }
  }finally{await browser.close();}
});
