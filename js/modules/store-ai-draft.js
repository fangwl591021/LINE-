const widgets=new WeakMap();
const limits={name:80,description:2000,category:20,address:200,phone:40,hours:200};
const labels={name:'店家名稱',description:'店家介紹',category:'店家業種',address:'地址',phone:'聯絡電話',hours:'營業時間'};
const keys=Object.keys(limits);
function safeLink(value){try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password?u.href:'';}catch{return '';}}
function validResult(data){
  return data?.success===true&&['matched','ambiguous','not_found'].includes(data.match)&&data.fields&&Object.keys(data.fields).length===6&&
    keys.every(k=>typeof data.fields[k]==='string'&&data.fields[k].length<=limits[k])&&['','食','宿','遊','購','行','服務','製造'].includes(data.fields.category)&&
    Array.isArray(data.warnings)&&data.warnings.length<=12&&data.warnings.every(w=>typeof w==='string'&&w.length<=300)&&
    (data.reviewFields===undefined||Array.isArray(data.reviewFields)&&data.reviewFields.length<=2&&new Set(data.reviewFields).size===data.reviewFields.length&&data.reviewFields.every(k=>['description','category'].includes(k)))&&
    Array.isArray(data.sources)&&data.sources.length<=6&&data.sources.every(s=>typeof s.title==='string'&&s.title.length<=160&&typeof s.url==='string'&&s.url.length<=500&&safeLink(s.url));
}
export function openStoreDraft({form,base,isCurrent,mode='generate'}){
  const panel=form.querySelector('[data-store-ai-draft]');if(!panel||!isCurrent())return;
  const previous=widgets.get(panel);if(previous){previous.focus();previous.selectMode(mode);return previous;}
  let queryMode=mode;
  const doc=panel.ownerDocument,field=k=>form.querySelector(`[name="${k}"]`);
  const taxIdInput=form.querySelector('[data-store-tax-id]');
  const el=(tag,text='',cls='')=>{const n=doc.createElement(tag);n.textContent=text;if(cls)n.className=cls;return n;};
  const button=text=>{const n=el('button',text);n.type='button';return n;};
  const box=el('section','','shop-ai-draft'),heading=el('div','','shop-ai-heading'),close=button('關閉草稿');
  const title=el('h3',mode==='registry'?'官方登記草稿':'AI 店面草稿');heading.append(title,close);
  const help=el('p','統編只確認官方名稱與登記地址；AI 另搜尋網路公開的實際產品／服務，不用登記營業項目代替介紹。先預覽、核對來源再帶入，不自動儲存或公開。','shop-meta');
  const hint=el('input'),website=el('input');hint.type='text';hint.maxLength=120;website.type='text';website.inputMode='url';website.maxLength=500;
  hint.placeholder='例如：新北板橋、分店名稱';website.placeholder='https://公司官網';
  const hintLabel=el('label','城市／分店補充（選填）'),urlLabel=el('label','公司官網（選填）');hintLabel.append(hint);urlLabel.append(website);
  const actions=el('div','','shop-row'),analyze=button('重新產生草稿'),enrich=button('AI 補充介紹'),cancel=button('取消分析');cancel.hidden=true;enrich.hidden=true;actions.append(analyze,enrich,cancel);
  const status=el('p','','shop-ai-status');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  const preview=el('div'),apply=button('確認帶入勾選欄位');apply.hidden=true;apply.className='primary';
  box.append(heading,help,hintLabel,urlLabel,actions,status,preview,apply);panel.replaceChildren(box);
  let ticket=0,controller=null,timer=null,timeout=null,loading=false,snapshot=null,result=null,rows=[],touched=new Set(),applying=false;
  const current=()=>isCurrent()&&form.isConnected&&panel.isConnected;
  const clearTimers=()=>{clearInterval(timer);clearTimeout(timeout);timer=timeout=null;};
  const stop=()=>{ticket++;controller?.abort();controller=null;clearTimers();loading=false;analyze.disabled=false;enrich.disabled=false;cancel.hidden=true;};
  const clearPreview=()=>{result=null;rows=[];preview.replaceChildren();apply.hidden=true;enrich.hidden=true;};
  const invalidate=()=>{stop();clearPreview();status.textContent='搜尋資料已變更，請重新產生草稿；原表單保留。';};
  const onEdit=event=>{
    if(applying)return;
    if(event.target===field('name')||event.target===taxIdInput){invalidate();return;}
    const key=keys.find(k=>field(k)===event.target);if(!key)return;touched.add(key);
    const row=rows.find(r=>r.key===key);if(row){row.check.checked=false;row.check.disabled=true;row.note.textContent='分析後已手動修改，保留你的內容';}
  };
  form.addEventListener('input',onEdit);form.addEventListener('change',onEdit);
  hint.addEventListener('input',invalidate);website.addEventListener('input',invalidate);
  const dispose=()=>{stop();form.removeEventListener('input',onEdit);form.removeEventListener('change',onEdit);panel.replaceChildren();widgets.delete(panel);};
  close.addEventListener('click',dispose);
  cancel.addEventListener('click',()=>{stop();clearPreview();status.textContent='已取消分析，原表單未變更。';});
  async function run(){
    if(loading||!current())return;
    title.textContent=queryMode==='registry'?'官方登記草稿':'AI 店面草稿';
    const name=field('name').value.trim(),taxId=taxIdInput?.value.trim()||'',token=window.liff?.isLoggedIn?.()?window.liff.getAccessToken():'';
    if(taxId&&!/^\d{8}$/.test(taxId)){status.textContent='統一編號請填 8 位數字。';taxIdInput.focus();return;}
    if(queryMode==='registry'&&!taxId){status.textContent='請先填 8 位統一編號，名稱可留白。';taxIdInput?.focus();return;}
    if(name.length<2&&!taxId){status.textContent='請填 8 位統一編號，或至少 2 字的公司／店家名稱。';field('name').focus();return;}
    if(!token){status.textContent='請從登入後的首頁開啟「我的商城管理」。';return;}
    if(queryMode!=='registry'&&website.value.trim()&&!safeLink(website.value.trim())){status.textContent='官網請填公開的 HTTPS 網址。';return;}
    stop();clearPreview();snapshot=Object.fromEntries(keys.map(k=>[k,field(k).value]));touched=new Set();
    const version=ticket,requestController=new AbortController();controller=requestController;loading=true;analyze.disabled=true;enrich.disabled=true;cancel.hidden=false;
    const progress=queryMode==='registry'?'正在以統編查詢經濟部登記資料…':taxId?'正在以統編確認公司，並搜尋實際產品／服務…':'正在搜尋實際產品／服務並核對來源…';
    let timedOut=false;const start=Date.now();status.textContent=progress;
    timer=setInterval(()=>{if(!current()){dispose();return;}status.textContent=`${progress}已等待 ${Math.floor((Date.now()-start)/1000)} 秒，可取消。`;},1000);
    timeout=setTimeout(()=>{timedOut=true;requestController.abort();},90000);
    try{
      const response=await fetch(`${base}/v1/store-shop/store-ai-draft`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({name,hint:hint.value.trim(),websiteUrl:website.value.trim(),...(taxId?{taxId}:{}),...(queryMode==='registry'?{mode:'registry'}:{})}),signal:requestController.signal});
      const data=await response.json();
      if(version!==ticket||!current()||token!==window.liff?.getAccessToken?.())return;
      if(!response.ok||!data.success)throw new Error(data.error||'AI 草稿暫時無法產生，請稍後再試。');
      if(!validResult(data))throw new Error('AI 草稿格式不完整，請重試；原表單未變更。');
      result=data;
      preview.append(el('p','勾選要帶入的欄位；已有內容預設保留，勾選即表示替換。','shop-meta'));
      for(const key of keys){
        const value=data.fields[key];if(!value)continue;
        const row=el('div','','shop-ai-field'),label=el('label'),check=el('input'),note=el('small');check.type='checkbox';check.setAttribute('data-ai-field',key);
        const changed=touched.has(key)||field(key).value!==snapshot[key],needsReview=data.reviewFields?.includes(key);check.checked=!snapshot[key].trim()&&!changed&&!needsReview;check.disabled=changed;
        label.append(check,el('strong',labels[key]+(snapshot[key].trim()?'（勾選替換已有內容）':'')));
        note.textContent=changed?'分析後已手動修改，保留你的內容':needsReview?'搜尋索引草稿：請點開來源核對，再自行勾選帶入':snapshot[key].trim()?'預設保留原值':'勾選後帶入空白欄位';
        row.append(label,el('p',value,'shop-ai-value'),note);preview.append(row);rows.push({key,check,note});
      }
      for(const warning of data.warnings)preview.append(el('p','需確認：'+warning,'shop-ai-warning'));
      if(data.sources.length){
        const sources=el('div','','shop-ai-sources');sources.append(el('strong','公開資料來源（請點開核對）'));
        for(const source of data.sources){const a=el('a',source.title+' — '+new URL(source.url).hostname);a.href=safeLink(source.url);a.target='_blank';a.rel='noopener noreferrer';sources.append(a);}preview.append(sources);
      }
      apply.hidden=!rows.length;apply.disabled=false;
      enrich.hidden=!(taxId&&rows.length);enrich.disabled=false;
      status.textContent=rows.length?(queryMode==='registry'?'官方登記資料已查到；可直接勾選帶入，或用 AI 補充介紹。尚未儲存。':data.fields.description?(data.reviewFields?.length?'搜尋介紹草稿已整理；請核對索引來源後勾選帶入。尚未儲存。':'草稿已完成；尚未帶入或儲存。'):'已取得部分資料；尚未找到可核對的實際營業內容。尚未帶入或儲存。'):taxId?'官方登記未查到此統編；請確認數字，或改用公司名稱搜尋。':'未取得可核對的資料；請填統編、官網，或手動填寫。';
    }catch(error){if(version===ticket&&current()){clearPreview();status.textContent=timedOut?'分析逾時，請重試或手動填寫；原表單未變更。':error.name==='AbortError'?'已取消分析，原表單未變更。':error.message;}}
    finally{if(version===ticket){clearTimers();controller=null;loading=false;analyze.disabled=false;enrich.disabled=false;cancel.hidden=true;}}
  }
  analyze.addEventListener('click',()=>void run());
  enrich.addEventListener('click',()=>{if(loading)return;queryMode='generate';void run();});
  apply.addEventListener('click',()=>{
    if(!result||!current()||loading)return;
    let count=0;applying=true;
    try{for(const row of rows){if(!row.check.checked||row.check.disabled||touched.has(row.key)||field(row.key).value!==snapshot[row.key])continue;field(row.key).value=result.fields[row.key];field(row.key).dispatchEvent(new Event('input',{bubbles:true}));field(row.key).dispatchEvent(new Event('change',{bubbles:true}));count++;}}
    finally{applying=false;}
    clearPreview();status.textContent=count?`已帶入 ${count} 個欄位，尚未儲存；請核對後按「儲存店面」。`:'未選擇可帶入欄位，原內容保留。';
  });
  const widget={focus:()=>box.scrollIntoView({block:'nearest',behavior:'smooth'}),selectMode(next){if(next!==queryMode&&!loading){queryMode=next;void run();}},dispose};widgets.set(panel,widget);void run();return widget;
}
