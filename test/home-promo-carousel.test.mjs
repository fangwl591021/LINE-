import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import vm from 'node:vm';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const css=readFileSync(new URL('../css/home-discovery-20261110.css',import.meta.url),'utf8');
const script=readFileSync(new URL('../js/modules/home-discovery-20261110.js',import.meta.url),'utf8');
function fixture(reduced=false){
 const slides=Array.from({length:7},(_,i)=>({hidden:i!==0}));
 const dots=Array.from({length:7},()=>({attributes:{},setAttribute(k,v){this.attributes[k]=v},addEventListener(_,fn){this.click=fn}}));
 const toggle={setAttribute(k,v){this[k]=v},addEventListener(_,fn){this.click=fn}};
 const controls={hidden:true},home={hidden:false,classList:{contains(){return home.hidden}}};
 const carousel={dataset:{},querySelectorAll(s){return s==='.home-promo-slide'?slides:dots},querySelector(s){return s==='.home-promo-controls'?controls:toggle}};
 const document={readyState:'complete',hidden:false,getElementById(id){return id==='home-promo-carousel'?carousel:id==='page-home'?home:null}};
 let next=0,intervals=new Map();
 const context={window:{matchMedia:()=>({matches:reduced})},document,setInterval(fn,ms){assert.equal(ms,3000);intervals.set(++next,fn);return next},clearInterval(id){intervals.delete(id)}};
 vm.runInNewContext(script,context);
 return {slides,dots,toggle,controls,home,document,tick(){for(const fn of [...intervals.values()])fn()},get active(){return slides.findIndex(s=>!s.hidden)},get intervalCount(){return intervals.size}};
}
test('homepage retains the shop entry and includes all six original images in a fixed-height frame',()=>{
 assert.match(html,/id="home-mall-banner"[^>]*onclick="window\.openHomeShopCategory\(''\)"/);
 assert.match(css,/\.home-promo-frame\s*\{[^}]*aspect-ratio:1670\/942/);
 for(let i=1;i<=6;i++){const name=`home-promo-20261116-0${i}.jpg`;assert(html.includes(name));assert(existsSync(new URL('../assets/'+name,import.meta.url)));}
});
test('carousel advances every three seconds, skips background pages, and can be controlled',()=>{
 const f=fixture();assert.equal(f.active,0);assert.equal(f.controls.hidden,false);assert.equal(f.intervalCount,1);
 f.tick();assert.equal(f.active,1);f.document.hidden=true;f.tick();assert.equal(f.active,1);
 f.document.hidden=false;f.home.hidden=true;f.tick();assert.equal(f.active,1);f.home.hidden=false;
 f.dots[6].click();assert.equal(f.active,6);assert.equal(f.dots[6].attributes['aria-pressed'],'true');
 f.tick();assert.equal(f.active,0);f.toggle.click();assert.equal(f.intervalCount,0);f.tick();assert.equal(f.active,0);
 f.toggle.click();assert.equal(f.intervalCount,1);f.tick();assert.equal(f.active,1);
});
test('reduced motion starts paused and can be explicitly played',()=>{
 const f=fixture(true);assert.equal(f.intervalCount,0);assert.equal(f.toggle.textContent,'播放');
 f.toggle.click();assert.equal(f.intervalCount,1);f.tick();assert.equal(f.active,1);
});
