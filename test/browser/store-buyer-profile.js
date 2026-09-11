async()=>{
 if(location.origin!=='http://127.0.0.1:8794')throw Error('Local synthetic test only');
 const check=(v,m)=>{if(!v)throw Error(m);},until=async fn=>{for(let i=0;i<160;i++){if(fn())return;await new Promise(r=>setTimeout(r,30));}throw Error('Timeout: '+document.body.innerText);};
 const fixture=await (await fetch('/test-registration-fixture')).json(),source=document.createElement('section');source.hidden=true;source.innerHTML=fixture.panel+'<div id="privacy-terms-modal" class="hidden"></div><div id="toast-container"></div>';document.body.append(source);
 window.testToken='b';window.currentUserProfile={userId:'U'+'b'.repeat(32)};window.currentUser={userId:currentUserProfile.userId,name:'原會員',phone:'0912345678'};window.saveProfileRegistration=()=>{throw Error('Must not write general registration');};
 let reads=0,writes=0,orders=0,lastQuote;
 const originalFetch=window.fetch;
 window.fetch=async(url,options)=>{
  if(String(url).includes('/buyer-profile')){if(options?.method==='POST')writes++;else reads++;}
  if(String(url).endsWith('/orders')&&options?.method==='POST')orders++;
  if(String(url).endsWith('/quote')&&options?.method==='POST')lastQuote=JSON.parse(options.body);
  return originalFetch(url,options);
 };
 try{
  await openStoreShop();document.querySelector('[data-do=mine]').click();document.querySelector('[data-do=registration]').click();
  await until(()=>document.querySelector('.store-registration-popup[open]'));
  check(reads===0&&writes===0,'Collapsed bar must not read or save');
  let modal=document.querySelector('.store-registration-popup'),bar=modal.querySelector('[data-buyer-bar]');bar.open=true;
  await until(()=>bar.querySelector('fieldset')&&!bar.querySelector('fieldset').disabled);
  check(reads===1,'One explicit private read');
  let form=bar.querySelector('form');
  const values={name:'網購測試人',phone:'0912345678',email:'test@example.test',postal_code:'220',city:'新北市',district:'板橋區',address:'測試路1號3樓'};
  for(const [key,value] of Object.entries(values))form.elements[key].value=value;
  form.elements.consent.checked=true;form.requestSubmit();
  await until(()=>bar.querySelector('[data-buyer-status]').textContent.includes('已儲存'));
  check(writes===1&&orders===0,'Save one private profile only');
  check(modal.getBoundingClientRect().width<=innerWidth,'Popup width');
  modal.querySelector('[data-close]').click();document.querySelector('[data-do=registration]').click();
  await until(()=>document.querySelector('.store-registration-popup[open]'));modal=document.querySelector('.store-registration-popup');bar=modal.querySelector('[data-buyer-bar]');bar.open=true;
  await until(()=>bar.querySelector('fieldset')&&!bar.querySelector('fieldset').disabled);
  check(bar.querySelector('[name=address]').value===values.address,'Persisted server profile reloaded');
  check(!bar.querySelector('[name=consent]').checked,'Consent is explicit on each save');
  modal.querySelector('[data-close]').click();
  await openStoreShop();await until(()=>document.querySelector('[data-do=view][data-id="shop-a"]'));document.querySelector('[data-do=view][data-id="shop-a"]').click();
  await until(()=>document.querySelector('[data-do=online-buy]'));document.querySelector('[data-do=online-buy]').click();
  await until(()=>document.querySelector('[data-commerce-form=quote]'));
  form=document.querySelector('[data-commerce-form=quote]');check(!form.elements.buyer_name.value,'No silent prefill');
  document.querySelector('[data-commerce=load-buyer]').click();
  await until(()=>form.elements.buyer_name.value===values.name&&!document.querySelector('[data-commerce=load-buyer]').disabled);
  check(form.elements.name.value===values.name&&form.elements.address.value===values.address,'Same buyer copies name and address');
  form.elements.same_recipient.checked=false;form.elements.same_recipient.dispatchEvent(new Event('change',{bubbles:true}));
  check(!form.elements.name.disabled,'Different recipient editable');
  form.elements.name.value='其他收件人';form.elements.address.value='另一地址';
  form.elements.same_recipient.checked=true;form.elements.same_recipient.dispatchEvent(new Event('change',{bubbles:true}));
  check(form.elements.name.value===values.name&&form.elements.address.value===values.address,'Rechecking same buyer copies full contact');
  form.elements.address.value='本次訂單修改地址';form.elements.address.dispatchEvent(new Event('input',{bubbles:true}));
  form.elements['qty-p-a'].value='1';form.requestSubmit();
  await until(()=>!!lastQuote);
  check(lastQuote.customer.address==='本次訂單修改地址'&&lastQuote.buyer.name===values.name,'Confirmed form drives quote');
  check(writes===1&&orders===0,'Prefill and quote never save profile or create order');
  check(document.documentElement.scrollWidth<=innerWidth,'No horizontal overflow');
  return {passed:true,width:innerWidth,lazyBar:true,privateSaveReload:true,checkoutPrefill:true,sameBuyerAddress:true,editableOrderAddress:true,noOrderCreated:true};
 }finally{window.fetch=originalFetch;}
}
