// Run only against test/browser/store-commerce-server.mjs (synthetic users/data).
async()=>{
 if(location.origin!=='http://127.0.0.1:8794')throw Error('Local synthetic test only');
 const until=async(fn)=>{for(let i=0;i<100;i++){if(fn())return;await new Promise(r=>setTimeout(r,40));}throw Error(document.body.innerText);};
 const check=(v,m)=>{if(!v)throw Error(m);};
 window.testToken='a';await openStoreShop();document.querySelector('[data-do=manage]').click();await until(()=>document.querySelector('[data-do=edit]'));
 document.querySelector('[data-do=edit][data-id=p-local]').click();
 let form=document.querySelector('[data-form=product]');
 check([...form.elements.purchase_mode.options].map(o=>o.textContent).join('/')==='限店內/網購','sales options');
 check(form.elements.purchase_mode.value==='in_store','legacy default');
 form.elements.purchase_mode.value='online';form.requestSubmit();await until(()=>!document.querySelector('[data-form=product]'));
 document.querySelector('[data-do=edit][data-id=p-local]').click();form=document.querySelector('[data-form=product]');
 check(form.elements.purchase_mode.value==='online','sales mode not persisted');form.elements.purchase_mode.value='in_store';form.requestSubmit();await until(()=>!document.querySelector('[data-form=product]'));
 window.testToken='b';await openStoreShop();await until(()=>document.querySelector('[data-do=view]'));document.querySelector('[data-do=view]').click();await until(()=>document.querySelector('[data-do=detail]'));
 document.querySelector('[data-do=detail][data-id=p-local]').click();
 check(!document.querySelector('[data-do=online-buy]'),'in-store detail has checkout');
 document.querySelector('[data-do=view]').click();await until(()=>document.querySelector('[data-do=online-buy]'));document.querySelector('[data-do=online-buy]').click();await until(()=>document.querySelector('[data-commerce-form=quote]'));
 form=document.querySelector('[data-commerce-form=quote]');let f=form.elements;
 check(!f['qty-p-local'],'in-store cart entry');check(!form.checkValidity(),'blank buyer allowed');
 check(getComputedStyle(f.store_info.closest('label')).display==='none','hidden store info visible');
 f['qty-p-a'].value='1';f.buyer_name.value='購買測試者';f.buyer_phone.value='0912345678';f.buyer_email.value='buyer@example.test';
 f.city.value='台北市';f.district.value='中正區';f.address.value='測試路1號';form.dispatchEvent(new Event('input',{bubbles:true}));
 check(f.name.disabled&&f.name.value===f.buyer_name.value,'same recipient failed');
 f.carrier.value='FAMILY';form.dispatchEvent(new Event('change',{bubbles:true}));
 check(getComputedStyle(f.address.closest('label')).display==='none','postal fields visible for store pickup');
 check(f.store_info.required&&!form.checkValidity(),'store pickup info optional');
 f.store_info.value='測試門市 123 台北市中正區測試路1號';
 check(form.checkValidity(),'valid store pickup rejected');
 form.requestSubmit();await until(()=>document.querySelector('[data-commerce=place]'));
 check(document.body.innerText.includes('購買測試者')&&document.body.innerText.includes('測試門市'),'confirmation missing customer');
 document.querySelector('[data-commerce=edit]').click();await until(()=>document.querySelector('[data-commerce-form=quote]'));
 form=document.querySelector('[data-commerce-form=quote]');f=form.elements;
 check(f.same_recipient.checked&&f.buyer_email.value==='buyer@example.test'&&f.store_info.value.includes('123'),'back loses fields');
 f.same_recipient.checked=false;form.dispatchEvent(new Event('change',{bubbles:true}));f.name.value='不同收件人';f.phone.value='0987654321';form.requestSubmit();await until(()=>document.querySelector('[data-commerce=place]'));
 check(document.body.innerText.includes('不同收件人')&&document.body.innerText.includes('購買測試者'),'separate buyer and recipient lost');
 check(document.documentElement.scrollWidth<=innerWidth,'mobile overflow');
 check(!JSON.stringify(localStorage).includes('buyer@example.test'),'PII persisted locally');
 return {width:innerWidth,modeSaved:true,inStoreBlocked:true,buyerRequired:true,sameRecipient:true,separateRecipient:true,shippingFields:true,backPreserved:true,noPiiStorage:true,noOverflow:true};
}
