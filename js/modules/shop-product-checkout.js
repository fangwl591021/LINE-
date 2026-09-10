const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export async function mountProductCheckout(root,productId,isActive=()=>true,qrToken='') {
 root.innerHTML='<p role="status">確認商品與店家權限…</p>';
 const response=qrToken?await window.callSafeCashier('resolveStoreMemberProductQr',{qrToken}):await window.callSafeCashier('getStoreShopRedemptionProduct',{productId});
 if(!isActive())return;
 if(!response?.success){root.textContent=response?.error||'無法取得商品';return;}
 const p=response.data;
 root.innerHTML=`<section class="shop-checkout shop-box"><h2>${esc(p.title)}</h2><p>${esc(p.shopName)}｜NT$ ${p.amount.toLocaleString('zh-TW')}</p><p>使用共用購物金點數，1 點折抵 1 元；本商品最多折抵 ${p.maxPoints} 點。</p><p>掃碼不會扣點，請核對顧客後輸入本次折抵點數。</p><button type="button" class="scan">掃描顧客點數 QR</button><input class="qr-file" type="file" accept="image/*" capture="environment" hidden><label>顧客點數識別碼<input class="customer" autocomplete="off" maxlength="100" placeholder="掃描或貼上顧客點數 UID"></label><button type="button" class="lookup">確認顧客</button><p class="customer-info"></p><form><label>本次折抵點數<input name="points" type="number" min="1" max="${p.maxPoints}" step="1" required></label><button class="primary" ${p.maxPoints<=0?'disabled':''}>確認扣抵</button></form><button type="button" class="check">查詢待確認交易</button><p role="status" class="checkout-result"></p></section>`;
 let customer=null,busy=false,revision=0;
 const input=root.querySelector('.customer'),info=root.querySelector('.customer-info'),result=root.querySelector('.checkout-result');
 const show=e=>{result.textContent=e.message||String(e);};
 const lookup=async()=>{
  customer=null;const ticket=++revision,raw=String(input.value).trim();
  if(!/^U[0-9a-fA-F]{20,64}$/.test(raw))throw Error('請掃描或貼上有效的顧客點數 QR 識別碼');
  info.textContent='查詢共用點數中…';
  const res=await window.callSafeCashier('getStorePointCustomer',{customerUserId:raw});
  if(ticket!==revision||!input.isConnected)return;
  const c=res?.data;
  if(!res?.success||!c?.customerPointUserId||c.needsBinding||c.canAdjust===false||c.balance===null||c.balance===undefined||!Number.isFinite(Number(c.balance))){info.textContent='';throw Error(res?.error||c?.message||'無法確認顧客共用點數，請先完成點數會員綁定');}
  customer=c;info.textContent=`顧客：${c.name||'未命名會員'}｜可用 ${Number(c.balance).toLocaleString('zh-TW')} 點`;
 };
 input.oninput=()=>{++revision;customer=null;info.textContent='請重新確認顧客';};
 root.querySelector('.lookup').onclick=()=>{if(!busy)void lookup().catch(show);};
 const file=root.querySelector('.qr-file');root.querySelector('.scan').onclick=()=>file.click();
 file.onchange=async()=>{if(!file.files?.[0]||busy)return;try{const raw=await window.decodeStorePointQrFile(file.files[0]);input.value=window.extractPointCustomerId(raw);await lookup();}catch(e){show(e);}finally{file.value='';}};
 root.querySelector('.check').onclick=async()=>{const r=await window.checkPendingCashier();result.textContent=r.displayMessage||r.error||'請查看收銀紀錄';if(r.success){customer=null;input.value='';info.textContent='已完成，下一筆請重新確認顧客。';root.querySelector('form').reset();}};
 root.querySelector('form').onsubmit=async event=>{
  event.preventDefault();if(busy)return;
  const points=Number(new FormData(event.currentTarget).get('points'));
  if(!customer)return show(Error('請先確認顧客'));
  if(!Number.isSafeInteger(points)||points<=0||points>p.maxPoints||points>Number(customer.balance))return show(Error('折抵點數超過商品上限、可用餘額或格式不正確'));
  if(!window.confirm(`確認 ${customer.name||'此顧客'} 購買「${p.title}」\n扣除 ${points} 點，應收 NT$ ${(p.amount-points).toLocaleString('zh-TW')}？`))return;
  busy=true;const buttons=[...root.querySelectorAll('button,input')],disabled=buttons.map(b=>b.disabled);buttons.forEach(b=>b.disabled=true);result.textContent='處理中，請勿關閉或重複送出…';
  try{
   const r=await window.submitSafeCashier({customerUserId:customer.customerPointUserId,amount:p.amount,deductPoints:points,mode:'redeem',productId:p.productId,productVersion:p.productVersion,shopVersion:p.shopVersion,...(qrToken?{qrToken}:{})});
   result.textContent=`已完成折抵 ${r.data.changedPoints} 點，應收 NT$ ${r.data.payableAmount}。\n交易編號：${r.transactionId}`;
   customer=null;info.textContent='本筆已完成；下一筆請重新掃描顧客。';input.value='';event.target.reset();
  }catch(e){show(e);}finally{busy=false;buttons.forEach((b,i)=>b.disabled=disabled[i]);}
 };
 if(qrToken) {
  input.closest('label').hidden=true;
  root.querySelector('.scan').hidden=true;root.querySelector('.lookup').hidden=true;
  input.value=p.customerUserId;
  try{await lookup();}catch(e){show(e);}
 }
}
