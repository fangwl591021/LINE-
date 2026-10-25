// Protected: completed percentages (including zero) are permanent; only unscored
// cards may be submitted. Retry clocks only run while this list is visible.
(() => {
  const WAITING=new Set(['failed','processing']),MAX_RETRIES=3,READ_BACKOFF=60000;
  let running=null,timer=null,generation=0,session='',retries=0,blockedUntil=0,paused=false,reading=null,legacyQuotaRead='';
  const legacyDeadlines=new Map();
  const user=()=>String(window.currentUserProfile?.userId||'');
  const token=()=>{try{return window.liff?.isLoggedIn?.()?String(window.liff.getAccessToken()||''):'';}catch{return '';}};
  const identity=()=>user()+'|'+token();
  window.readCollectedMatchCards=function(){
    const key=identity();if(reading?.key===key)return reading.promise;
    const recovering=hasLegacyQuota();if(recovering)legacyQuotaRead=key;
    const request={key};request.promise=Promise.resolve().then(()=>{if(identity()!==key)throw Error('collection identity changed');return window.fetchAPI('getCardHarvestContacts',{},true);}).catch(error=>{if(identity()===key){legacyQuotaRead='';if(recovering)blockedUntil=Math.max(blockedUntil,Date.now()+READ_BACKOFF);}throw error;}).finally(()=>{if(reading===request)reading=null;});reading=request;return request.promise;
  };
  const complete=m=>m?.status==='completed'&&typeof m.score==='number'&&Number.isFinite(m.score)&&m.score>=0&&m.score<=100&&['ai','rules'].includes(m.source);
  const legacyQuota=m=>!complete(m)&&(m?.status==='limited'||m?.failureCode==='quota');
  const hasLegacyQuota=()=>Array.isArray(window.harvestCards)&&window.harvestCards.some(c=>legacyQuota(c.aiMatch));
  const visible=()=>{const list=document.getElementById('card-list');return !document.hidden&&!!list&&(!list.getClientRects||list.getClientRects().length>0);};
  // Legacy quota states need one server read, never a locally invented eligibility.
  const eligible=()=>Array.isArray(window.harvestCards)&&!hasLegacyQuota()?window.harvestCards.filter(c=>!complete(c.aiMatch)&&c.aiMatch?.autoEligible===true&&c.aiMatch.score===null):[];
  function clearTimer(){if(timer!==null)clearTimeout(timer);timer=null;}
  function stop(){clearTimer();generation++;running=null;session='';legacyQuotaRead='';legacyDeadlines.clear();}
  function deadline(card){
    const m=card.aiMatch;if(complete(m)||legacyQuota(m)||!WAITING.has(m?.status))return null;
    const stamp=Date.parse(m.retryAt||'');if(Number.isFinite(stamp))return stamp;
    // Legacy failure rows lack retryAt. Re-read once after a bounded delay;
    // only the server decides whether an AI request is eligible.
    const key=String(card.rowId)+'|'+m.status;
    if(!legacyDeadlines.has(key))legacyDeadlines.set(key,Date.now()+(m.status==='processing'?120000:300000));
    return legacyDeadlines.get(key);
  }
  function notice(){
    const node=document.getElementById('collection-match-retry-status');if(node)node.textContent=paused?'自動重試已暫停，請稍後按重新整理再試。':hasLegacyQuota()?'配對狀態更新中，請稍後重新整理。':window.collectionMatchRetryMessage||'';
  }
  function paint(){if(visible())window.renderCardList?.(window.cardListRenderSource||window.harvestCards,{keepPage:true});notice();}
  function merge(cards){
    const updates=new Map(cards.filter(c=>c&&c.aiMatch).map(c=>[String(c.rowId),c.aiMatch]));
    const apply=list=>Array.isArray(list)?list.map(c=>!complete(c.aiMatch)&&updates.has(String(c.rowId))?{...c,aiMatch:updates.get(String(c.rowId))}:c):list;
    window.harvestCards=apply(window.harvestCards);window.allCards=apply(window.allCards);window.cardListRenderSource=apply(window.cardListRenderSource);paint();
  }
  function schedule(){
    clearTimer();notice();if(!visible()||!user()||session!==identity()||running||paused)return;
    const dates=(window.harvestCards||[]).map(deadline).filter(n=>n!==null);
    if(hasLegacyQuota()&&legacyQuotaRead!==identity())dates.push(Date.now());
    if(eligible().length&&blockedUntil>Date.now())dates.push(blockedUntil);
    if(!dates.length)return;
    const due=Math.max(Math.min(...dates),blockedUntil,Date.now()+1000),key=session;
    timer=setTimeout(()=>{timer=null;if(!visible()||identity()!==key){stop();return;}void window.ensureCollectedMatchScores({retry:true});},Math.min(due-Date.now(),2147483647));
  }
  window.resetCollectedMatchRetry=function(){stop();session=identity();retries=0;paused=false;blockedUntil=0;window.collectionMatchRetryMessage='';notice();};
  window.ensureCollectedMatchScores=async function(options={}){
    if(window.cardMatchRefreshing)return; // The explicit refresh already owns the authoritative read.
    if(!visible()||!user()||typeof window.fetchAPI!=='function'||!Array.isArray(window.harvestCards)){if(!visible())stop();return;}
    const key=identity();if(session!==key){const justRead=legacyQuotaRead===key;stop();session=key;legacyQuotaRead=justRead?key:'';retries=0;blockedUntil=0;paused=false;window.collectionMatchRetryMessage='';}
    if(running){notice();return;}if(paused||Date.now()<blockedUntil){schedule();return;}
    const restoreLegacyQuota=hasLegacyQuota()&&legacyQuotaRead!==key;
    const expired=window.harvestCards.some(c=>{const due=deadline(c);return due!==null&&due<=Date.now();});
    if(!restoreLegacyQuota&&!expired&&!eligible().length){schedule();return;}
    if(options.retry||expired){if(retries>=MAX_RETRIES){paused=true;schedule();return;}retries++;}
    const job={key,generation};running=job;clearTimer();
    const current=()=>running===job&&job.generation===generation&&identity()===key&&visible();
    try{
      if(expired||restoreLegacyQuota){
        if(restoreLegacyQuota)legacyQuotaRead=key;
        const response=await window.readCollectedMatchCards();if(!current())return;
        const cards=Array.isArray(response)?response:response?.data;
        if(response?.success===false||!Array.isArray(cards))throw Error('collection read unavailable');merge(cards);
      }
      for(let batch=0;batch<40&&current()&&eligible().length;batch++){
        const before=eligible().length,response=await window.fetchAPI('refreshCardHarvestMatches',{},true);if(!current())return;
        const result=response?.data||response;
        if(response?.success===false||!Array.isArray(result?.cards))throw Error('collection match unavailable');
        merge(result.cards);
        if(result.message){window.collectionMatchRetryMessage=result.failureCode==='quota'?'配對狀態更新中，請稍後重新整理。':String(result.message);notice();}
        // A wholly failed AI batch pauses the entire collection,
        // including cards not yet reached by this five-card batch. Trying the
        // next cards immediately would spend the same unavailable AI budget.
        if(!result.processed&&['provider','timeout','invalid_response'].includes(result.failureCode)){
          const retryAt=Date.parse(result.retryAt||'');
          blockedUntil=Math.max(blockedUntil,Number.isFinite(retryAt)&&retryAt>Date.now()?retryAt:Date.now()+300000);
          break;
        }
        if(!result.processed||eligible().length>=before){if(eligible().length)blockedUntil=Date.now()+READ_BACKOFF;break;}
      }
      // Bound work on a very large collection or an unchanging response.
      if(eligible().length)blockedUntil=Math.max(blockedUntil,Date.now()+READ_BACKOFF);
      else if(!(window.harvestCards||[]).some(c=>WAITING.has(c.aiMatch?.status)))window.collectionMatchRetryMessage='';
    }catch{if(current()){blockedUntil=Date.now()+READ_BACKOFF;window.collectionMatchRetryMessage='配對結果暫時無法讀取，稍後將重新嘗試；既有分數仍保留。';}}
    finally{if(running===job){running=null;if(!currentIdentity(job)){stop();}else schedule();}}
  };
  function currentIdentity(job){return job.generation===generation&&identity()===job.key&&visible();}
  document.addEventListener?.('visibilitychange',()=>{if(document.hidden)stop();else void window.ensureCollectedMatchScores();});
  window.addEventListener?.('pagehide',stop);
  window.addEventListener?.('pageshow',()=>void window.ensureCollectedMatchScores());
  const page=document.getElementById('page-card');
  if(page&&typeof MutationObserver!=='undefined')new MutationObserver(()=>{if(!visible())stop();else void window.ensureCollectedMatchScores();}).observe(page,{attributes:true,attributeFilter:['class','style','hidden']});
})();
