// Run only in the isolated local commerce fixture. One explicit synthetic product save.
(async () => {
 if(location.origin!=='http://127.0.0.1:8794')throw Error('Synthetic localhost only');
 const original=window.fetch;let mode='missing',settingsReads=0,writes=0;
 const config={enabled:1,bank_name:'測試銀行',bank_code:'004',bank_account:'1234567890',bank_holder:'測試戶名',shipping_fee_cents:0,free_shipping_cents:0,version:1};
 window.fetch=async(input,options={})=>{
  const url=new URL(typeof input==='string'?input:input.url,location.href);
  if(url.origin!==location.origin)throw Error('External requests forbidden');
  if(options.method==='POST')writes++;
  if(url.pathname==='/v1/store-commerce/settings'){
   settingsReads++;
   if(mode==='error')return Response.json({success:false,error:'private debug details'},{status:503});
   return Response.json({success:true,release_enabled:mode!=='global-off',settings:mode==='missing'?{...config,enabled:0,bank_account:''}:mode==='disabled'?{...config,enabled:0}:config});
  }
  return original(input,options);
 };
 const assert=(ok,message)=>{if(!ok)throw Error(message);};
 const wait=async test=>{for(let i=0;i<150;i++){if(test())return;await new Promise(r=>setTimeout(r,20));}throw Error('UI timeout');};
 const catalog=()=>document.querySelector('[data-online-warning="catalog"]');
 const formWarning=()=>document.querySelector('[data-online-warning="product"]');
 const form=()=>document.querySelector('[data-form="product"]');
 const choose=(name,value)=>{form().elements[name].value=value;form().elements[name].dispatchEvent(new Event('change',{bubbles:true}));};
 try{
  window.testToken='a';await window.openStoreShop('','','','manage');
  await wait(()=>catalog()&&!catalog().hidden&&catalog().textContent.includes('尚未完成'));
  assert(getComputedStyle(catalog().querySelector('p')).color==='rgb(185, 28, 28)','Warning is red');
  document.querySelector('[data-do="edit"][data-id="p-a"]').click();
  await wait(()=>formWarning()&&!formWarning().hidden&&formWarning().textContent.includes('尚未完成'));
  choose('status','draft');assert(formWarning().hidden,'Draft should not warn');
  choose('status','active');await wait(()=>!formWarning().hidden&&formWarning().textContent.includes('尚未完成'));
  choose('purchase_mode','in_store');assert(formWarning().hidden,'In-store should not warn');await wait(()=>catalog().textContent.includes('尚未完成'));
  mode='ready';choose('purchase_mode','online');await wait(()=>formWarning().hidden&&catalog().hidden);
  mode='disabled';choose('status','active');await wait(()=>formWarning().textContent.includes('尚未開啟'));
  mode='global-off';choose('status','active');await wait(()=>formWarning().textContent.includes('全站網購'));
  mode='error';choose('status','active');await wait(()=>formWarning().textContent.includes('無法確認'));
  assert(!formWarning().textContent.includes('private debug'),'Do not expose API internals');
  mode='missing';choose('status','active');await wait(()=>formWarning().textContent.includes('尚未完成'));
  assert(writes===0,'Checking settings must be read-only');
  form().requestSubmit();await wait(()=>!form()&&catalog()&&!catalog().hidden&&catalog().textContent.includes('尚未完成'));
  assert(writes===1,'Only explicit product save writes');
  catalog().querySelector('button').click();await wait(()=>document.querySelector('[data-commerce-form="settings"]'));
  assert(writes===1,'Opening settings must not enable/save it');
  return {pass:true,settingsReads,explicitProductSaves:writes,redWarning:true,missing:true,disabled:true,globalOff:true,failure:true,readyHidden:true,draftHidden:true,inStoreHidden:true,afterSave:true,settingsLink:true};
 }finally{window.fetch=original;}
})
