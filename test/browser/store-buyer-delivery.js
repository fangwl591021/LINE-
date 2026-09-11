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
  const values={name:'網購測試人',phone:'0912345678',email:'test@example.test',postal_code:'',city:'',district:'',address:'',carrier:'FAMILY',store_info:'123456 全家測試店 測試路2號'};
  for(const [key,value] of Object.entries(values))form.elements[key].value=value;
  form.elements.carrier.dispatchEvent(new Event('change',{bubbles:true}));form.elements.store_info.value=values.store_info;
  check(!form.elements.city.required&&!form.elements.address.required&&form.elements.store_info.required,'CVS needs store, not residential address');
  check(getComputedStyle(form.elements.address.closest('label')).display==='none','Postal fields actually hidden');
  form.elements.consent.checked=true;form.requestSubmit();
  await until(()=>bar.querySelector('[data-buyer-status]').textContent.includes('已儲存'));
  check(writes===1&&orders===0,'Save one private profile only');
  check(modal.getBoundingClientRect().width<=innerWidth,'Popup width');
  modal.querySelector('[data-close]').click();document.querySelector('[data-do=registration]').click();
  await until(()=>document.querySelector('.store-registration-popup[open]'));modal=document.querySelector('.store-registration-popup');bar=modal.querySelector('[data-buyer-bar]');bar.open=true;
  await until(()=>bar.querySelector('fieldset')&&!bar.querySelector('fieldset').disabled);
  check(bar.querySelector('[name=carrier]').value==='FAMILY'&&bar.querySelector('[name=store_info]').value===values.store_info,'Persisted CVS preference reloaded');
  check(!bar.querySelector('[name=consent]').checked,'Consent is explicit on each save');
  modal.querySelector('[data-close]').click();
  await openStoreShop();await until(()=>document.querySelector('[data-do=view][data-id="shop-a"]'));document.querySelector('[data-do=view][data-id="shop-a"]').click();
  await until(()=>document.querySelector('[data-do=online-buy]'));document.querySelector('[data-do=online-buy]').click();
  await until(()=>document.querySelector('[data-commerce-form=quote]'));
  form=document.querySelector('[data-commerce-form=quote]');check(!form.elements.buyer_name.value,'No silent prefill');
  document.querySelector('[data-commerce=load-buyer]').click();
  await until(()=>form.elements.buyer_name.value===values.name&&!document.querySelector('[data-commerce=load-buyer]').disabled);
  check(form.elements.name.value===values.name&&form.elements.carrier.value==='FAMILY'&&form.elements.store_info.value===values.store_info,'Same buyer copies contact and CVS');
  check(!form.elements.store_info.disabled&&form.elements.address.disabled,'Async unlock preserves delivery validation');
  form.elements.carrier.value='SEVEN';form.elements.carrier.dispatchEvent(new Event('change',{bubbles:true}));
  check(!form.elements.store_info.value,'Switch carrier clears wrong chain store');
  form.elements.store_info.value='654321 7-11 本次門市';
  form.elements.same_recipient.checked=false;form.elements.same_recipient.dispatchEvent(new Event('change',{bubbles:true}));
  form.elements.name.value='其他收件人';
  document.querySelector('[data-commerce=load-buyer]').click();
  await until(()=>!document.querySelector('[data-commerce=load-buyer]').disabled);
  check(form.elements.name.value==='其他收件人'&&form.elements.carrier.value==='SEVEN'&&form.elements.store_info.value==='654321 7-11 本次門市','Unchecked same buyer preserves different recipient and store');
  form.elements.same_recipient.checked=true;form.elements.same_recipient.dispatchEvent(new Event('change',{bubbles:true}));
  check(form.elements.carrier.value==='FAMILY'&&form.elements.store_info.value===values.store_info,'Checking same buyer restores saved CVS');
  form.elements.store_info.value='111111 全家本次改店 測試路3號';form.elements.store_info.dispatchEvent(new Event('input',{bubbles:true}));
  form.elements['qty-p-a'].value='1';form.requestSubmit();
  await until(()=>!!document.querySelector('[data-commerce=place]'));
  check(lastQuote.customer.carrier==='FAMILY'&&lastQuote.customer.store_info==='111111 全家本次改店 測試路3號'&&!lastQuote.customer.address,'Quote uses confirmed CVS without postal address');
  check(document.querySelector('.commerce-panel').innerText.includes('全家店到店'),'Preview shows carrier');
  check(writes===1&&orders===0,'Prefill and quote never save profile or create order');
  check(document.documentElement.scrollWidth<=innerWidth,'No horizontal overflow');
  return {passed:true,width:innerWidth,lazyBar:true,privateSaveReload:true,checkoutPrefill:true,cvsPreference:true,carrierSwitch:true,differentRecipientPreserved:true,editableOrderStore:true,noOrderCreated:true};
 }finally{window.fetch=originalFetch;}
}
