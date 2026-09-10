// Run in Chrome on test/browser/store-commerce-server.mjs, never production.
async()=>{
 if(location.origin!=='http://127.0.0.1:8794')throw Error('Local synthetic test only');
 const until=async(fn)=>{for(let i=0;i<100;i++){if(fn())return;await new Promise(r=>setTimeout(r,40));}throw Error(document.body.innerText);};
 const check=(v,m)=>{if(!v)throw Error(m);};
 window.testToken='b';await openStoreShop();await until(()=>document.querySelector('[data-do=view]'));
 const before=await fetch('/v1/store-commerce/orders',{headers:{Authorization:'Bearer b'}}).then(r=>r.json());
 document.querySelector('[data-do=view]').click();await until(()=>document.querySelector('[data-do=online-buy]'));
 document.querySelector('[data-do=online-buy]').click();await until(()=>document.querySelector('[data-commerce-form=quote]'));
 let form=document.querySelector('form');form.elements['qty-p-a'].value='1';
 for(const [k,v]of Object.entries({name:'自動測試收件人',phone:'0912345678',address:'100 台北市測試路1號',note:crypto.randomUUID()}))form.elements[k].value=v;
 form.requestSubmit();await until(()=>document.querySelector('[data-commerce=place]'));
 check(document.body.innerText.includes('8,860'),'server price');check(!document.querySelector('img[src=x]'),'XSS');
 document.querySelector('[data-commerce=edit]').click();await until(()=>document.querySelector('[data-commerce-form=quote]'));
 check(document.querySelector('[name=name]').value==='自動測試收件人','lost recipient');
 document.querySelector('form').requestSubmit();await until(()=>document.querySelector('[data-commerce=place]'));
 const original=window.fetch;
 try{
  window.fetch=async(url,options)=>{const response=await original(url,options);if(String(url).endsWith('/v1/store-commerce/orders')&&options?.method==='POST')throw Error('TEST_RESPONSE_LOST');return response;};
  document.querySelector('[data-commerce=place]').click();await until(()=>document.querySelector('.commerce-error').textContent.includes('TEST_RESPONSE_LOST'));
 }finally{window.fetch=original;}
 check(!!localStorage.getItem('store-commerce-pending:U'+'b'.repeat(32)),'lost retry ID');
 document.querySelector('[data-do=online-orders]').click();await until(()=>document.querySelector('.shop-sales-list'));
 check(localStorage.getItem('store-commerce-pending:U'+'b'.repeat(32))===null,'failed lookup recovery');
 check(document.querySelectorAll('.shop-sale-row').length===before.orders.length+1,'duplicate order');
 document.querySelector('details').open=true;form=document.querySelector('[data-commerce-form=action]');form.elements.last5.value='12345';form.requestSubmit();
 await until(()=>document.querySelector('.shop-sale-heading').textContent.includes('待核帳'));
 window.testToken='a';await openStoreShop();await until(()=>document.querySelector('[data-do=manage]'));
 document.querySelector('[data-do=manage]').click();await until(()=>document.querySelector('[data-do=online-manage]'));
 document.querySelector('[data-do=online-manage]').click();await until(()=>document.querySelector('[data-commerce-form=settings]'));
 check(document.documentElement.scrollWidth<=innerWidth,'settings overflow');
 document.querySelector('[data-commerce=orders]').click();await until(()=>document.querySelector('[data-action=verify_remittance]'));
 document.querySelector('details').open=true;form=document.querySelector('[data-action=verify_remittance]');form.elements.received.value='1';form.elements.confirmed.checked=true;form.requestSubmit();
 await until(()=>document.querySelector('.commerce-error').textContent.includes('金額不符'));
 form.elements.received.value='8860';form.requestSubmit();await until(()=>document.querySelector('[data-action=ship]'));
 document.querySelector('details').open=true;form=document.querySelector('[data-action=ship]');form.elements.tracking_number.value='TEST-12345';form.requestSubmit();
 await until(()=>document.querySelector('[data-action=complete]'));document.querySelector('details').open=true;document.querySelector('[data-action=complete]').requestSubmit();
 await until(()=>document.querySelector('.shop-sale-heading').textContent.includes('已完成'));
 check(document.documentElement.scrollWidth<=innerWidth,'order overflow');
 let release;try{
  window.fetch=(url,options)=>String(url).includes('/orders?')?new Promise(resolve=>release=()=>resolve(Response.json({success:true,orders:[],has_more:false}))):original(url,options);
  document.querySelector('[data-commerce=orders]').click();await until(()=>release);
  document.querySelector('[data-do=list]').click();await until(()=>document.querySelector('[data-do=view]'));release();await new Promise(r=>setTimeout(r,80));
  check(!!document.querySelector('[data-do=view]'),'stale response');
 }finally{window.fetch=original;}
 return {width:innerWidth,checkout:true,timeoutRecovery:true,reportThenVerify:true,shipment:true,completion:true,noXss:true,noOverflow:true,staleResponseIgnored:true};
}
