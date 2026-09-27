/* A pure activity view route; the existing auth handler is its sole session owner. */
(function () {
  let sequence = 0;
  let entryTarget = null;
  const allowed = new Set(['a','activityId','act','event','r','ref','referrerId','n','net','networkId','v','via',
    'liff.state','code','state','liffClientId','liffRedirectUri','friendship_status_changed','liffIsEscapedFromApp']);
  function readTarget(params) {
    if (!params || window.location.hash || [...params.keys()].some(key=>!allowed.has(key))) return null;
    const values = keys => [...new Set(keys.flatMap(key=>params.getAll(key)).map(value=>value.trim()))];
    const ids=values(['a','activityId','act','event']), networks=values(['n','net','networkId']), refs=values(['r','ref','referrerId']);
    if (ids.length!==1 || !/^[A-Za-z0-9_-]{1,160}$/.test(ids[0]) || networks.length>1 || refs.length>1) return null;
    if (networks.some(value=>!value || !/^[A-Za-z0-9_-]{1,160}$/.test(value))) return null;
    return { activityId:ids[0], networkId:networks[0] || refs[0] || 'admin' };
  }
  function showPending(failed = false) {
    window.goPage('my-act-detail', true);
    const content=document.getElementById('my-act-detail-content');
    content.innerHTML='<div class="bg-white rounded-3xl p-6 space-y-4"><h3 class="text-xl font-black">活動報名</h3><p role="status" id="activity-entry-status"></p><div class="flex flex-wrap gap-3"><button type="button" id="activity-entry-retry" class="px-5 py-3 bg-emerald-600 text-white rounded-xl font-bold">重新載入</button><button type="button" id="activity-entry-back" class="px-5 py-3 bg-slate-100 rounded-xl font-bold">返回首頁</button></div></div>';
    document.getElementById('activity-entry-status').textContent=failed ? '暫時無法確認會員資料，請重新載入，不需要重新註冊。' : '正在確認登入並準備活動內容…';
    const retry=document.getElementById('activity-entry-retry');retry.hidden=!failed;retry.onclick=()=>window.location.reload();
    document.getElementById('activity-entry-back').onclick=()=>{sequence++;window.goPage('home');};
  }
  function prepare(target) {
    entryTarget = target;
    window.__openedActivityParam = target.activityId;
    showPending();
    return ++sequence;
  }
  function accessToken() {
    try { return window.liff?.getAccessToken?.() || ''; } catch (_) { return ''; }
  }
  function sessionGuard(request) {
    const uid = window.currentUserProfile?.userId, token = accessToken();
    return () => request === sequence && window.currentPage === 'my-act-detail' &&
      uid === window.currentUserProfile?.userId && token === accessToken();
  }
  async function open(target) {
    const request=++sequence, uid=window.currentUserProfile?.userId;
    const token=accessToken(), current=sessionGuard(request);
    entryTarget=target;
    window.__openedActivityParam=target.activityId; // A later manual return must not re-open the old URL.
    showPending();
    document.getElementById('activity-entry-status').textContent='正在讀取活動內容…';
    let timer;
    try {
      if (!uid || !token) throw new Error('請重新從 LINE 開啟活動連結。');
      const result=await Promise.race([
        window.fetchAPI('getActivityById',{activityId:target.activityId,networkId:target.networkId},true),
        new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('活動讀取逾時，請重試。')),15000);})
      ]);
      if (!current()) return;
      if (!result || result.success===false || result.error) throw new Error('無法讀取這個活動，請重試或向主辦單位確認連結。');
      const activity=result.data || result;
      const id=String(activity.activityId || activity.activity_id || activity['活動ID'] || activity.rowId || activity.id || '');
      if (id!==target.activityId) throw new Error('找不到這個活動，請向主辦單位確認連結。');
      if (!['上架','active','published'].includes(String(activity.status || activity['狀態'] || ''))) throw new Error('這個活動目前已下架，請向主辦單位確認。');
      window.allActivities=[...(window.allActivities || []).filter(item=>String(item.activityId || item.activity_id || item['活動ID'] || item.rowId || item.id || '')!==id),activity];
      window.openActivityDetail(id);
    } catch (error) {
      if (!current()) return;
      document.getElementById('activity-entry-status').textContent=error.message;
      const retry=document.getElementById('activity-entry-retry');retry.hidden=false;retry.onclick=()=>{void open(target);};
    } finally { clearTimeout(timer); }
  }
  window.ActivityEntry={readTarget,showPending,prepare,sessionGuard,open,
    getTarget:()=>window.currentPage==='my-act-detail' ? entryTarget : null};
})();
