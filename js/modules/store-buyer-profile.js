// Private member contact; no localStorage, public card writes, or automatic checkout submission.
const fields=[['name','購買人姓名 *','text',80,'name'],['phone','手機 *','tel',30,'tel'],['email','Email（選填）','email',254,'email'],['postal_code','郵遞區號（選填）','text',6,'postal-code'],['city','縣市 *','text',20,'address-level1'],['district','區域／鄉鎮市 *','text',20,'address-level2'],['address','路名、巷弄、門牌、樓層 *','text',200,'street-address']];
export async function requestBuyerProfile({base,isCurrent=()=>true},data){
 const token=window.liff?.isLoggedIn?.()?window.liff.getAccessToken():'',owner=window.currentUserProfile?.userId;
 const current=()=>isCurrent()&&window.liff?.isLoggedIn?.()&&token===window.liff.getAccessToken()&&owner===window.currentUserProfile?.userId;
 if(!token||!current())throw Error('請先登入本人帳號');
 const response=await fetch(String(base).replace(/\/+$/,'')+'/v1/store-commerce/buyer-profile',{method:data?'POST':'GET',headers:{Authorization:'Bearer '+token,...(data?{'Content-Type':'application/json'}:{})},body:data?JSON.stringify(data):undefined,signal:AbortSignal.timeout(15000)});
 const result=await response.json();
 if(!current())throw Error('登入身分或頁面已變更，請重新開啟');
 if(!response.ok||!result.success)throw Error(result.error||'網購資料讀取失敗，請稍後重試');
 return result.profile;
}
export function mountBuyerProfile(host,options){
 let busy=false,version=0,loaded=false;
 host.innerHTML='<p class="store-registration-note">這份資料僅供本人管理與結帳帶入，不顯示於公開名片。實際寄送仍以每筆訂單確認的收件資料為準。</p><button type="button" data-buyer-reload>重新讀取</button><form data-buyer-form><fieldset disabled></fieldset><p data-buyer-status role="status" aria-live="polite"></p></form>';
 const form=host.querySelector('form'),fieldset=form.querySelector('fieldset'),status=form.querySelector('[data-buyer-status]'),reload=host.querySelector('[data-buyer-reload]');
 for(const [key,title,type,max,autocomplete] of fields){
  const label=document.createElement('label');label.textContent=title;
  const input=document.createElement('input');Object.assign(input,{name:key,type,maxLength:max,autocomplete,required:title.endsWith('*')});label.append(input);fieldset.append(label);
 }
 const consent=document.createElement('label');consent.className='store-buyer-consent';
 consent.innerHTML='<input type="checkbox" name="consent" required>我同意儲存此私人網購資料，供日後購買時自行帶入。';
 fieldset.append(consent);
 const save=document.createElement('button');save.type='submit';save.textContent='儲存網購人資料';fieldset.append(save);
 const current=()=>host.isConnected&&options.isCurrent();
 async function load(){
  if(busy||!current())return;
  busy=true;fieldset.disabled=true;reload.disabled=true;status.textContent='讀取本人網購資料…';
  try{
   const profile=await requestBuyerProfile({...options,isCurrent:current});if(!current())return;
   version=profile?.version||0;
   for(const [key] of fields)form.elements[key].value=profile?.[key]||'';
   form.elements.consent.checked=false;loaded=true;status.textContent=profile?'已讀取，可修改後儲存。':'尚未填寫，請填妥後儲存。';
  }catch(error){if(current())status.textContent=error.message;}
  finally{busy=false;if(current()){fieldset.disabled=!loaded;reload.disabled=false;}}
 }
 reload.onclick=()=>{if(loaded&&!window.confirm('重新讀取會取代尚未儲存的網購資料，是否繼續？'))return;void load();};
 form.onsubmit=event=>{
  event.preventDefault();event.stopPropagation();if(busy||!loaded||!current())return;
  const data={version,consent:form.elements.consent.checked};for(const [key] of fields)data[key]=form.elements[key].value.trim();
  busy=true;fieldset.disabled=true;reload.disabled=true;host.dataset.buyerSaving='1';status.textContent='儲存中…';
  void (async()=>{try{
   const profile=await requestBuyerProfile({...options,isCurrent:current},data);if(!current())return;
   version=profile.version;for(const [key] of fields)form.elements[key].value=profile[key]||'';
   status.textContent='網購人資料已儲存，結帳時可帶入。';
  }catch(error){if(current())status.textContent=error.message;}
  finally{busy=false;delete host.dataset.buyerSaving;if(current()){fieldset.disabled=false;reload.disabled=false;}}})();
 };
 void load();
}
