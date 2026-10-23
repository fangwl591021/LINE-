(function(){
 const moduleUrl=new URL('./reward-applications.js?v=2',document.currentScript.src).href;
 window.openRewardApplicationReview=async function(target=''){
  const role=()=>typeof adminRole!=='undefined'?adminRole:window.userRole;
  if(role()!=='admin')return window.showToast?.('請使用平台管理員帳號登入',true);
  const base=String(window.Config?.WORKER_URL||(typeof WORKER_URL!=='undefined'?WORKER_URL:''));
  try{const module=await import(moduleUrl);await module.openRewardApplications({base,admin:true,target,isCurrent:()=>role()==='admin'});}catch(error){window.showToast?.(error.message,true);}
 };
})();
