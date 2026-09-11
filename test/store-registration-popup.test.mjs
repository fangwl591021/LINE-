import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../js/modules/store-registration-popup.js',import.meta.url),'utf8');
const {openStoreRegistrationPopup:open}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const owner='U'+'a'.repeat(32);
test('registration popup rejects standalone and anonymous access before reading DOM',()=>{
 globalThis.window={currentUserProfile:{userId:owner},liff:{isLoggedIn:()=>true}};
 globalThis.document={getElementById(){throw Error('must not read DOM');}};
 assert.throws(()=>open({standalone:true}),/請先登入/);
 window.liff.isLoggedIn=()=>false;assert.throws(()=>open(),/請先登入/);
 window.liff.isLoggedIn=()=>true;window.currentUserProfile=null;assert.throws(()=>open(),/請先登入/);
});
test('stale navigation does not create a popup',()=>{
 globalThis.window={currentUserProfile:{userId:owner},liff:{isLoggedIn:()=>true}};
 globalThis.document={getElementById(){throw Error('must not read DOM');}};
 assert.equal(open({isCurrent:()=>false}),undefined);
});
test('missing form and stale profile identity fail without moving fields',()=>{
 globalThis.window={currentUserProfile:{userId:owner},liff:{isLoggedIn:()=>true},saveProfileRegistration(){}};
 globalThis.document={getElementById:()=>null};assert.throws(()=>open(),/尚未就緒/);
 globalThis.document={getElementById:()=>({})};
 window.currentUser={userId:'U'+'b'.repeat(32)};
 assert.throws(()=>open(),/會員身分正在更新/);
});
test('popup reuses registration, consent and toast nodes with cleanup instead of duplicate storage',()=>{
 assert.match(source,/move\(panel,/);assert.match(source,/move\(privacy,modal\)/);assert.match(source,/toast-container/);
 assert.match(source,/marker\.replaceWith\(node\)/);assert.match(source,/panel\.open=wasOpen/);
 assert.match(source,/clearInterval\(timer\)/);assert.match(source,/owner!==window\.currentUserProfile/);
 assert.doesNotMatch(source,/cloneNode|fetchAPI\(|fetch\(|localStorage|registerUser|updateUserProfile/);
});
test('mall registration is explicit and lazy and versions match both entrypoints',()=>{
 const mall=readFileSync(new URL('../js/modules/store-shop.js',import.meta.url),'utf8');
 assert.match(mall,/data-do="registration">♙ 會員註冊／資料維護/);
 assert.match(mall,/case 'registration':[\s\S]*?import\('\.\/store-registration-popup\.js\?v=3'\)/);
 const loader=readFileSync(new URL('../js/modules/store-shop-entry.js',import.meta.url),'utf8');
 const standalone=readFileSync(new URL('../store-shop.html',import.meta.url),'utf8');
 for(const file of [loader,standalone]){assert.match(file,/store-shop\.js\?v=24/);assert.match(file,/store-shop\.css\?v=20/);}
});
