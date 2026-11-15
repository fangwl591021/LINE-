import {readdir,readFile,mkdir,copyFile,stat} from 'node:fs/promises';
import path from 'node:path';
const root=process.cwd(),out=path.resolve(process.argv[2]||'_site');
if(out===root||!out.startsWith(root+path.sep))throw Error('Output must be a child of the project');
const extensions=new Set(['.html','.js','.mjs','.css','.json','.png','.jpg','.jpeg','.webp','.gif','.svg','.ico','.woff','.woff2','.ttf','.mp4','.webm','.mp3','.wav','.webmanifest','.pdf']);
const files=[];
async function walk(dir){for(const e of await readdir(path.join(root,dir),{withFileTypes:true})){
 if(e.isSymbolicLink())throw Error('Unexpected symlink');
 const p=path.posix.join(dir,e.name);
 if(e.isDirectory())await walk(p);else if(extensions.has(path.extname(p)))files.push(p);
}}
for(const dir of ['assets','css','js','data'])await walk(dir);
for(const e of await readdir(root,{withFileTypes:true}))if(e.isFile()&&(e.name.endsWith('.html')||['sw.js','manifest.webmanifest'].includes(e.name)))files.push(e.name);
const known=new Set(files),missing=[];
for(const file of files.filter(f=>/\.(html|css|m?js)$/.test(f))){
 const source=await readFile(path.join(root,file),'utf8');
 const refs=[...source.matchAll(/(?:\bsrc\s*=|\bhref\s*=|\bfrom\s+|\bimport\s*\()\s*["']([^"']+)["']/g)].map(m=>m[1]);
 for(const ref of refs){if(/^(?:[a-z][a-z0-9+.-]*:|\/\/|#|\{)/i.test(ref)||ref.includes('${'))continue;
  const clean=ref.split(/[?#]/)[0];if(!/\.(?:html|css|m?js|png|jpg|jpeg|webp|svg|json|webmanifest)$/i.test(clean))continue;
  const relative=path.posix.normalize(path.posix.join(path.posix.dirname(file),clean));
  if(!known.has(relative)&&!known.has(clean.replace(/^\//,'')))missing.push(file+' -> '+ref);
 }
}
if(missing.length)throw Error('Unpackaged static dependencies:\n'+missing.join('\n'));
await mkdir(out,{recursive:true});
if((await readdir(out)).length)throw Error('Output must be empty');
for(const file of files){const dest=path.join(out,file);await mkdir(path.dirname(dest),{recursive:true});await copyFile(path.join(root,file),dest);}
if(files.some(f=>/^(?:worker|test|migrations|docs|\.github|\.agents|tools)\//.test(f)||/^worker/.test(f)))throw Error('Internal file in public artifact');
console.log('Public static artifact verified: '+files.length+' files; no backend, tests, migrations or internal documentation.');
