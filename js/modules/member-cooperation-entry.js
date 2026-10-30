(function(){
  const moduleUrl=new URL('./reward-applications.js?v=6',document.currentScript.src).href;
  let opening=false;
  const notify=message=>{
    if(typeof window.showToast==='function')window.showToast(message,true);
    else window.alert(message);
  };
  window.openMemberCooperationApplications=async function(){
    if(opening)return;
    let isCurrent=()=>window.currentPage==='admin-settings';
    try{
      const token=window.liff?.isLoggedIn?.()?window.liff.getAccessToken():'';
      if(!token){notify('請先使用 LINE 登入，再開啟合作申請');return;}
      const owner=window.currentUserProfile?.userId||'';
      const base=String(window.Config?.WORKER_URL||(typeof WORKER_URL!=='undefined'?WORKER_URL:''));
      if(!base){notify('合作申請服務尚未準備完成，請稍後重試');return;}
      isCurrent=()=>window.currentPage==='admin-settings'&&window.liff?.isLoggedIn?.()&&window.liff.getAccessToken()===token&&(window.currentUserProfile?.userId||'')===owner;
      if(!isCurrent())return;
      opening=true;
      const module=await import(moduleUrl);
      if(isCurrent())await module.openRewardApplications({base,isCurrent});
    }catch(error){
      if(isCurrent())notify(error?.message||'合作申請暫時無法開啟，請稍後重試');
    }finally{opening=false;}
  };
})();
