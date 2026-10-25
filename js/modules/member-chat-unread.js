// Read-only home indicator. Never opens a thread, marks messages read or sends notifications.
(() => {
  'use strict';
  if (window.refreshMemberChatUnread) return;
  const label='開啟交流專區',pollMs=20000;
  let session=null,enabled=false,epoch=0,flight=null,poll=null,watch=null,suspended=false,attempted=false,denied=false,again=false;
  function state(){
    const button=document.getElementById('home-exchange-zone-button'),badge=document.getElementById('home-exchange-zone-unread-badge'),home=document.getElementById('page-home');
    let owner='',token='',base='';
    try{owner=String(window.currentUserProfile?.userId||'');token=window.liff?.isLoggedIn?.()?String(window.liff.getAccessToken?.()||''):'';base=String(window.Config?.WORKER_URL||window.WORKER_URL||'').replace(/\/+$/,'');const url=new URL(base);if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash)base='';}catch{base='';}
    return {owner,token,base,button,badge,allowed:!!button&&!button.classList.contains('hidden'),visible:!suspended&&!document.hidden&&window.currentPage==='home'&&!!home&&!home.classList.contains('hidden')};
  }
  const same=(a,b)=>!!a&&a.owner===b.owner&&a.token===b.token&&a.base===b.base&&a.button===b.button&&a.badge===b.badge;
  const eligible=s=>s.visible&&s.allowed&&s.owner&&s.token&&s.base&&s.badge;
  function clearBadge(s=session){
    if(s?.badge){s.badge.textContent='';s.badge.classList.add('hidden');s.badge.removeAttribute('title');}
    if(s?.button){s.button.setAttribute('aria-label',label);s.button.removeAttribute('data-unread-stale');s.button.removeAttribute('title');}
  }
  function stop(){epoch++;clearTimeout(poll);poll=null;const old=flight;flight=null;old?.controller.abort();again=false;}
  function valid(ticket,captured){return ticket===epoch&&same(captured,state())&&eligible(state());}
  function arm(){clearTimeout(poll);poll=null;if(enabled&&!denied&&eligible(state()))poll=setTimeout(()=>{poll=null;void sync(true);},pollMs);}
  async function requestCount(){
    if(flight||!eligible(state()))return;
    const captured=session,ticket=epoch,controller=new AbortController(),pending={controller};flight=pending;attempted=true;
    const timeout=setTimeout(()=>controller.abort(),8000);
    try{
      const response=await fetch(captured.base+'/v1/member-chat/unread',{method:'GET',credentials:'omit',cache:'no-store',headers:{Authorization:'Bearer '+captured.token},signal:controller.signal,redirect:'error'});
      if([401,403].includes(response.status)){const error=Error('登入或私訊權限已變更');error.status=response.status;throw error;}
      const result=await response.json();
      if(!valid(ticket,captured)){void sync();return;}
      if(!response.ok||result?.success!==true){const error=Error('未讀數暫時無法更新');error.status=response.status;throw error;}
      if(!Number.isSafeInteger(result.unread)||result.unread<0)throw Error('未讀數資料不完整');
      const count=result.unread;captured.badge.textContent=count>99?'99+':String(count);captured.badge.classList.toggle('hidden',count===0);
      captured.badge.title=`未讀私訊 ${count} 則`;captured.button.setAttribute('aria-label',count?`${label}，未讀私訊 ${count} 則`:label);captured.button.removeAttribute('data-unread-stale');captured.button.removeAttribute('title');
    }catch(error){
      if(!valid(ticket,captured)){void sync();return;}
      if([401,403].includes(error.status)){denied=true;again=false;clearBadge(captured);}
      else{captured.button.dataset.unreadStale='true';captured.button.title='未讀私訊數暫時無法更新，稍後會重新確認';}
    }finally{
      clearTimeout(timeout);
      if(flight===pending){flight=null;if(valid(ticket,captured)){if(again){again=false;void sync(true);}else arm();}}
    }
  }
  function sync(force=false,queue=false){
    const next=state();
    if(!same(session,next)){stop();clearBadge();session=next;clearBadge();enabled=false;attempted=false;denied=false;}
    else session=next;
    if(!eligible(next)){if(enabled||flight||poll)stop();enabled=false;if(!next.allowed||!next.owner||!next.token)clearBadge();return;}
    const entered=!enabled;enabled=true;
    if(entered||force)denied=false;
    if(flight){if(queue)again=true;return;}
    if(!denied&&(force||entered||!attempted))return requestCount();
  }
  window.refreshMemberChatUnread=()=>sync(true,true);
  window.syncMemberChatUnread=()=>sync();
  function startWatch(){if(!watch&&!suspended&&!document.hidden)watch=setInterval(()=>{void sync();},1000);}
  function pause(){suspended=true;clearInterval(watch);watch=null;stop();enabled=false;}
  window.addEventListener('pagehide',pause);
  window.addEventListener('pageshow',()=>{suspended=false;startWatch();void sync(true);});
  window.addEventListener('focus',()=>{if(!suspended)void sync(true);});
  document.addEventListener('visibilitychange',()=>{if(document.hidden){clearInterval(watch);watch=null;stop();enabled=false;}else{startWatch();void sync(true);}});
  const observer=new MutationObserver(()=>{void sync();});
  for(const node of [document.getElementById('page-home'),document.getElementById('home-exchange-zone-button')])if(node)observer.observe(node,{attributes:true,attributeFilter:['class']});
  startWatch();void sync();
})();
