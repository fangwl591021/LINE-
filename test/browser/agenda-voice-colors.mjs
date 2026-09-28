// Production panel and status setter only: no microphone, audio upload or task writes.
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
const require=createRequire(import.meta.url);
let pw;try{pw=require('playwright');}catch{pw=require('C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');}
const read=p=>readFileSync(new URL('../../'+p,import.meta.url),'utf8');
const source=read('js/modules/home.js');
const panel=source.split('\n').find(line=>line.includes('id="agenda-voice-status"')).trim();
const start=source.indexOf('function setAgendaVoiceStatus_('),end=source.indexOf('function applyPersonalAgendaVoiceDraft_(',start);
assert.ok(start>=0&&end>start);
const tailwind=await(await fetch('https://cdn.tailwindcss.com',{signal:AbortSignal.timeout(20000)})).text();
const browser=await pw.chromium.launch({headless:true,channel:'chrome'});
const output=join(tmpdir(),'agenda-voice-white-browser');mkdirSync(output,{recursive:true});
let states=0;
try{
  for(const scheme of ['light','dark']){
    const page=await browser.newPage({viewport:{width:390,height:350},isMobile:true,hasTouch:true,colorScheme:scheme});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/*',route=>route.request().url()==='http://localhost/'
      ? route.fulfill({contentType:'text/html; charset=utf-8',body:'<!doctype html><html class="light"><meta name="viewport" content="width=device-width,initial-scale=1"><main class="p-4 bg-white">'+panel+'</main></html>'})
      : route.abort());
    await page.goto('http://localhost/');
    await page.addScriptTag({content:tailwind});
    await page.addStyleTag({content:read('css/styles.css')+'\n'+read('css/home-reference-theme.css')+'\n.material-symbols-outlined{font-size:0!important;display:inline-block;width:16px;height:16px}'});
    await page.addScriptTag({content:source.slice(start,end)});
    for(const width of [390,320]){
      await page.setViewportSize({width,height:350});
      for(const state of [null,['錄音中，請在 15 秒內說完。',false],['AI 正在整理語音內容...',false],['語音辨識失敗，請改用文字建立。',true],['請開始說出日期、時間與行程。',false]]){
        if(state)await page.evaluate(([message,error])=>setAgendaVoiceStatus_(message,error),state);
        await page.waitForFunction(()=>getComputedStyle(document.getElementById('agenda-voice-status')).color==='rgb(255, 255, 255)');
        const result=await page.locator('#agenda-voice-status').evaluate(node=>({
          color:getComputedStyle(node).color,background:getComputedStyle(node).backgroundColor,
          panel:getComputedStyle(node.parentElement.parentElement).backgroundColor,
          title:getComputedStyle(node.previousElementSibling).color,overflow:document.documentElement.scrollWidth>innerWidth
        }));
        assert.equal(result.color,'rgb(255, 255, 255)');assert.equal(result.title,'rgb(255, 255, 255)');
        assert.equal(result.background,'rgba(0, 0, 0, 0)');assert.equal(result.panel,'rgb(37, 99, 235)');assert.equal(result.overflow,false);
        states++;
        if(state?.[0].startsWith('錄音中'))await page.screenshot({path:join(output,`${scheme}-${width}.png`)});
      }
    }
    assert.deepEqual(errors,[]);await page.close();
  }
  console.log(JSON.stringify({pass:true,states,widths:[390,320],schemes:['light','dark'],screenshots:output}));
}finally{await browser.close();}
