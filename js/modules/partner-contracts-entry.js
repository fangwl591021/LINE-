(function(){
 const url=new URL('./partner-contracts.js?v=11510-3',document.currentScript.src).href;
 window.openPartnerContracts=async function(target=''){
  const role=()=>typeof adminRole!=='undefined'?adminRole:window.userRole;
  if(role()!=='admin')return window.showToast?.('請使用平台管理員帳號登入',true);
  const base=String(window.Config?.WORKER_URL||(typeof WORKER_URL!=='undefined'?WORKER_URL:''));
  try{const module=await import(url);await module.openPartnerContracts({base,target,isCurrent:()=>role()==='admin'});}catch(error){window.showToast?.(error.message,true);}
 };
})();
