(function(){
 const moduleUrl=new URL('./reward-applications.js?v=3',document.currentScript.src).href;
 const kinds=['reward','discount','partner','full'];
 const uuid=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
 // This is a navigation hint only; the API independently verifies current admin authority.
 window.readSignedApplicationReviewEntry=function(params){
  const keys=['applicationReview','applicationKind','applicationId'];
  if(!params||!keys.some(key=>params.has(key)))return null;
  const allowed=new Set(['shopSection',...keys,'liff.state','code','state','liffClientId','liffRedirectUri','friendship_status_changed']);
  if(params.get('shopSection')!=='mine'||params.get('applicationReview')!=='1'||['shopSection',...keys].some(key=>params.getAll(key).length!==1)||[...params.keys()].some(key=>!allowed.has(key))||!kinds.includes(params.get('applicationKind'))||!uuid.test(params.get('applicationId')||''))return null;
  return {kind:params.get('applicationKind'),applicationId:params.get('applicationId')};
 };
 window.openRewardApplicationReview=async function(target='',options={}){
  const role=()=>typeof adminRole!=='undefined'?adminRole:window.userRole;
  const isAdmin=()=>['admin','總管'].includes(String(role()||'').toLowerCase());
  if(!isAdmin())return window.showToast?.('請使用平台管理員帳號登入',true);
  if(!options||typeof options!=='object'||Array.isArray(options)||Object.keys(options).some(key=>!['kind','applicationId'].includes(key))||(options.kind&&!kinds.includes(options.kind))||(options.applicationId&&!uuid.test(options.applicationId)))return window.showToast?.('申請通知連結格式不正確',true);
  const base=String(window.Config?.WORKER_URL||(typeof WORKER_URL!=='undefined'?WORKER_URL:''));
  try{const module=await import(moduleUrl);return await module.openRewardApplications({base,admin:true,target,kind:options.kind||'reward',applicationId:options.applicationId||'',isCurrent:isAdmin});}catch(error){window.showToast?.(error.message,true);}
 };
})();
