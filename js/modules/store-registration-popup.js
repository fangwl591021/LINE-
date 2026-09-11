// Reuse the existing registration form and save/identity flow; never duplicate member storage.
let activeDialog;
export function openStoreRegistrationPopup({isCurrent=()=>true,standalone=false}={}) {
  const owner=window.currentUserProfile?.userId;
  if(standalone||!owner||!window.liff?.isLoggedIn?.())throw Error('請先登入原系統，再開啟會員註冊');
  if(!isCurrent())return;
  if(activeDialog?.open){activeDialog.querySelector('[data-close]').focus();return;}
  const panel=document.getElementById('details-profile-registration');
  if(!panel||typeof window.saveProfileRegistration!=='function')throw Error('會員註冊表單尚未就緒，請重新開啟商城');
  const info=window.currentUser||{};
  const infoOwner=info.requestedUserId||info.userId||info.lineId||'';
  if(infoOwner&&infoOwner!==owner)throw Error('會員身分正在更新，請稍後重新開啟');
  const opener=document.activeElement,wasOpen=panel.open,slots=[];
  const modal=document.createElement('dialog');modal.className='store-registration-popup';modal.setAttribute('aria-labelledby','store-registration-title');
  modal.innerHTML='<header><h2 id="store-registration-title">會員註冊／資料維護</h2><button type="button" data-close aria-label="關閉會員註冊">×</button></header><div class="store-registration-scroll"><p class="store-registration-note">請確認會員聯絡資料。網購時仍需核對購買人、收件地址及寄送方式，資料不會因開啟此頁而自動儲存。</p><div data-registration-slot></div><details class="store-buyer-bar" data-buyer-bar><summary>網購人資料 <span>填寫／修改 ▾</span></summary><section data-buyer-profile></section></details><p data-registration-status role="status" aria-live="polite"></p></div>';
  document.body.append(modal);activeDialog=modal;
  function move(node,target) {
    if(!node)return;
    const marker=document.createComment('registration-popup-return');
    node.before(marker);slots.push({node,marker});target.append(node);
  }
  move(panel,modal.querySelector('[data-registration-slot]'));
  // Keep the original privacy statement and save/error toast above the native dialog.
  const privacy=document.getElementById('privacy-terms-modal');
  move(privacy,modal);move(document.getElementById('toast-container'),modal);
  const inputs=['name','phone','industry','birthday'];
  const changedOwner=panel.dataset.storeRegistrationOwner&&panel.dataset.storeRegistrationOwner!==owner;
  for(const key of inputs) {
    const input=document.getElementById('profile-'+key);if(!input)continue;
    if(changedOwner){input.value='';delete input.dataset.userTouched;}
    if(input.dataset.userTouched!=='1')input.value=String(info[key]||'').replace(key==='phone'?/[\u200b']/g:/$^/g,'');
  }
  if(changedOwner){const agree=document.getElementById('profile-privacy-agree');if(agree)agree.checked=false;}
  panel.dataset.storeRegistrationOwner=owner;panel.open=true;
  window.prepareRegistrationInputs?.();
  let closed=false,timer;
  const current=()=>!closed&&isCurrent()&&owner===window.currentUserProfile?.userId&&!!window.liff?.isLoggedIn?.();
  function cleanup(){
    if(closed)return;closed=true;clearInterval(timer);
    privacy?.classList.add('hidden');panel.open=wasOpen;
    if(owner!==window.currentUserProfile?.userId||!window.liff?.isLoggedIn?.()){
      for(const key of inputs){const input=document.getElementById('profile-'+key);if(input){input.value='';delete input.dataset.userTouched;}}
      const agree=document.getElementById('profile-privacy-agree');if(agree)agree.checked=false;
    }
    for(const {node,marker} of slots){marker.replaceWith(node);}
    modal.remove();if(activeDialog===modal)activeDialog=null;
    if(isCurrent()&&owner===window.currentUserProfile?.userId&&opener?.isConnected)opener.focus();
  }
  function close(force=false){
    if(!force&&(document.getElementById('btn-save-profile-registration')?.disabled||modal.querySelector('[data-buyer-saving="1"]'))){modal.querySelector('[data-registration-status]').textContent='資料儲存中，請稍候再關閉。';return;}
    modal.close();cleanup();
  }
  modal.querySelector('[data-close]').onclick=()=>close();
  modal.addEventListener('close',cleanup,{once:true});
  modal.addEventListener('cancel',event=>{
    event.preventDefault();
    if(privacy&&!privacy.classList.contains('hidden')){window.closePrivacyTermsModal?.();return;}
    close();
  });
  modal.addEventListener('click',event=>{
    if(!current()){event.preventDefault();event.stopImmediatePropagation();close(true);return;}
    if(event.target===modal){const r=modal.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)close();}
  },true);
  const buyerBar=modal.querySelector('[data-buyer-bar]');let buyerStarted=false;
  buyerBar.addEventListener('toggle',()=>{
    if(!buyerBar.open||buyerStarted||!current())return;
    buyerStarted=true;const host=buyerBar.querySelector('[data-buyer-profile]');host.textContent='載入網購表單…';
    void import('./store-buyer-profile.js?v=2').then(module=>{if(current())module.mountBuyerProfile(host,{base:window.Config?.WORKER_URL||'',isCurrent:current});}).catch(()=>{if(current()){buyerStarted=false;host.textContent='表單載入失敗，請收合後重新展開。';}});
  });
  try{modal.showModal();}catch(error){cleanup();throw error;}
  timer=setInterval(()=>{if(!current())close(true);},200);
}
