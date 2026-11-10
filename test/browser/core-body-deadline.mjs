// Native Chrome body-abort evidence. Local synthetic reads only; product timeouts are unchanged.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync,writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
const require=createRequire(import.meta.url);
let chromium;try{({chromium}=require('playwright'));}catch{({chromium}=require('C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));}
const source=readFileSync(new URL('../../js/core.js',import.meta.url),'utf8');
const start=source.indexOf('    window.fetchAPI = async function('),end=source.indexOf('    // 強效配對機制',start);assert.ok(start>=0&&end>start);
const requests=[],blocked=[],sockets=new Set();let stalledClosed=false;
const server=createServer(async(req,res)=>{
  if(req.url==='/'){
    res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});
    return res.end(`<!doctype html><meta charset="utf-8"><title>本機 body timeout 驗證</title><script>
      window.Config={WORKER_URL:location.origin+'/api'};window.userRole='user';window.currentUserProfile={userId:'synthetic-owner'};window.currentNetworkId='synthetic';window.liff={isLoggedIn:()=>true,getAccessToken:()=> 'synthetic-token'};window.showToast=()=>{};
      const nativeTimer=window.setTimeout.bind(window);window.setTimeout=(fn,ms,...args)=>nativeTimer(fn,ms===10000?80:ms,...args);
      window.bodyErrors=[];window.abortEvents=0;const nativeFetch=window.fetch.bind(window);window.fetch=async(...args)=>{args[1]?.signal?.addEventListener('abort',()=>window.abortEvents++);const response=await nativeFetch(...args),nativeJson=response.json.bind(response);response.json=()=>nativeJson().catch(error=>{window.bodyErrors.push(error.name);throw error;});return response;};
      ${source.slice(start,end)}
    </script><p>隔離合成資料，沒有正式外連。</p>`);
  }
  if(req.url!=='/api'||req.method!=='POST'){res.writeHead(404);return res.end();}
  const chunks=[];for await(const chunk of req)chunks.push(chunk);
  const body=JSON.parse(Buffer.concat(chunks).toString());requests.push({action:body.action,mode:body.payload.fixtureMode});
  res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.flushHeaders();
  if(body.payload.fixtureMode==='stall'){
    res.on('close',()=>{stalledClosed=true;});res.write('{"success":');return;
  }
  res.end(JSON.stringify({success:true,data:{isRegistered:true,source:'local-synthetic'}}));
});
server.on('connection',socket=>{sockets.add(socket);socket.on('close',()=>sockets.delete(socket));});
let browser;
try{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({headless:true,channel:'chrome'});
  const context=await browser.newContext({serviceWorkers:'block'}),page=await context.newPage();
  await context.route('**/*',route=>{if(new URL(route.request().url()).origin===origin)return route.continue();blocked.push(route.request().url());return route.abort();});
  await page.goto(origin,{waitUntil:'domcontentloaded'});
  const result=await page.evaluate(async()=>{
    const at=performance.now(),first=await window.fetchAPI('checkUser',{fixtureMode:'stall'},true),elapsedMs=performance.now()-at;
    const second=await window.fetchAPI('checkUser',{fixtureMode:'normal'},true);
    await new Promise(resolve=>setTimeout(resolve,100));
    return {first,second,elapsedMs,bodyErrors,abortEvents};
  });
  assert.equal(result.first.success,false);assert.match(result.first.error,/系統連線逾時/);assert.deepEqual(result.bodyErrors,['AbortError']);assert.equal(result.abortEvents,1);
  assert.equal(result.second.isRegistered,true);assert.equal(result.second.source,'local-synthetic');assert.equal(stalledClosed,true);
  assert.deepEqual(requests,[{action:'checkUser',mode:'stall'},{action:'checkUser',mode:'normal'}]);assert.deepEqual(blocked,[]);
  const evidence={passed:true,browser:'native Chrome',fixtureDeadlineMs:80,elapsedMs:Math.round(result.elapsedMs),bodyError:result.bodyErrors[0],timeoutMessage:result.first.error,stalledRequests:1,retries:0,recovered:result.second.isRegistered,productionRequests:0,requests};
  const output=resolve(new URL('../..',import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1'),'../core-body-deadline.json');
  writeFileSync(output,JSON.stringify(evidence,null,2));console.log(JSON.stringify({...evidence,log:output}));
}finally{
  await browser?.close();for(const socket of sockets)socket.destroy();await new Promise(resolve=>server.close(resolve));
}
