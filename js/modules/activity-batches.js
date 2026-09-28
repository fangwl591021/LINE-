/* Series selection; registrations stay in the existing joinActivity flow. */
(function(){
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const isSeries=a=>a?.isBatch===true || a?.['是否系列']===true || String(a?.['是否系列']).toUpperCase()==='TRUE';
  const id=a=>String(a.activityId||a['活動ID']||'');
  async function mount(activity,host){
    if(!host||!isSeries(activity))return;
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
      host.innerHTML=`<fieldset style="border:1px solid #a7f3d0;border-radius:14px;padding:12px"><legend style="font-weight:bold">勾選報名梯次（可複選）</legend>${available.map(b=>`<label style="display:flex;align-items:flex-start;gap:10px;padding:12px 0;border-bottom:1px solid #e2e8f0;overflow-wrap:anywhere"><input type="checkbox" value="${esc(id(b))}" style="width:22px;height:22px;flex-shrink:0;margin-top:3px"><span><strong>${esc(b.batchName||b.activityName||b['活動名稱'])}</strong><br>${esc(b.startTime||b['開始時間'])}${b.endTime?' ～ '+esc(b.endTime):''}<br>${Number(b.price)>0?'NT$ '+esc(b.price):'免費'}</span></label>`).join('')}</fieldset>`;
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
