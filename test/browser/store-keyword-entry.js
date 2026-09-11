async()=>{
 if(location.origin!=='http://127.0.0.1:8794')throw Error('local only');
 const check=(v,m)=>{if(!v)throw Error(m)},until=async fn=>{for(let i=0;i<140;i++){if(fn())return;await new Promise(r=>setTimeout(r,30));}throw Error(document.body.innerText);};
 const original=window.fetch;let writes=0;
 window.fetch=(url,options)=>{if(options?.method==='POST')writes++;return original(url,options);};
 try{
  window.testToken='a';await openStoreShop('','','','manage');
  await until(()=>document.querySelector('[data-do=sales]'));check(document.querySelector('[data-form=store]'),'manage route');
  await openStoreShop('','','','sales');await until(()=>document.querySelector('.shop-sales-result')?.innerText.includes('成功筆數'));
  await openStoreShop('','','','online-manage');await until(()=>document.querySelector('[data-commerce-form=settings]'));
  window.testToken='b';await openStoreShop('','','','sales');await until(()=>document.body.innerText.includes('業績與收款操作僅開放'));
  check(!document.querySelector('[data-sales-form]'),'member denied sales');
  await openStoreShop('','','','mine');await until(()=>document.querySelector('[data-do=registration]'));
  check(writes===0,'opening actions must not save');check(document.documentElement.scrollWidth<=innerWidth,'no horizontal overflow');
  return {passed:true,width:innerWidth,management:true,sales:true,ordersSettings:true,memberDenied:true,noWrites:true};
 }finally{window.fetch=original;}
}
