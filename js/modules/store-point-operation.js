// Entry UI only: reuse the canonical cashier, identity checks and safe submission.
let activeDialog,activeCurrent,activeClose;
export function openStorePointOperationPopup({standalone=false,isCurrent=()=>true,mode}={}) {
  const owner=window.currentUserProfile?.userId;
  if(standalone||!owner||!window.liff?.isLoggedIn?.())throw Error('請先透過 LINE 登入，再開啟會員點數操作');
  if(!isCurrent())return;
  if(!window.canUseStorePointCashier?.())throw Error('目前帳號沒有會員贈扣點操作權限');
  const rewardOnly=!!window.isRewardOnlyPointCashier?.();
  const authorityRole=String(window.userRole||window.currentUser?.role||'');
  if(mode!==undefined&&!['reward','redeem'].includes(mode))throw Error('無效的點數操作');
  if(rewardOnly&&mode==='redeem')throw Error('贈點用戶不能扣點');
  window.updateStorePointCashierPermissions?.();
  if(activeDialog?.open){
    if(activeCurrent?.()){activeDialog.querySelector('[data-close]').focus();return;}
    activeClose?.(true);
  }
  const panel=document.getElementById('store-point-cashier');
  const body=document.getElementById('store-point-cashier-body');
  const input=document.getElementById('store-point-customer');
  const submit=document.getElementById('btn-store-point-submit');
  if(!panel||!body||!input||!submit||typeof window.resetStorePointCashier!=='function'||typeof window.openStorePointScanner!=='function')throw Error('會員收銀機尚未就緒，請重新開啟商城');
  if(submit.disabled)throw Error('交易處理中，請先確認原交易結果');
  const opener=document.activeElement,slots=[],wasHidden=panel.classList.contains('hidden');
  const modal=document.createElement('dialog');modal.className='store-point-operation';
  modal.setAttribute('aria-labelledby','store-point-operation-title');
  modal.innerHTML='<header><h2 id="store-point-operation-title">會員點數操作</h2><button type="button" data-close aria-label="關閉會員點數操作">×</button></header><div class="store-point-operation-scroll"><div data-choices><p>請選擇確認會員身分的方式。</p><button type="button" data-method="scan">掃描會員錢包 QR</button><button type="button" data-method="phone">輸入行動電話查找</button><small>核對會員、金額及點數後，按確認送出才會贈扣點。</small></div><button type="button" data-back hidden>← 重新選擇會員辨識方式</button><p data-status role="status" aria-live="polite"></p><div data-cashier-slot hidden></div><div data-phone-slot hidden></div></div>';
  if(rewardOnly){
    modal.querySelector('[data-choices] p').textContent='可掃描會員錢包 QR 或輸入手機號碼確認會員；贈點用戶不能扣點。';
    modal.querySelector('[data-choices] small').textContent='電話贈點可直接填寫贈送點數；核對會員後，按確認贈點才會送出。';
  }
  document.body.append(modal);activeDialog=modal;
  const choices=modal.querySelector('[data-choices]'),slot=modal.querySelector('[data-cashier-slot]');
  const back=modal.querySelector('[data-back]'),status=modal.querySelector('[data-status]');
  const scanner=document.getElementById('store-point-scanner-modal');
  const phoneSlot=modal.querySelector('[data-phone-slot]'),title=modal.querySelector('h2');
  let closed=false,timer,observer,phoneForm,choiceRevision=0;
  const current=()=>!closed&&isCurrent()&&owner===window.currentUserProfile?.userId&&authorityRole===String(window.userRole||window.currentUser?.role||'')&&!!window.liff?.isLoggedIn?.()&&!!window.canUseStorePointCashier?.()&&rewardOnly===!!window.isRewardOnlyPointCashier?.();
  function move(node,target){
    if(!node)return;
    const marker=document.createComment('store-point-operation-return');
    node.before(marker);slots.push({node,marker});target.append(node);
  }
  function clearCustomer(){
    window.__storePointLookupRevision=(window.__storePointLookupRevision||0)+1;
    window.closeStorePointScanner?.();
    window.resetStorePointCashier();
  }
  function blocked(){
    if(!submit.disabled&&!phoneForm?.isBusy())return false;
    status.textContent='交易處理中，請稍候確認結果，勿重複送出。';return true;
  }
  function cleanup(){
    if(closed)return;closed=true;choiceRevision++;clearInterval(timer);observer?.disconnect();phoneForm?.dispose();
    if(slots.length){clearCustomer();panel.classList.toggle('hidden',wasHidden);}
    for(const {node,marker} of slots)marker.replaceWith(node);
    modal.remove();if(activeDialog===modal){activeDialog=null;activeCurrent=null;activeClose=null;}
    if(isCurrent()&&owner===window.currentUserProfile?.userId&&opener?.isConnected)opener.focus();
  }
  function close(force=false){if(!force&&blocked())return;modal.close();cleanup();}
  function chooseAgain(){
    if(blocked())return;
    choiceRevision++;phoneForm?.dispose();phoneForm=null;phoneSlot.hidden=true;title.textContent='會員點數操作';
    clearCustomer();choices.hidden=false;back.hidden=true;slot.hidden=true;status.textContent='';
    choices.querySelector('button').focus();
  }
  async function choose(method){
    if(!current()||!['scan','phone'].includes(method))return;
    if(blocked())return;
    const selected=++choiceRevision;
    if(method==='phone'&&mode!=='redeem'){
      try{
        const {mountStorePhoneReward}=await import('./store-phone-reward.js?v=1');
        if(!current()||selected!==choiceRevision)return;
        clearCustomer();phoneForm?.dispose();slot.hidden=true;phoneSlot.hidden=false;
        choices.hidden=true;back.hidden=false;status.textContent='';title.textContent='電話贈點';
        phoneForm=mountStorePhoneReward(phoneSlot,{isCurrent:current,rewardOnly});
      }catch(error){if(current())status.textContent=error.message||'電話贈點尚未就緒，請稍後再試。';}
      return;
    }
    phoneForm?.dispose();phoneForm=null;phoneSlot.hidden=true;title.textContent='會員點數操作';
    if(!slots.length){
      move(panel,slot);move(scanner,modal);move(document.getElementById('toast-container'),modal);
      observer=new MutationObserver(()=>{
        // Existing submit resets/collapses the cashier after success. Keep a next step visible.
        if(current()&&body.classList.contains('hidden')&&!slot.hidden){
          choices.hidden=false;back.hidden=true;
        }
      });
      observer.observe(body,{attributes:true,attributeFilter:['class']});
    }
    clearCustomer();panel.classList.remove('hidden');body.classList.remove('hidden');
    if(mode){
      const radio=panel.querySelector('input[name="store-point-mode"][value="'+mode+'"]');
      if(!radio||radio.disabled){status.textContent='此點數操作未開放';return;}
      radio.checked=true;window.updateStorePointPreview?.();
    }
    const icon=document.getElementById('store-point-cashier-icon');if(icon)icon.textContent='expand_less';
    choices.hidden=true;back.hidden=false;slot.hidden=false;status.textContent='';
    if(method==='scan')void window.openStorePointScanner();
    else input.focus();
  }
  modal.querySelector('[data-close]').onclick=()=>close();back.onclick=chooseAgain;
  choices.querySelectorAll('[data-method]').forEach(button=>button.onclick=()=>choose(button.dataset.method));
  modal.addEventListener('close',cleanup,{once:true});
  modal.addEventListener('cancel',event=>{
    event.preventDefault();
    if(scanner&&!scanner.classList.contains('hidden')){window.closeStorePointScanner?.();return;}
    close();
  });
  modal.addEventListener('click',event=>{
    if(!current()){event.preventDefault();event.stopImmediatePropagation();close(true);return;}
    if(event.target===modal){const r=modal.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)close();}
  },true);
  activeCurrent=current;activeClose=close;
  try{modal.showModal();}catch(error){cleanup();throw error;}
  timer=setInterval(()=>{if(!current())close(true);},200);
}
