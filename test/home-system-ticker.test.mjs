import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../js/modules/home.js',import.meta.url),'utf8');
const start=source.indexOf('    let homeTickerController_ = null;');
const end=source.indexOf('    window.renderHomeAnnouncements =',start);
assert.ok(start>=0&&end>start,'actual ticker implementation must be present');
const block=source.slice(start,end);

function fixture(fetchAPI=async()=>({success:false})) {
  const animations=[], observers=[],listeners=new Map();
  class Element {
    constructor(){this.children=[];this.parentElement=null;this.style={};this.attributes={};this._text='';this.clientWidth=320;this.hidden=false;
      this.classList={add:kind=>{if(kind==='hidden')this.hidden=true;},remove:kind=>{if(kind==='hidden')this.hidden=false;},contains:kind=>kind==='hidden'&&this.hidden};}
    set textContent(value){this._text=String(value);this.children=[];}
    get textContent(){return this.children.length?this.children.map(child=>child.textContent).join(''):this._text;}
    setAttribute(key,value){this.attributes[key]=String(value);}
    removeAttribute(key){delete this.attributes[key];}
    append(...children){for(const child of children){child.parentElement=this;this.children.push(child);}}
    replaceChildren(...children){for(const child of this.children)child.parentElement=null;this.children=[];this._text='';this.append(...children);}
    get lastElementChild(){return this.children.at(-1);}
    remove(){if(this.parentElement){const parent=this.parentElement;parent.children=parent.children.filter(child=>child!==this);this.parentElement=null;}}
    cloneNode(){const clone=new Element();clone._text=this._text;clone.style={...this.style};clone.attributes={...this.attributes};return clone;}
    getBoundingClientRect(){return {width:Math.max(1,this._text.length*12+64)};}
    animate(frames,options){const entry={frames,options,cancelled:false,cancel(){this.cancelled=true;}};animations.push(entry);return entry;}
  }
  class Observer {constructor(cb){this.cb=cb;this.disconnected=false;observers.push(this);}observe(){}disconnect(){this.disconnected=true;}}
  const box=new Element(),viewport=new Element(),text=new Element();text.parentElement=viewport;box.hidden=true;
  const win={fetchAPI,addEventListener:(type,cb)=>listeners.set(type,cb),removeEventListener:(type,cb)=>{if(listeners.get(type)===cb)listeners.delete(type);}};
  const document={getElementById:id=>id==='home-system-ticker'?box:id==='home-system-ticker-text'?text:null,createElement:()=>new Element()};
  vm.runInNewContext(block,{window:win,document,ResizeObserver:Observer,Promise,console});
  return {win,box,viewport,text,animations,observers,listeners};
}

test('one or many messages move continuously with enough copies to fill the viewport',async()=>{
  for(const messages of [['短訊'],['公告一','今天的統計'],['長'.repeat(120)]]){
    const f=fixture();await f.win.startHomeSystemTicker(messages);
    assert.equal(f.box.hidden,false);assert.equal(f.animations.length,1);
    const track=f.text.children[0],segment=track.children[0],a=f.animations[0],width=segment.getBoundingClientRect().width;
    assert.equal(a.options.iterations,Infinity);assert.equal(a.options.easing,'linear');
    assert.equal(a.frames[0].transform,'translateX(0px)');assert.equal(a.frames.at(-1).transform,`translateX(-${width}px)`);
    assert.ok(a.options.duration>0);assert.ok((track.children.length-1)*width>=f.viewport.clientWidth,'copies cover the entire viewport at the loop boundary');
    assert.equal(track.attributes['aria-hidden'],'true');assert.equal(f.text.attributes['aria-label'],messages.join('　 •　 '));
  }
});

test('updates cancel previous motion and observer; empty data stops and hides ticker',async()=>{
  const f=fixture();await f.win.startHomeSystemTicker(['old']);const old=f.animations[0],observer=f.observers[0];
  await f.win.startHomeSystemTicker(['old']);assert.equal(f.animations.length,1,'same data does not restart the running animation');
  await f.win.startHomeSystemTicker(['new']);assert.equal(old.cancelled,true);assert.equal(observer.disconnected,true);
  assert.equal(f.animations.length,2);assert.equal(f.text.attributes['aria-label'],'new');
  await f.win.startHomeSystemTicker([]);assert.equal(f.animations[1].cancelled,true);assert.equal(f.box.hidden,true);
  assert.equal(f.text.children.length,0);assert.equal(f.text.attributes['aria-label'],undefined);assert.equal(f.listeners.has('resize'),false);
});

test('ticker treats user text as text, and reflows without stacking animations',async()=>{
  const f=fixture();const value='<img src=x onerror=alert(1)> & 訊息';await f.win.startHomeSystemTicker([value]);
  const track=f.text.children[0];assert.equal(track.children[0].textContent,value);assert.equal(f.text.attributes['aria-label'],value);
  f.viewport.clientWidth=660;f.listeners.get('resize')();assert.equal(f.animations[0].cancelled,false);assert.equal(f.animations.length,1);
  assert.ok((track.children.length-1)*track.children[0].getBoundingClientRect().width>=660);
  f.listeners.get('resize')();assert.equal(f.animations.length,1,'unchanged segment widths do not restart motion');
  f.animations[0].currentTime=500;track.children[0].getBoundingClientRect=()=>({width:300});f.listeners.get('resize')();
  assert.equal(f.animations[0].cancelled,true);assert.equal(f.animations.length,2);assert.equal(f.animations[1].currentTime,500);
});

test('configured and live messages load independently, deduplicate and hide when empty',async()=>{
  const f=fixture(async action=>action==='getSystemTicker'?{data:{enabled:true,messages:['公告','📇 今日全系統新增收藏名片 3 張']}}:{success:true,data:{todayCardCollectionCount:3}});
  await f.win.loadHomeSystemTicker();assert.equal(f.text.attributes['aria-label'],'公告　 •　 📇 今日全系統新增收藏名片 3 張');
  f.win.fetchAPI=async action=>action==='getSystemTicker'?Promise.reject(Error('offline')):{success:true,data:{todayCardCollectionCount:4}};
  await f.win.loadHomeSystemTicker();assert.equal(f.text.attributes['aria-label'],'📇 今日全系統新增收藏名片 4 張');
  f.win.fetchAPI=async()=>({success:false});await f.win.loadHomeSystemTicker();assert.equal(f.box.hidden,true);
});

test('slower older loads cannot overwrite newer ticker content',async()=>{
  const pending=[];const f=fixture(action=>new Promise(resolve=>pending.push({action,resolve})));
  const older=f.win.loadHomeSystemTicker(),newer=f.win.loadHomeSystemTicker();
  pending[2].resolve({data:{enabled:true,text:'新公告'}});pending[3].resolve({success:false});await newer;
  pending[0].resolve({data:{enabled:true,text:'舊公告'}});pending[1].resolve({success:false});await older;
  assert.equal(f.text.attributes['aria-label'],'新公告');assert.equal(f.animations.length,1);
});
