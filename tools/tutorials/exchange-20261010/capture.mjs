// Exact published UI with synthetic accounts and intercepted APIs. No production writes.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {mkdirSync,writeFileSync} from 'node:fs';
const {chromium}=createRequire(import.meta.url)(process.env.TUTORIAL_PLAYWRIGHT||'playwright');
const revision='b703600450d68213bb07621ae0efafb8a62f45ab';
const live='https://fangwl591021.github.io/LINE-/',raw='https://raw.githubusercontent.com/fangwl591021/LINE-/'+revision+'/';
const assets=new Map(),hashes={};
async function source(file){
  if(!assets.has(file))assets.set(file,(async()=>{
    const [a,b]=await Promise.all([fetch(live+file+'?exchange-tutorial='+revision),fetch(raw+file)]);
    assert.equal(a.status,200,file);assert.equal(b.status,200,file+' Git');
    const bytes=Buffer.from(await a.arrayBuffer());assert.ok(bytes.equals(Buffer.from(await b.arrayBuffer())),'Source drift '+file);
    hashes[file]=createHash('sha256').update(bytes).digest('hex');return bytes;
  })());return assets.get(file);
}
let html=(await source('index.html')).toString().replace(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi,(tag,attrs,body)=>attrs.includes('cdn.tailwindcss.com')||body.includes('tailwind.config =')?tag:'');
const server=createServer(async(req,res)=>{
  try{assert.equal(req.method,'GET');const file=decodeURIComponent(new URL(req.url,'http://localhost').pathname).slice(1);assert.ok(!file.includes('..'));
    res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.png')?'image/png':file.endsWith('.svg')?'image/svg+xml':'text/html');res.end(file?await source(file):html);
  }catch(e){res.statusCode=404;res.end(e.message);}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://localhost:'+server.address().port;
const browser=await chromium.launch({headless:true,args:['--no-sandbox'],...(process.env.TUTORIAL_CHROME?{executablePath:process.env.TUTORIAL_CHROME}:{channel:'chrome'})});
async function capture(kind){
  const dir=kind;mkdirSync(dir,{recursive:true});const errors=[],blocked=[],requests=[],timeline=[];
  const messages=[{seq:1,mine:false,body:'您好！我是林采晴，提供品牌設計與社群圖文服務，歡迎交流。',createdAt:'2026-10-10 02:00:00',read:false}],room='00000000-0000-4000-8000-000000000001';
  const ctx=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,locale:'zh-TW',timezoneId:'Asia/Taipei',recordVideo:{dir,size:{width:390,height:844}}});const page=await ctx.newPage();const started=Date.now();page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',async route=>{
    const req=route.request(),u=new URL(req.url());
    if(u.origin===base&&u.pathname.startsWith('/v1/member-chat/')){
      const endpoint=u.pathname.slice('/v1/member-chat/'.length);requests.push({endpoint,method:req.method()});let payload;
      if(endpoint==='me')payload={accepting:true,notifications:false};
      else if(endpoint==='members')payload={items:[{handle:'demo-peer',name:'林采晴（教學）',company:'晴禾品牌設計（虛構）',title:'品牌設計師',match:{score:82,source:'ai'}}],next:'',industries:['科技資訊','專業服務']};
      else if(endpoint==='threads'&&req.method()==='POST')payload={id:room};
      else if(endpoint==='threads')payload={items:[{id:room,name:'林采晴（教學）',preview:messages.at(-1).body,createdAt:'2026-10-10 02:00:00',unread:0}],next:''};
      else if(endpoint===`threads/${room}/messages`&&req.method()==='POST'){
        const data=req.postDataJSON();const item={seq:messages.length+1,mine:true,body:data.body,createdAt:'2026-10-10 02:01:00',read:false};messages.push(item);payload={item};
      }else if(endpoint===`threads/${room}/messages`)payload={items:messages,more:false,peer:{name:'林采晴（教學）'},blocked:false,blockedByMe:false,lastRead:0};
      else if(endpoint===`threads/${room}/read`)payload={};
      else {errors.push('Unexpected chat '+endpoint);return route.abort();}
      return route.fulfill({json:{success:true,...payload}});
    }
    if(u.origin===base&&req.method()==='GET')return route.continue();
    if(['cdn.tailwindcss.com','fonts.googleapis.com','fonts.gstatic.com'].includes(u.hostname)&&['script','stylesheet','font'].includes(req.resourceType()))return route.continue();
    blocked.push({host:u.hostname,method:req.method()});return route.abort();
  });
  await page.addInitScript(base=>{
    window.currentUserProfile={userId:'U'+'a'.repeat(32),displayName:'陳品安（教學）'};window.Config={WORKER_URL:base};window.liff={isLoggedIn:()=>true,getAccessToken:()=> 'synthetic-not-a-token'};
    window.__api=[];window.__postId=0;window.__access={mode:'open',allowed:true,canPublish:true,publishCost:10,contactTags:['合作邀約','商品服務','活動邀請','人才交流','其他']};
    window.__posts=[{postHandle:'demo-peer-post',title:'品牌設計夥伴・歡迎異業合作',body:'【教學虛構資料】晴禾品牌設計提供品牌視覺與社群圖文。我們希望與行銷顧問、在地店家交流，合作細節請先私訊討論。',excerpt:'提供品牌視覺與社群圖文，尋找合作夥伴。',author:{name:'林采晴（教學）'},publishedAt:'2026-10-10 02:00:00',contactTags:['合作邀約','商品服務'],canEdit:false,isHidden:false,cardAvailable:true,card:{name:'林采晴（教學）',companyName:'晴禾品牌設計（虛構）',title:'品牌設計師',description:'本資料僅供操作示範，不是實際商家。',buttons:[]},likeCount:2,likedByMe:false}];
    window.showToast=text=>{let el=document.getElementById('tutorial-toast');if(!el){el=document.createElement('div');el.id='tutorial-toast';el.style.cssText='position:fixed;bottom:24px;left:18px;right:18px;z-index:2147483646;background:#103f37;color:white;padding:14px;border-radius:12px;font-size:14px';document.body.append(el);}el.textContent=text;setTimeout(()=>el.remove(),2200);};
    window.appConfirm=async text=>window.confirm(text);
    window.fetchAPI=async(action,payload={})=>{
      __api.push({action,payload});const access=__access;
      if(action==='getExchangeZoneAccess')return {success:true,access};
      if(action==='listExchangeZonePosts')return {success:true,access,posts:__posts.filter(p=>payload.ownOnly?p.canEdit:!p.isHidden).map(p=>({...p}))};
      const post=__posts.find(p=>p.postHandle===payload.postHandle);
      if(action==='getExchangeZonePost')return {success:true,access,post:{...post}};
      if(action==='publishExchangeZonePost'){
        const p={...payload,postHandle:'demo-own-'+(++__postId),author:{name:'陳品安（教學）'},excerpt:payload.body.slice(0,70),publishedAt:'2026-10-10 02:00:00',canEdit:true,isHidden:false,cardAvailable:false,likeCount:0};__posts.unshift(p);
        return {success:true,postHandle:p.postHandle,chargedPoints:10,aiReview:{passed:true,suggestions:['請補上可提供的資源、合作範圍與聯絡下一步。']}};
      }
      if(action==='updateExchangeZonePost'){
        if(payload.toggleLike){post.likedByMe=!post.likedByMe;post.likeCount+=post.likedByMe?1:-1;return {success:true,likedByMe:post.likedByMe,likeCount:post.likeCount};}
        if(typeof payload.hidden==='boolean'){post.isHidden=payload.hidden;return {success:true,isHidden:post.isHidden};}
        Object.assign(post,payload);return {success:true,updated:true,chargedPoints:0,aiReview:{passed:true,suggestions:[]}};
      }
      throw Error('Unexpected exchange API '+action);
    };
  },base);
  page.on('dialog',d=>d.accept());
  async function click(el){await el.scrollIntoViewIfNeeded();await el.evaluate(n=>n.setAttribute('data-tutorial-target',''));const b=await el.boundingBox();await page.mouse.move(b.x+b.width/2,b.y+b.height/2,{steps:10});await page.waitForTimeout(400);await el.click();await page.evaluate(()=>document.querySelectorAll('[data-tutorial-target]').forEach(n=>n.removeAttribute('data-tutorial-target')));}
  async function scene(id,title,tip,text,action){const from=(Date.now()-started)/1000;if(action)await action();await page.waitForTimeout(500);const to=(Date.now()-started)/1000,shot=dir+'/'+id+'.png';await page.screenshot({path:shot});timeline.push({id,title,tip,text,shot,from:action?from:undefined,to});await page.waitForTimeout(600);}
  const tab=id=>click(page.locator('#exchange-tab-'+id));
  async function closeDrawer(){await click(page.locator('#exchange-zone-drawer-close'));await page.locator('#exchange-zone-drawer').waitFor({state:'hidden'});}
  async function compose(title,body,tag='合作邀約'){
    await tab('mine');await click(page.locator('#exchange-zone-compose-button'));await page.locator('[name=title]').fill(title);await page.locator('[name=body]').fill(body);await page.locator(`[name=contactTags][value="${tag}"]`).check({force:true});await page.locator('[name=attachMyCard]').uncheck();await page.locator('[name=body]').scrollIntoViewIfNeeded();
  }
  async function publish(){await click(page.locator('#exchange-zone-publish-button'));await page.locator('#exchange-zone-success-close').waitFor();}
  async function memberSearch(){await tab('members');await page.locator('.mc-contact').waitFor();await page.locator('#mc-query').fill('品牌設計');await click(page.locator('.mc-search button[type=submit]'));await page.locator('.mc-contact').waitFor();}
  async function openChat(){await click(page.locator('.mc-contact').first());await page.locator('#mc-body').waitFor();}
  async function send(text){await page.locator('#mc-body').fill(text);await click(page.locator('.mc-compose button'));await page.getByText(text,{exact:true}).waitFor();}
  try{
    await page.goto(base,{waitUntil:'networkidle'});
    await page.evaluate(base=>{
      document.getElementById('loading-screen')?.remove();document.getElementById('app').style.display='block';document.getElementById('page-home').classList.remove('hidden');document.getElementById('top-nav').classList.add('hidden');document.getElementById('bottom-nav').classList.add('hidden');document.body.classList.add('home-page','shared-front-banner-page');document.getElementById('main').style.paddingTop='12px';
      document.querySelectorAll('[id="home-profile-name"]').forEach(el=>el.textContent='陳品安（教學）');document.querySelectorAll('[id="home-profile-avatar"]').forEach(el=>el.src=base+'/assets/points-logo-transparent-20260916.png');document.querySelectorAll('[id="home-profile-points"]').forEach(el=>el.textContent='500');
      const cursor=document.createElement('div');cursor.style.cssText='position:fixed;left:-50px;top:-50px;width:22px;height:22px;border:3px solid #ff8b23;border-radius:50%;background:#ff8b2333;z-index:2147483647;pointer-events:none;transform:translate(-50%,-50%)';document.body.append(cursor);document.addEventListener('mousemove',e=>{cursor.style.left=e.clientX+'px';cursor.style.top=e.clientY+'px';});
    },base);
    await page.addScriptTag({url:base+'/js/modules/exchange-zone.js'});await page.waitForFunction(()=>typeof openExchangeZone==='function');await page.evaluate(()=>refreshExchangeZoneAccess());await page.addStyleTag({content:'[data-tutorial-target]{outline:3px solid #ff8b23!important;outline-offset:3px!important}'});
    if(kind==='exchange-use'){
      await scene('intro','交流專區｜使用教學','先找人，再交流；不是 LINE 原生聊天','這支影片教您使用交流專區：看公開動態、找會員、聊合作，再發布自己的介紹。畫面使用正式介面和虛構會員，訊息、審核與扣點回報都是隔離示範，不會真的發文或傳訊。');
      await scene('entry','01｜首頁點「交流專區」','四個頁籤，預設開公開動態','登入後，點首頁交流專區。上方依序是我的聊天、找會員、公開動態、我的貼文。預設會開公開動態；這是平台會員交流，不是 LINE 群組。',async()=>{await click(page.locator('#home-exchange-zone-button'));await page.locator('[data-exchange-post-handle]').waitFor();});
      await scene('feed','02｜查看動態與公開名片','按讚表達興趣，不會自動傳訊','點一則動態看完整內容，可以按讚，也可以展開對方附上的公開名片。按讚不會自動私訊。如果選有興趣寄站內信，那是收件匣聯絡流程，與找會員的一對一聊天不同。',async()=>{await click(page.locator('[data-exchange-post-handle]').first());await page.locator('#exchange-zone-card-toggle').waitFor();await click(page.locator('[data-exchange-like-detail="1"]'));await click(page.locator('#exchange-zone-card-toggle'));});
      await scene('search','03｜找會員：輸入搜尋條件','搜尋姓名、英文名、公司或職稱','關閉內容，點找會員。輸入姓名、英文名、公司或職稱，按搜尋。本例找品牌設計夥伴。會員目錄不代表私人名片已公開，也不是公開配對池；只能看到平台允許的摘要。',async()=>{await closeDrawer();await memberSearch();});
      await scene('industry','04｜用業種縮小名單','契合度是參考，不是合作保證','也可以使用業種搜尋縮小範圍，或切換最新名單、配對排名。契合度只是參考，不保證能力、身分或合作結果。沒有找到時，換公司名、職稱或較短的關鍵字再試。',async()=>{await page.locator('#mc-industry').selectOption('專業服務');await click(page.locator('[data-sort="match"]'));await page.locator('.mc-contact').waitFor();});
      await scene('chat','05｜點會員，傳第一則訊息','先自我介紹，再說明需求與下一步','點會員進入聊天，先自我介紹，再寫合作需求和一個容易回覆的下一步。核對對象和內容，按傳送。顯示已送出不等於對方已讀或同意合作；這裡是免費站內私訊，不是 LINE 原生聊天。',async()=>{await openChat();await send('您好，我是品安（教學）。想了解品牌設計合作，方便先交流服務範圍嗎？');});
      await scene('settings','06｜我的聊天與通知設定','通知和加 LINE 好友資料分開','從對話返回我的聊天，日後可以在這裡繼續回覆。設定預設收合，展開可查看接受新聯絡和 LINE 通知。要接收通知，需加入官方帳號並允許手機通知；填加好友資料不會自動開通知。本片不更動設定。',async()=>{await click(page.locator('.mc-embedded [data-action=back]'));await page.locator('.mc-preferences').waitFor();await click(page.locator('.mc-preferences summary span'));});
      await scene('compose','07｜我的貼文 → 新增自我宣傳','標題、內容、最多三個聯絡標籤','想讓別人找到您，點我的貼文，再新增自我宣傳。標題寫清楚提供什麼，內容說明對象、資源與下一步；聯絡標籤最多三個。附名片只使用自己的公開名片，沒有可用公開名片就先不要勾選。',async()=>{await compose('在地店家行銷合作・教學範例','【虛構教學】我提供社群企劃與文案，想找品牌設計夥伴，共同服務新北在地店家。請先私訊作品類型與可合作時段。');});
      await scene('coupon','08｜需要優惠時才附優惠券','填清期限與限制，不是活動核銷碼','若要推廣商品或服務，可以附加優惠券，填名稱、優惠內容、期限與使用限制。一篇貼文最多一張，每位會員只能核銷一次；有核銷紀錄後不能移除。不是活動報名碼，也不是點數 QR。本段只填表，不發券、不核銷。',async()=>{await page.locator('[name=couponEnabled]').check();await page.locator('[name=couponTitle]').fill('教學體驗諮詢券');await page.locator('[name=couponDescription]').fill('教學示範：一次十五分鐘服務諮詢，不涉及收款。');await page.locator('[name=couponExpiresAt]').fill('2026-12-31');await page.locator('[name=couponTitle]').scrollIntoViewIfNeeded();});
      await scene('publish','09｜核對後，AI 審核並發布','成功刊登扣 10 點；審核回應為模擬','核對無誤，再按 AI 審核並發布。現行規則是成功刊登扣十點，刪除不退點；私訊免費。審核不通過就依提示修改，不要重複點。看到刊登完成再返回確認。本例審核和扣點都是模擬，沒有正式異動。',async()=>{await page.locator('[name=couponEnabled]').uncheck();await publish();});
      await scene('manage','10｜編輯、隱藏與重新顯示','編輯與隱藏不另扣點；本人管理','回到我的貼文，點自己的內容，可以編輯，或隱藏。編輯不另扣點。隱藏後公開動態看不到，仍可在我的貼文重新顯示；隱藏中須先重新顯示才能編輯。需求結束就更新或隱藏，別讓舊資訊一直公開。',async()=>{await click(page.locator('#exchange-zone-success-close'));await page.locator('#exchange-zone-drawer').waitFor({state:'hidden'});await click(page.locator('[data-exchange-post-handle]').first());await click(page.locator('#exchange-zone-visibility-button'));await page.locator('#exchange-zone-drawer').waitFor({state:'hidden'});await click(page.locator('[data-exchange-post-handle]').first());assert.equal(await page.locator('#exchange-zone-edit-button').isDisabled(),true);await page.locator('#exchange-zone-visibility-button').scrollIntoViewIfNeeded();});
      await scene('summary','交流專區｜重點複習','看動態 → 找會員 → 私訊 → 發文管理','使用時記住四件事：看公開動態，找適合的人，先私訊交流，再發布自己的清楚介紹。不要公開敏感個資，不要大量發送相同廣告。對方沒有回覆不代表同意；談價格、付款或合作條件前，請自行核實。',async()=>{await click(page.locator('#exchange-zone-visibility-button'));await page.locator('#exchange-zone-drawer').waitFor({state:'hidden'});await tab('public');});
    }else{
      await scene('intro','交流專區｜應用教學','三種情境：合作、需求、店家推廣','會按按鈕只是第一步，這支影片教您把交流專區用在三種情境：找異業合作、徵求明確需求、推廣店家服務。本片全部使用虛構案例，不代表實際商家、需求或合作承諾。');
      await click(page.locator('#home-exchange-zone-button'));await page.locator('[data-exchange-post-handle]').waitFor();
      await scene('cooperation','01｜合作邀約：說清楚能互補什麼','我能提供／想找誰／下一步','合作貼文不要只寫歡迎合作。用三段寫清楚：我能提供什麼，我想找哪種夥伴，下一步怎麼談。本例提供社群企劃，找品牌設計師，先交流作品與合作時段，不先承諾成交或利益。',async()=>{await compose('尋找品牌設計夥伴・社群企劃合作','【虛構教學】我能提供：社群企劃、文案與在地店家需求整理。\n想找：熟悉品牌視覺的設計師，共同服務新北店家。\n下一步：請先私訊作品類型與可合作時段，再約十五分鐘交流。');});
      await scene('review','02｜核對公開內容，再發布','審核不代表合作已成立','先確認內容能公開，不包含客戶個資或商業機密，選合作邀約標籤，再送 AI 審核。成功刊登按現行規則扣十點；審核只是內容把關，不是身分或合作保證。本片發布回報是模擬。',async()=>{await publish();});
      await scene('find','03｜主動找合適會員','看摘要與需求，不只看分數','不要只等待回覆。回到找會員，搜尋相關公司或職稱，再用業種縮小名單。先看对方摘要是否符合您的需求，契合度只是參考，不要只按分數高低決定。',async()=>{await closeDrawer();await memberSearch();});
      await scene('message','04｜私訊要能讓對方容易回覆','具體觀察＋互補資源＋小邀請','第一則私訊先說您注意到對方的哪個服務，再說彼此能怎樣互補，最後提出小而明確的邀請。例如：方便先交流服務範圍嗎。不要一開始就丟長廣告，也不要要求敏感資料或匯款。',async()=>{await openChat();await send('您好采晴，我看到您的品牌設計服務。我提供社群企劃，想一起服務在地店家。方便先交流服務範圍嗎？（教學示範）');});
      await scene('demand','05｜徵求需求：加上範圍與期限','需求／地區／時間／回覆方式','需要供應商或人才時，把需求、地區、預計時程和回覆方式寫清楚。預算若適合公開，也可以填範圍；實際报价私下核對。本例徵求包裝設計，不公開客戶電話，也不承諾直接下單。',async()=>{await compose('徵求包裝設計合作・新北店家','【虛構教學】需求：一款食品禮盒的包裝視覺設計。\n地區：新北；預計十一月開始，先確認服務範圍與時程。\n請私訊相關作品類型、可接案時段與報價方式，不需公開私人電話。','商品服務');});
      await scene('promotion','06｜店家推廣：把服務說具體','服務對象／內容／限制／詢問方式','店家推廣要說清楚誰適合、提供什麼服務，以及怎麼詢問。本例是社群經營諮詢，說明服務範圍與預約方式，不寫保證業績。交流貼文不是商城商品上架，也不是活動報名流程。',async()=>{await closeDrawer();await compose('店家社群經營諮詢・教學範例','【虛構教學】適合：想整理社群內容的新北小店。\n提供：十五分鐘需求交流，說明企劃與文案服務範圍。\n請先私訊預約；不保證營收，不在貼文內收款。','商品服務');});
      await scene('offer','07｜優惠券：條件要寫完整','明確期限與限制；未發券、未核銷','有明確優惠才附優惠券。寫名稱、內容、期限與使用限制，不要讓人以為沒有條件。每位會員限核銷一次，需依畫面提示現場確認。本例只示範填表，不發券、不核銷，也不扣任何點數。',async()=>{await page.locator('[name=couponEnabled]').check();await page.locator('[name=couponTitle]').fill('店家社群需求交流券・教學');await page.locator('[name=couponDescription]').fill('十五分鐘需求交流一次；需先私訊預約。');await page.locator('[name=couponExpiresAt]').fill('2026-12-31');await page.locator('[name=couponTerms]').fill('教學示範；限本人一次，先預約，不兌換現金，不保證營收。');await page.locator('[name=couponTitle]').scrollIntoViewIfNeeded();});
      await scene('followup','08｜回到我的聊天，接續談下一步','確認需求，再另行約時間或提出報價','對方願意交流後，回到我的聊天接續討論：確認需求、約時間，再提出適合的方案。已送出不是已讀；已讀也不是接受報價。合作結束時，記得更新或隱藏公開貼文。',async()=>{await closeDrawer();await tab('threads');await page.locator('.mc-contact').waitFor();await click(page.locator('.mc-contact').first());});
      await scene('summary','應用重點｜讓人知道如何回覆','提供價值 → 明確需求 → 小下一步','交流專區最實用的寫法，是提供價值、明確需求、提出一個小下一步。公開動態用來被看見，找會員用來主動找人，私訊用來釐清細節。保持禮貌，不大量群發；交易與身分都要自行核實。',async()=>{await tab('public');});
    }
    assert.deepEqual(errors,[]);assert.deepEqual(blocked,[]);const fixtures=await page.evaluate(()=>({api:__api,posts:__posts}));
    assert.equal(fixtures.api.filter(x=>x.action==='publishExchangeZonePost').length,1);assert.equal(messages.filter(m=>m.mine).length,1);
    if(kind==='exchange-use'){assert.deepEqual(fixtures.api.filter(x=>typeof x.payload.hidden==='boolean').map(x=>x.payload.hidden),[true,false]);assert.equal(fixtures.posts[0].isHidden,false);}
    const video=page.video();await ctx.close();writeFileSync(dir+'/capture-evidence.json',JSON.stringify({sourceCommit:revision,hashes,errors,blocked,requests,productionWrites:0,realMessagesSent:0,fixtures,video:await video.path(),timeline},null,2));console.log(JSON.stringify({kind,result:'PASS',scenes:timeline.length,productionWrites:0,realMessagesSent:0}));
  }catch(e){await page.screenshot({path:dir+'/failure.png'});throw e;}finally{await ctx.close();}
}
try{for(const kind of ['exchange-use','exchange-applications'])await capture(kind);}finally{await browser.close();await new Promise(r=>server.close(r));}
