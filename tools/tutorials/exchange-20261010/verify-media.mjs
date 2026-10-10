import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const dir=process.argv[2];if(!dir)throw Error('Pass artifact directory');
const expected=JSON.parse(readFileSync(dir+'/source/export-evidence.json'));
const base='https://pub-1e42b8765b1e4675bfb7be60f0e785ca.r2.dev/tutorials/2026-10-10/';const checks=[];
for(const e of expected){
  const url=base+e.file,local=readFileSync(dir+'/'+e.file);assert.equal(createHash('sha256').update(local).digest('hex'),e.sha256);
  const head=await fetch(url,{method:'HEAD',cache:'no-store'});assert.equal(head.status,200);assert.equal(head.headers.get('content-type'),'video/mp4');assert.equal(Number(head.headers.get('content-length')),e.bytes);
  const part=await fetch(url,{headers:{Range:'bytes=0-1023'}});assert.equal(part.status,206);assert.equal(part.headers.get('content-range'),`bytes 0-1023/${e.bytes}`);assert.equal((await part.arrayBuffer()).byteLength,1024);
  const whole=await fetch(url,{cache:'no-store'});assert.equal(whole.status,200);assert.equal(createHash('sha256').update(Buffer.from(await whole.arrayBuffer())).digest('hex'),e.sha256);checks.push({kind:e.kind,url,sha256:e.sha256,bytes:e.bytes,head:200,range:206,fullDownload:'PASS'});
}
writeFileSync(dir+'/media-verification.json',JSON.stringify({result:'PASS',verifiedAt:new Date().toISOString(),checks},null,2));console.log(JSON.stringify({result:'PASS',checks}));
