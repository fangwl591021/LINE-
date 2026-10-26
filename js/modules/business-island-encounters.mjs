// Scripted island greetings from the current public-card projection. No chat API calls.
const clean=(value,max=100)=>String(value??'').replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,max);
const stylesheet=new URL('../../css/business-island-encounters.css?v=2',import.meta.url).href;

export function createIslandEncounters({host,isCurrent,getMember,getSelf=()=>({name:'我'}),onChat,onCard,avatar=()=>'',bindAvatars=()=>{},categoryLabel=id=>id}={}){
  if(!host?.ownerDocument||typeof isCurrent!=='function'||typeof getMember!=='function')throw Error('島上招呼缺少必要設定');
  const doc=host.ownerDocument,view=doc.defaultView;
  if(!doc.querySelector('link[data-business-island-encounters]')){
    const link=doc.createElement('link');link.rel='stylesheet';link.href=stylesheet;link.dataset.businessIslandEncounters='';doc.head.append(link);
  }
  host.classList.add('bi-encounter-host');host.hidden=true;
  const history=new Map();
  let destroyed=false,timer=null,guardTimer=null,current=null,lastShown=-Infinity,mutedUntil=0;
  const usable=()=>!destroyed&&!doc.hidden&&isCurrent();
  const stop=()=>{if(timer!==null)view.clearTimeout(timer);timer=null;};
  const project=(row,self=false)=>({handle:self?'__me__':clean(row.handle,180),name:clean(row.name||row.displayName,80)||'會員',industry:clean(row.industry,70),company:clean(row.company,80),title:clean(row.title,70),avatarUrl:clean(row.avatarUrl||row.pictureUrl,2048),canChat:row.canChat!==false,self});
  function introduction(row){
    const name=clean(row.name,24);
    if(row.industry)return `你好，我是${name}，從事${row.industry}，很高興認識你！`;
    if(row.company||row.title)return `你好，我是${name}，${[row.company,row.title].filter(Boolean).join(' · ')}，歡迎交流合作！`;
    return `你好，我是${name}，很高興認識你，一起交流合作吧！`;
  }
  function clear(){stop();if(guardTimer!==null)view.clearTimeout(guardTimer);guardTimer=null;current=null;host.hidden=true;host.replaceChildren();}
  function arm(){stop();if(usable()&&current)timer=view.setTimeout(()=>{timer=null;if(!host.contains(doc.activeElement))clear();},8000);}
  function watch(){
    if(guardTimer!==null)view.clearTimeout(guardTimer);
    guardTimer=view.setTimeout(()=>{
      guardTimer=null;if(!current)return;
      if(!usable()||current.handles.some(handle=>!getMember(handle))){clear();return;}
      watch();
    },500);
  }
  function personBubble(row){
    const bubble=doc.createElement('section');bubble.className='bi-encounter-person';bubble.dataset.self=String(row.self);
    const portrait=doc.createElement('span');portrait.className='bi-encounter-avatar';portrait.innerHTML=avatar(row);
    const copy=doc.createElement('div');copy.className='bi-encounter-copy';
    const label=doc.createElement('small');label.className='bi-encounter-label';label.textContent=row.self?'我 · 島上招呼':'名片自介';
    const name=doc.createElement('strong');name.textContent=row.name;
    const line=doc.createElement('p');line.textContent=introduction(row);
    copy.append(label,name,line);bubble.append(portrait,copy);
    if(!row.self){
      const actions=doc.createElement('div');actions.className='bi-encounter-actions';
      for(const [action,text] of [['card','看公開名片'],['chat','開始交流']]){
        const button=doc.createElement('button');button.type='button';button.textContent=text;
        button.setAttribute('aria-label',`${text}：${row.name}`);
        if(action==='chat'&&!row.canChat){button.disabled=true;button.textContent='未開放新聯絡';}
        button.setAttribute(`data-bi-encounter-${action}`,row.handle);actions.append(button);
      }
      bubble.append(actions);
    }
    return bubble;
  }
  function show(event={}){
    if(!usable()||!['hero','residents'].includes(event.kind))return false;
    const rows=[],seen=new Set();
    for(const proposed of Array.isArray(event.people)?event.people:[]){
      const handle=typeof proposed?.handle==='string'?proposed.handle.trim():'';if(!handle||handle.length>180||seen.has(handle))continue;
      const row=getMember(handle);if(!row||row.handle!==handle)continue;
      rows.push(project(row));seen.add(handle);if(rows.length===2)break;
    }
    if(!rows.length||(event.kind==='residents'&&rows.length<2))return false;
    const now=Date.now(),key=event.kind+':'+rows.map(row=>row.handle).sort().join('|');
    const cooldown=event.kind==='hero'?20000:45000;
    if(now<mutedUntil||(!(event.kind==='hero'&&event.explicit===true)&&now-(history.get(key)??-Infinity)<cooldown))return false;
    if(current&&host.contains(doc.activeElement))return false;
    if(event.kind==='residents'&&(current||now-lastShown<12000))return false;
    clear();history.set(key,now);lastShown=now;
    while(history.size>128)history.delete(history.keys().next().value);
    current={key,handles:rows.map(row=>row.handle)};
    const controls=host.closest('.bi-layout')?.querySelector('.bi-explore');
    host.style.setProperty('--bi-encounter-top',`${Math.max(8,(controls?.offsetHeight||0)+8)}px`);
    const panel=doc.createElement('aside');panel.className='bi-encounter-card';panel.setAttribute('aria-label','島上相遇招呼');
    const header=doc.createElement('header');header.className='bi-encounter-heading';
    const heading=doc.createElement('strong');heading.textContent=`${clean(categoryLabel(event.category),40)||'島上'} · 遇見新夥伴`;
    const close=doc.createElement('button');close.type='button';close.dataset.biEncounterClose='';close.textContent='×';close.setAttribute('aria-label','關閉島上招呼');
    header.append(heading,close);panel.append(header);
    const conversation=doc.createElement('div');conversation.className='bi-encounter-conversation';conversation.setAttribute('role','status');conversation.setAttribute('aria-live','polite');
    const people=event.kind==='hero'?[project(getSelf()||{name:'我'},true),rows[0]]:rows;
    people.forEach(row=>conversation.append(personBubble(row)));panel.append(conversation);
    host.append(panel);host.hidden=false;bindAvatars(host);arm();watch();return true;
  }
  function dismiss(){
    const focused=host.contains(doc.activeElement);clear();mutedUntil=Date.now()+15000;
    if(focused)host.closest('.bi-layout')?.querySelector('[data-bi-action="roll"]')?.focus({preventScroll:true});
  }
  const click=event=>{
    const button=event.target.closest('button');if(!button||!host.contains(button))return;
    event.stopPropagation();if(!usable()){clear();return;}
    if(button.hasAttribute('data-bi-encounter-close')){dismiss();return;}
    const action=button.hasAttribute('data-bi-encounter-chat')?'chat':button.hasAttribute('data-bi-encounter-card')?'card':'';
    const handle=action&&button.getAttribute(`data-bi-encounter-${action}`);
    const member=handle&&getMember(handle);
    if(!handle||!current?.handles.includes(handle)||!member||(action==='chat'&&member.canChat===false)){clear();return;}
    clear();if(action==='chat')onChat?.(handle);else onCard?.(handle);
  };
  const keydown=event=>{if(event.key==='Escape'&&current&&usable()&&!event.defaultPrevented&&!doc.querySelector('dialog[open]')){event.preventDefault();event.stopPropagation();dismiss();}};
  const visibility=()=>{if(doc.hidden||!isCurrent())clear();};
  host.addEventListener('click',click);doc.addEventListener('keydown',keydown);
  host.addEventListener('pointerenter',stop);host.addEventListener('pointerleave',arm);
  host.addEventListener('focusin',stop);host.addEventListener('focusout',arm);
  doc.addEventListener('visibilitychange',visibility);
  return {show,clear,dismiss,destroy(){if(destroyed)return;clear();destroyed=true;history.clear();host.removeEventListener('click',click);doc.removeEventListener('keydown',keydown);host.removeEventListener('pointerenter',stop);host.removeEventListener('pointerleave',arm);host.removeEventListener('focusin',stop);host.removeEventListener('focusout',arm);doc.removeEventListener('visibilitychange',visibility);host.remove();}};
}
