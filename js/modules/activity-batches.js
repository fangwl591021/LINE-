/* Series selection; registrations stay in the existing joinActivity flow. */
(function(){
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const isSeries=a=>a?.isBatch===true || a?.['是否系列']===true || String(a?.['是否系列']).toUpperCase()==='TRUE';
  const id=a=>String(a.activityId||a['活動ID']||'');
  function schedule(batch){
    const start=String(batch.startTime||batch['開始時間']||'').trim();
    const end=String(batch.endTime||batch['結束時間']||'').trim();
    const parts=value=>/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}:\d{2})(?::00)?$/.exec(value);
    const s=parts(start),e=parts(end);
    const display=match=>`${match[1]}/${match[2]}/${match[3]} ${match[4]}`;
    if(s&&e&&s.slice(1,4).join('-')===e.slice(1,4).join('-'))return `${display(s)}–${e[4]}`;
    return (s?display(s):start)+(end?' ～ '+(e?display(e):end):'');
  }
  async function mount(activity,host){
    if(!host||!isSeries(activity))return;
    // Match the adjacent activity description, not the larger page default.
    host.classList.add('text-[14px]','text-slate-600');
    host.dataset.activityId=id(activity);host.dataset.ready='false';host.textContent='讀取梯次中…';
    try{
      let batches=activity.batches;
      if(!Array.isArray(batches)){
        const result=await window.fetchAPI('getActivityById',{activityId:id(activity),networkId:activity.networkId||activity['歸屬網']||'admin'},true);
        if(!result||result.error||result.success===false)throw Error('無法讀取梯次');
        batches=(result.data||result).batches;
      }
      if(!host.isConnected)return;
      const available=(batches||[]).filter(b=>(b.status||b['狀態'])==='上架');
      if(!available.length)throw Error('目前沒有可報名梯次，請向主辦單位確認');
      host.innerHTML=`<fieldset style="min-width:0;width:100%;margin:0;padding:0;border:0;font:inherit;color:inherit;background:transparent"><legend style="padding:0;font:inherit;color:inherit">勾選報名梯次（可複選）</legend>${available.map((b,i)=>`<label style="display:flex;align-items:flex-start;gap:8px;min-height:44px;padding:8px 0;${i<available.length-1?'border-bottom:1px solid #e2e8f0;':''}font:inherit;color:inherit;cursor:pointer"><input type="checkbox" value="${esc(id(b))}" style="width:18px;height:18px;flex-shrink:0;margin:2px 0 0;accent-color:#06c755"><span style="flex:1;min-width:0;overflow-wrap:break-word"><span style="display:flex;flex-wrap:wrap;justify-content:space-between;gap:0 8px"><span>${esc(b.batchName||b.activityName||b['活動名稱'])}</span><span style="white-space:nowrap">${Number(b.price)>0?'NT$ '+esc(b.price):'免費'}</span></span><span style="display:block">${esc(schedule(b))}</span></span></label>`).join('')}</fieldset>`;
      host.dataset.ready='true';
    }catch(e){if(host.isConnected){host.innerHTML='<p role="alert"></p><button type="button" style="padding:12px">重新讀取梯次</button>';host.querySelector('p').textContent=e.message;host.querySelector('button').onclick=()=>{void mount(activity,host);};}}
  }
  function selection(activity){
    if(!isSeries(activity))return null;
    const host=document.getElementById('activity-batch-choices');
    if(!host||host.dataset.activityId!==id(activity)||host.dataset.ready!=='true')throw Error('請先完成梯次載入');
    const ids=[...host.querySelectorAll('input:checked')].map(input=>input.value);
    if(!ids.length)throw Error('請勾選要報名的梯次');
    return ids;
  }
  window.ActivityBatches={isSeries,mount,selection};
})();
