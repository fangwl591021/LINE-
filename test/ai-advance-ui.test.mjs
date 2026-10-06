import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../js/modules/ai-advance.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const css=readFileSync(new URL('../css/ai-advance.css',import.meta.url),'utf8');
test('home entries are one equal-width row, original tutorial and mall order preserved',()=>{
 assert.equal((html.match(/id="home-tutorial-entry"/g)||[]).length,1);assert.equal((html.match(/id="home-ai-advance-entry"/g)||[]).length,1);
 assert.ok(html.indexOf('home-tutorial-entry')<html.indexOf('id="home-mall-banner"'));
 const entry=html.match(/<button id="home-ai-advance-entry"[\s\S]*?<\/button>/)[0];
 assert.match(entry,/onclick="window\.openAiAdvance\?\.\(\)"/);assert.match(entry,/<strong>AI推進<\/strong>/);assert.doesNotMatch(entry,/教學/);
 assert.match(css,/grid-template-columns:minmax\(0,1fr\) minmax\(0,1fr\)/);assert.match(css,/@media\(max-width:360px\)/);
 assert.doesNotMatch(html.match(/<nav id="bottom-nav"[\s\S]*?<\/nav>/)[0],/ai-advance|AI推進/);
});
test('normal guide does not fetch account data, and mixed deep links cannot take over routes',()=>{
 for(const query of ['', '?a=ACT_demo&aiAdvance=1','?shareCardId=demo&aiAdvance=1','?aiAdvance=1&aiAdvance=1','?aiAdvance=0','?aiAdvance=1&memberChat=demo']){
  const calls=[];const window={addEventListener(){}};
  vm.runInNewContext(source,{window,location:{search:query},URLSearchParams,setInterval(){calls.push('interval');},clearInterval(){},document:{},console});
  assert.deepEqual(calls,[]);assert.equal(typeof window.openAiAdvanceGuide,'function');
 }
 for(const query of ['?aiAdvance=1','?liff.state=%3FaiAdvance%3D1']){
  let calls=0;vm.runInNewContext(source,{window:{addEventListener(){}},location:{search:query},URLSearchParams,setInterval(){calls++;},clearInterval(){},document:{},console});assert.equal(calls,1);
 }
});
test('isolated client uses verified bearer, never stored keys; close, draft and explicit confirm gates',()=>{
 assert.doesNotMatch(source,/localStorage|sessionStorage|OPENAI_API_KEY|gpt-|扣點API/);
 assert.match(source,/credentials:'omit',cache:'no-store'/);assert.match(source,/owner!==uid\|\|token!==access/);
 assert.match(source,/data-close/);assert.match(source,/尚未送出內容/);assert.match(source,/確認建立下一步/);
 assert.match(source,/controllers\.forEach\(c=>c\.abort\(\)\)/);assert.match(source,/未操作.*正式|不自動扣點/);
 assert.doesNotMatch(source,/function guidePage|開始使用 AI 推進|const movie=/);
 assert.match(source,/openAiAdvanceGuide=\(\)=>window\.openTutorialCenter\?\.\('ai-advance'\)/);
 assert.match(source,/view==='dashboard'\)close\(\)/);assert.match(source,/pagehide/);
});
