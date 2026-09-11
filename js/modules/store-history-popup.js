// Read-only, lazy-loaded history. Never opens or updates the full points wallet.
let activeDialog;
export async function readStorePointHistory(){
  const owner=window.currentUserProfile?.userId;
  if(!owner||!window.liff?.isLoggedIn?.()||typeof window.fetchAPI!=='function')throw Error('請先登入原系統以查看本人紀錄');
  const pointUserId=window.resolvePointUserIdForCurrentProfile?.(owner)||owner;
  const res=await window.fetchAPI('queryUserPoints',{userId:owner,pointUserId,pt_uid:pointUserId,point_type:'gift_money',page:1,per_page:100},true);
  if(owner!==window.currentUserProfile?.userId||!window.liff?.isLoggedIn?.()||(window.resolvePointUserIdForCurrentProfile?.(owner)||owner)!==pointUserId)throw Error('登入身分已變更，請重新開啟紀錄');
  const data=res?.data||res;
  if(!res||res.error||res.success===false||!Array.isArray(data?.list))throw Error('暫時無法取得點數紀錄，請稍後重試');
  if(!/^U[0-9a-fA-F]{20,64}$/.test(String(data.queriedLineUserId||''))||(data.requestedLineUserId&&data.requestedLineUserId!==pointUserId))throw Error('無法確認本人點數紀錄，請重新登入');
  return data.list.slice(0,30);
}
export function pointHistoryText(row){
  const raw=row.get_point??row.point??row.amount??row.points;
  const valid=(typeof raw==='number'||typeof raw==='string')&&String(raw).trim()!==''&&Number.isFinite(Number(raw));
  const amount=valid?Number(raw):null;
  const content=String(row.event_content||row.eventContent||row.content||'').trim();
  const remark=String(row.shop_remark||row.shopRemark||'');
  const source=String(row.child_shop_name||row.childShopName||row.shop_name||row.shopName||(remark.match(/(?:^|[;\s])source=([^;]+)/)||[])[1]||'').trim();
  return {
    title:String(row.event_name||row.eventName||row.title||row.name||'點數異動'),
    detail:content.includes('來源：')?content:source?`來源：${source}${content?'｜'+content:''}`:content,
    time:String(row.created_at||row.createdAt||row.time||row.date||''),
    amount:amount===null?'—':(amount>=0?'+':'')+amount.toLocaleString('zh-TW'),positive:amount!==null&&amount>=0
  };
}
export function openStoreHistoryPopup({isCurrent=()=>true,standalone=false}={}){
  if(activeDialog?.open){activeDialog.querySelector('[data-close]').focus();return;}
  const owner=window.currentUserProfile?.userId,opener=document.activeElement;
  const modal=document.createElement('dialog');modal.className='store-history-popup';modal.setAttribute('aria-labelledby','store-history-title');
  modal.innerHTML='<header><h2 id="store-history-title">消費折抵紀錄</h2><button type="button" data-close aria-label="關閉消費紀錄">×</button></header><div class="store-history-scroll"><div class="store-history-toolbar"><p>點數異動紀錄（含消費折抵、贈點等）</p><button type="button" data-refresh>重新整理</button></div><p data-status role="status" aria-live="polite"></p><div data-list role="list" aria-label="個人點數異動紀錄"></div></div>';
  document.body.append(modal);activeDialog=modal;
  const status=modal.querySelector('[data-status]'),list=modal.querySelector('[data-list]'),refresh=modal.querySelector('[data-refresh]');
  let closed=false,pending=false,revision=0,timer;
  const current=()=>!closed&&modal.open&&isCurrent()&&owner===window.currentUserProfile?.userId&&(!owner||!!window.liff?.isLoggedIn?.());
  function cleanup(){if(closed)return;closed=true;++revision;clearInterval(timer);list.replaceChildren();modal.remove();if(activeDialog===modal)activeDialog=null;if(isCurrent()&&opener?.isConnected)opener.focus();}
  function close(){modal.close();cleanup();}
  modal.querySelector('[data-close]').onclick=close;
  modal.addEventListener('close',cleanup,{once:true});
  modal.addEventListener('cancel',event=>{event.preventDefault();close();});
  modal.addEventListener('click',event=>{if(event.target!==modal)return;const r=modal.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)close();});
  async function load(){
    if(pending||!current())return;
    if(standalone||!owner||!window.liff?.isLoggedIn?.()){status.textContent='請先登入原系統以查看本人紀錄';refresh.hidden=true;return;}
    pending=true;refresh.disabled=true;const ticket=++revision;list.replaceChildren();status.textContent='載入紀錄中…';
    try{
      const rows=await readStorePointHistory();if(!current()||ticket!==revision)return;
      for(const row of rows){
        if(!row||typeof row!=='object')continue;
        const text=pointHistoryText(row),item=document.createElement('article'),copy=document.createElement('div');item.setAttribute('role','listitem');
        const title=document.createElement('h3');title.textContent=text.title;copy.append(title);
        if(text.detail){const detail=document.createElement('p');detail.textContent=text.detail;copy.append(detail);}
        const time=document.createElement('time');time.textContent=typeof window.formatDisplayTime==='function'?window.formatDisplayTime(text.time):text.time.replace('T',' ').slice(0,16);copy.append(time);
        const amount=document.createElement('strong');amount.className=text.positive?'positive':'negative';amount.textContent=text.amount;item.append(copy,amount);list.append(item);
      }
      status.textContent=list.children.length?`最近 ${list.children.length} 筆紀錄`:'目前沒有點數異動紀錄';
    }catch(error){if(current()&&ticket===revision)status.textContent=error.message||'暫時無法取得紀錄，請重試';}
    finally{pending=false;if(current()&&ticket===revision)refresh.disabled=false;}
  }
  refresh.onclick=()=>void load();modal.showModal();timer=setInterval(()=>{if(!current())close();},200);void load();
}
