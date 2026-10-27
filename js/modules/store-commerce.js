// Loaded only after opening online checkout/settings/orders, never on login.
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=c=>'NT$ '+(Number(c)/100).toLocaleString('zh-TW');
const paymentText={pending:'待匯款',reported:'已回報／待核帳',paid:'已收款',cancelled:'已取消'};
const shippingText={unfulfilled:'未出貨',shipped:'已出貨',completed:'已完成'};
const carrierText={POST:'中華郵政',FAMILY:'全家店到店',SEVEN:'7-11 店到店',PICKUP:'到店取貨'};
const pickupOrder=o=>o.snapshot?.customer?.carrier==='PICKUP';
const fulfillmentText=o=>pickupOrder(o)?({unfulfilled:'待備貨',shipped:'待取貨',completed:'已取貨'}[o.fulfillment_status]||o.fulfillment_status):(shippingText[o.fulfillment_status]||o.fulfillment_status);
const pointText={none:'未使用點數',pending:'扣點處理中',debited:'已扣點',failed:'未扣點／訂單已取消',unknown:'扣點結果待查核',refunding:'退點處理中',refunded:'已退點',refund_unknown:'退點結果待查核'};
const field=(name,label,value='',type='text',max=200,attrs='')=>`<label>${label}<input name="${name}" type="${type}" value="${esc(value)}" maxlength="${max}" ${attrs} ${type==='number'?'min="0" step="0.01"':''}></label>`;
function receipt(s) {
  const pickup=s.customer?.carrier==='PICKUP';
  return `<h3>${esc(s.shop_name)}</h3>${s.items.map(i=>`<p>${esc(i.title)} × ${i.quantity}　${money(i.line_total_cents)}${!pickup&&i.shipping_fee_cents!=null?`<br>本商品運費 ${money(i.shipping_fee_cents)} × ${i.quantity} = ${money(i.line_shipping_fee_cents)}`:''}</p>`).join('')}${pickup?'<p>到店取貨，運費 NT$ 0。</p>':s.items.some(i=>Object.hasOwn(i,'shipping_fee_cents')&&i.shipping_fee_cents==null)?`<p>未獨立設定商品：沿用舊店家運費 ${money(s.legacy_shipping_fee_cents||0)}（本單計一次）</p>`:''}<p>商品 ${money(s.subtotal_cents)}／運費 ${money(s.shipping_fee_cents)}${s.points_used?`<br>購物金折抵 ${esc(s.points_used)} 點（${money(s.points_used*100)}）`:''}<br><strong>應匯款 ${money(s.total_cents)}</strong>${s.total_cents===0?'（無須匯款）':''}</p>`;
}
const deliveryAddress=c=>[c.postal_code,c.city,c.district,c.address].filter(Boolean).join(' ');
const deliverySummary=c=>`${esc(carrierText[c.carrier]||c.carrier)}：${esc(c.carrier==='POST'?deliveryAddress(c):c.store_info)}`;
function buyerDetails(s){return s.buyer?`<p>購買人：${esc(s.buyer.name)}<br>手機：${esc(s.buyer.phone)}${s.buyer.email?`<br>Email：${esc(s.buyer.email)}`:''}</p>`:'';}
function bank(s) {return `<p>收款店家：${esc(s.shop_name)}<br>${esc(s.bank.name)}（${esc(s.bank.code)}）<br>戶名：${esc(s.bank.holder)}<br>帳號：${esc(s.bank.account)}</p>`;}
export async function mountCommerce(host,{base,mode,shop,products=[],selectedProductId='',isCurrent}) {
  products=products.filter(p=>p.shop_id===shop?.id&&p.purchase_mode==='online'&&p.status==='active'&&(!selectedProductId||p.id===selectedProductId));
  const token=window.liff?.isLoggedIn?.()?window.liff.getAccessToken():'';
  if(!token)throw new Error('請從 LINE 登入後的店家商城開啟線上購物');
  const current=()=>isCurrent()&&host.isConnected&&window.liff?.getAccessToken?.()===token;
  if(!document.getElementById('store-commerce-css')){
    const link=document.createElement('link');link.id='store-commerce-css';link.rel='stylesheet';link.href=new URL('../../css/store-commerce.css?v=1',import.meta.url).href;document.head.append(link);
  }
  host.innerHTML='<button type="button" data-do="manage">返回商城管理</button><section class="commerce-panel"><p role="status">載入線上商城…</p></section>';
  if(mode!=='merchant'){host.querySelector('button').dataset.do='list';host.querySelector('button').textContent='返回店家列表';}
  const panel=host.querySelector('.commerce-panel');let busy=false,epoch=0,config,quoted,input,orders=[],page=0,sameRecipient=true,savedBuyerProfile=null,pointsEnabled=false,placedView=false;
  function paint(html){if(current())panel.innerHTML=`<p class="shop-notice">各店自行收款。${pointsEnabled?'購物金依商品上限折抵，運費不折抵；':'本次未開放線上點數折抵；'}剩餘款項以匯款支付。LINE Pay、自動現金退款與物流串接尚未開放。</p><p class="commerce-error" role="alert"></p>${html}`;}
  function error(e){if(current()){const el=panel.querySelector('.commerce-error');if(el){el.textContent=e.message;el.scrollIntoView({block:'center'});}}}
  const steps=active=>`<ol class="commerce-steps" aria-label="購買流程">${['選購／收件','核對後下單扣點','匯款／回報','店家核帳出貨'].map((s,i)=>`<li ${i===active?'aria-current="step"':''}>${i+1}. ${s}</li>`).join('')}</ol>`;
  function reveal(selector){panel.querySelector(selector)?.scrollIntoView({behavior:'smooth',block:'start'});}
  async function api(path,data) {
    if(!current())throw new Error('登入身分或頁面已改變，請重新開啟');
    const response=await fetch(`${base}/v1/store-commerce${path}`,{method:data?'POST':'GET',headers:{Authorization:`Bearer ${token}`,...(data?{'Content-Type':'application/json'}:{})},body:data?JSON.stringify(data):undefined,signal:AbortSignal.timeout(15000)});
    const result=await response.json();if(!current())throw new Error('登入身分或頁面已改變，請重新開啟');
    if(!response.ok||!result.success){const error=new Error(result.error||'線上商城暫時無法使用');error.status=response.status;throw error;}return result;
  }
  async function run(job) {
    if(busy)return;busy=true;const controls=[...panel.querySelectorAll('button,input,select')],disabled=controls.map(c=>c.disabled);controls.forEach(c=>c.disabled=true);
    try{await job();}catch(e){error(e);}finally{busy=false;controls.forEach((c,i)=>c.disabled=disabled[i]);panel.querySelector('[data-commerce-form="quote"]')?.dispatchEvent(new Event('input'));}
  }
  function settingsForm(result) {
    config=result.settings;
    paint(`<nav class="shop-row"><button data-commerce="settings">收款／寄送設定</button><button data-commerce="orders">網路訂單</button></nav><h2>本店收款與寄送</h2>${result.release_enabled?'':'<p class="shop-notice">系統尚未開放線上交易。可先儲存設定，不會開始收款。</p>'}<form data-commerce-form="settings" class="shop-box"><label>開放匯款下單<select name="enabled"><option value="false">關閉</option><option value="true" ${config.enabled?'selected':''}>開啟（仍受系統開關限制）</option></select></label>${field('bank_name','銀行名稱',config.bank_name,'text',60)}${field('bank_code','銀行代碼（三碼）',config.bank_code,'text',3)}${field('bank_holder','收款戶名',config.bank_holder,'text',80)}${field('bank_account','本店銀行帳號',config.bank_account,'text',24)}${field('fee','舊商品備援運費（每筆元；僅未獨立設定商品）',config.shipping_fee_cents/100,'number')}${field('free','舊商品備援免運門檻（元；0 不設定）',config.free_shipping_cents/100,'number')}<p>各商品運費請到「編輯商品 → 單件運費」分別設定；已設定的商品不使用這裡的舊備援運費／門檻。</p><p>支援郵寄地址或手填超商門市。收款資料會保存於新訂單，修改設定不改變舊訂單的收款帳號。</p><button class="primary">儲存本店設定</button></form>`);
  }
  async function listOrders(next=0) {
    placedView=false;
    if(mode!=='merchant') {
      const profile=await window.liff.getProfile();if(!current())return;
      const pendingStorage='store-commerce-pending:'+profile.userId;
      const pending=JSON.parse(localStorage.getItem(pendingStorage)||'null');
      if(pending){const recovered=await api('/orders/lookup?request_key='+encodeURIComponent(pending.id));if(recovered.order)localStorage.removeItem(pendingStorage);}
    }
    const serial=++epoch;const result=await api(`/orders?scope=${mode==='merchant'?'merchant':'buyer'}&page=${next}`);if(serial!==epoch||!current())return;
    orders=result.orders;page=next;
    paint(`${mode==='merchant'?'<button data-commerce="settings">返回收款設定</button>':''}<h2>${mode==='merchant'?'本店網路訂單':'我的網路訂單'}</h2><button data-commerce="orders">重新整理</button><div class="shop-sales-list">${orders.map((o,i)=>`<section class="shop-sale-row"><div class="shop-sale-heading"><strong>${esc(o.snapshot.shop_name)}</strong><span>${esc(paymentText[o.payment_status])}／${esc(fulfillmentText(o))}</span></div><p>購買者：${esc(o.snapshot.buyer_name||'未提供姓名')}<br>收件人：${esc(o.snapshot.customer.name)}　${money(o.total_cents)}${o.snapshot.points_used?`<br>購物金：${esc(pointText[o.points_status]||'結果待查核')}`:''}</p><time>${esc(new Date(o.created_at).toLocaleString('zh-TW'))}</time><details><summary>訂單內容與處理</summary>${receipt(o.snapshot)}${buyerDetails(o.snapshot)}<p>訂單：${esc(o.id)}<br>電話：${esc(o.snapshot.customer.phone)}<br>${esc(carrierText[o.snapshot.customer.carrier])}：${esc(o.snapshot.customer.carrier==='POST'?deliveryAddress(o.snapshot.customer):o.snapshot.customer.store_info)}<br>備註：${esc(o.snapshot.customer.note)}</p>${(!o.snapshot.points_used||o.points_status==='debited')&&o.total_cents>0?bank(o.snapshot):''}${o.remittance_last5?`<p>回報末五碼：${esc(o.remittance_last5)}</p>`:''}${o.tracking_number?`<p>物流編號：${esc(o.tracking_number)}</p>`:''}${actionForm(o,i)}</details></section>`).join('')||'<p>目前沒有訂單。</p>'}</div><div class="shop-row">${page?'<button data-commerce="prev">上一頁</button>':''}${result.has_more?'<button data-commerce="next">下一頁</button>':''}</div>`);
  }
  function actionForm(o,index) {
    if(!['none','debited'].includes(o.points_status||'none'))return `<p>購物金：${esc(pointText[o.points_status]||'結果待查核')}。請查核原訂單，不要再次付款、扣點或退點。</p>${['pending','unknown','refunding','refund_unknown'].includes(o.points_status)?`<button data-commerce="reconcile" data-index="${index}">查核原交易結果（不重新扣點）</button>`:''}`;
    let action='',html='',label='';
    if(mode==='merchant') {
      if(o.payment_status==='reported'){action='verify_remittance';html=field('received','實際入帳金額（元）','','number')+'<label><input type="checkbox" name="confirmed" required>我已查核銀行入帳，不是僅依買家截圖或末五碼認定。</label>';label='確認收款';}
      else if(o.payment_status==='paid'&&o.fulfillment_status==='unfulfilled'){action='ship';html=pickupOrder(o)?'<p>商品備妥後才確認可取貨，不代表買家已領取。</p>':field('tracking_number','物流編號','','text',100);label=pickupOrder(o)?'確認備貨完成／可取貨':'確認已出貨';}
      else if(o.payment_status==='paid'&&o.fulfillment_status==='shipped'){action='complete';html=pickupOrder(o)?'<label><input type="checkbox" name="confirmed_pickup" required>我已核對訂單與領取人，商品確實交付完成。</label>':'';label=pickupOrder(o)?'確認已取貨':'標記完成';}
    } else if(['pending','reported'].includes(o.payment_status)){action='report_remittance';html=field('last5','匯款帳號末五碼',o.remittance_last5,'text',5);label='回報匯款（不代表已核帳）';}
    return `${action?`<form data-commerce-form="action" data-index="${index}" data-action="${action}" data-key="${crypto.randomUUID()}">${html}<button class="primary">${label}</button></form>`:''}${mode!=='merchant'&&o.payment_status==='pending'?`<button data-commerce="cancel" data-index="${index}">取消未付款訂單${o.points_status==='debited'?'並退點':''}</button>`:''}${mode==='merchant'&&o.points_status==='debited'&&o.payment_status==='paid'&&o.fulfillment_status==='unfulfilled'?`<form data-commerce-form="action" data-index="${index}" data-action="refund" data-key="${crypto.randomUUID()}"><p>平台不執行銀行退款。請先自行退還 ${money(o.received_cents)}，才可取消本筆並退回 ${esc(o.snapshot.points_used)} 點。</p><label><input type="checkbox" name="confirmed" required>我已退還全部款項，確認取消並退點</label><button>確認退款完成並退點</button></form>`:''}`;
  }
  function checkoutForm() {
    placedView=false;quoted=null;
    if(!products.length){paint(`<h2>${selectedProductId?'所選商品未開放網購':'本店目前沒有網購商品'}</h2><p>沒有改選其他商品，也沒有建立訂單或扣點。請返回店家確認商品銷售方式。</p>`);return;}
    const items=products.map(p=>`<div class="commerce-product"><strong>${esc(p.title)}</strong><p>單價 ${money(p.price_cents)} · ${esc(p.redeem_type==='percent'?`最高折抵 ${p.redeem_value}%`:p.redeem_type==='fixed'?`最多折抵 ${p.redeem_value} 點`:p.redeem_type==='full'?'可全額折抵':'不提供點數折抵')}</p><p class="commerce-shipping">${p.shipping_fee_cents==null?'運費：尚未獨立設定，依舊店家規則於報價核對':p.shipping_fee_cents===0?'運費：免運':`單件運費 ${money(p.shipping_fee_cents)}（按數量加總）`}</p><label>購買數量<input type="number" name="qty-${esc(p.id)}" min="${selectedProductId?'1':'0'}" max="99" step="1" value="${selectedProductId?'1':'0'}" aria-label="${esc(p.title)}數量" required></label></div>`).join('');
    const points=pointsEnabled?`<section class="commerce-stage"><h3>2. 購物金折抵</h3><p>1 點折抵 NT$1，依商品上限計算，運費不折抵。此處只試算，最後確認下單才扣點。</p><button type="button" data-commerce="wallet">查詢本人可用購物金</button><p data-wallet-status role="status"></p><label>本次折抵點數<input name="points_used" type="number" inputmode="numeric" min="0" max="1000000" step="1" value="${esc(input?.points_used||0)}" required></label></section>`:'<section class="commerce-stage"><h3>2. 購物金折抵</h3><p>目前未開放，本筆不扣點。</p></section>';
    paint(`<h2>${esc(shop.name)}・線上購買</h2>${steps(0)}<form data-commerce-form="quote"><fieldset data-checkout-fields><legend>購買資料</legend><section class="commerce-stage"><h3>1. ${selectedProductId?'已選商品':'選擇網購商品與數量'}</h3>${items}<p class="shop-meta">${selectedProductId?'只購買以上商品，不會加入同店其他商品。':'數量為 0 不購買；請先選商品，往下完成結帳。'}</p></section>${points}<section class="commerce-stage"><h3>3. 購買人與寄送方式</h3><button type="button" data-commerce="load-buyer">帶入已儲存網購人資料</button><p class="shop-meta">可至「我的 → 會員註冊 → 網購人資料」儲存常用資料；此處也可直接填寫。</p>${field('buyer_name','購買人姓名 *','','text',80,'required autocomplete="name"')}${field('buyer_phone','購買人手機 *','','tel',30,'required autocomplete="tel"')}${field('buyer_email','Email（選填）','','email',254,'autocomplete="email"')}<h4>收件人資料</h4><label class="commerce-check"><input type="checkbox" name="same_recipient" checked>收件人同購買人</label>${field('name','收件人姓名 *','','text',80,'required')}${field('phone','收件人手機 *','','tel',30,'required')}<label>寄送方式<select name="carrier"><option value="POST">中華郵政</option><option value="FAMILY">全家店到店（手填門市）</option><option value="SEVEN">7-11 店到店（手填門市）</option>${shop.pickup_enabled===1||shop.cooperation_plan?.canPickup===true?'<option value="PICKUP">到店取貨（免運）</option>':''}</select></label>${field('postal_code','郵遞區號（選填）','','text',6,'inputmode="numeric" autocomplete="postal-code"')}${field('city','縣市 *','','text',20,'required autocomplete="address-level1"')}${field('district','區域／鄉鎮市 *','','text',20,'required autocomplete="address-level2"')}${field('address','路名、巷弄、門牌、樓層 *','','text',200,'required autocomplete="street-address"')}${field('store_info','超商店號、店名與地址（超商寄送必填）','','text',120)}${field('note','訂單備註','','text',300)}</section></fieldset><button type="submit" class="primary">下一步：核對折抵、運費與應付金額</button><p>運費依各商品設定與數量加總，於下一步確認；尚未下單、不會扣點。</p></form><section data-checkout-review aria-live="polite"></section>`);
    const form=panel.querySelector('form');
    form.elements.carrier.closest('label').insertAdjacentHTML('afterend',`<p data-pickup-info hidden>到店取貨免運；請於店家確認備貨完成後前往。<br>取貨店家：${esc(shop.name)}<br>地址：${esc(shop.address||'店家尚未提供，請先聯絡店家')}<br>電話：${esc(shop.phone||'尚未提供')}</p>`);
    if(input){for(const [key,value] of Object.entries(input.customer))if(form.elements[key])form.elements[key].value=value;for(const [key,value] of Object.entries(input.buyer))form.elements['buyer_'+key].value=value;for(const item of input.items)if(form.elements['qty-'+item.id])form.elements['qty-'+item.id].value=item.quantity;}
    form.elements.same_recipient.checked=sameRecipient;
    const sync=()=>{
      const f=form.elements,same=f.same_recipient.checked,post=f.carrier.value==='POST',storeDelivery=['FAMILY','SEVEN'].includes(f.carrier.value);
      for(const key of ['name','phone']){f[key].disabled=same;if(same)f[key].value=f['buyer_'+key].value;}
      for(const key of ['postal_code','city','district','address']){f[key].closest('label').hidden=!post;f[key].disabled=!post;f[key].required=post&&key!=='postal_code';}
      f.store_info.closest('label').hidden=!storeDelivery;f.store_info.disabled=!storeDelivery;f.store_info.required=storeDelivery;
      form.querySelector('[data-pickup-info]').hidden=f.carrier.value!=='PICKUP';
      form.querySelector('[data-checkout-fields]').disabled=!!quoted;
      form.querySelector('[type="submit"]').hidden=!!quoted;
    };
    form.oninput=sync;form.onchange=event=>{
      if(event.target.name==='carrier')form.elements.store_info.value='';
      if(event.target.name==='same_recipient'&&form.elements.same_recipient.checked)copyBuyerAddress(form,true);
      if(event.target.name==='carrier'&&form.elements.same_recipient.checked)copyBuyerAddress(form);
      sync();
    };sync();
  }
  function copyBuyerAddress(form,applyCarrier=false){
    if(!savedBuyerProfile||!form.elements.same_recipient.checked)return;
    const f=form.elements,carrier=savedBuyerProfile.carrier||'POST';
    if(applyCarrier)f.carrier.value=carrier;
    if(f.carrier.value==='POST')for(const key of ['postal_code','city','district','address'])f[key].value=savedBuyerProfile[key]||'';
    else if(f.carrier.value===carrier)f.store_info.value=savedBuyerProfile.store_info||'';
  }
  function showPlaced(o){
    placedView=true;orders=[o];
    const ready=['none','debited'].includes(o.points_status||'none');
    const title=!ready?'訂單購物金結果待確認':o.payment_status==='reported'?'匯款回報已送出，待店家核帳':o.payment_status==='paid'?(pickupOrder(o)?'訂單已付款，待店家備貨':'訂單已付款，待店家出貨'):'訂單已建立，尚未匯款';
    paint(`${steps(ready?o.payment_status==='pending'?2:3:1)}<h2>${title}</h2><p>${!ready?'請查核原交易，不要另建訂單、再次扣點或匯款。':o.payment_status==='reported'?'末五碼回報不代表已收款；店家核對銀行入帳後才會確認付款並安排出貨。':o.payment_status==='paid'?'本筆已確認付款，未表示商品已送達或交易完成。':o.total_cents===0?'本筆無須匯款，請等候訂單查核。':'請依下列應匯款金額與帳號匯款一次，再往下回報末五碼。'}</p><p>訂單：${esc(o.id)}</p><section class="commerce-stage"><h3>4. 訂單與折抵結果</h3>${receipt(o.snapshot)}<p>購物金：${esc(pointText[o.points_status||'none']||'結果待查核')}</p>${buyerDetails(o.snapshot)}<p>收件人：${esc(o.snapshot.customer.name)}<br>${esc(o.snapshot.customer.phone)}<br>${esc(carrierText[o.snapshot.customer.carrier])}：${esc(o.snapshot.customer.carrier==='POST'?deliveryAddress(o.snapshot.customer):o.snapshot.customer.store_info)}</p></section>${ready&&o.total_cents>0?`<section class="commerce-stage"><h3>5. ${o.payment_status==='reported'?'已回報，等候核帳':'匯款與回報'}</h3>${bank(o.snapshot)}${o.remittance_last5?`<p>已回報末五碼：${esc(o.remittance_last5)}</p>`:''}${actionForm(o,0)}</section>`:actionForm(o,0)}<button data-commerce="orders">我的網路訂單／查核結果</button>`);
    reveal('h2');
  }
  // Persist only an unresolved request ID + payload hash, never contact/bank data.
  async function pendingKey(payload) {
    const profile=await window.liff.getProfile();if(!current())throw new Error('登入已改變');
    const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(payload)));
    const fingerprint=[...new Uint8Array(digest)].map(v=>v.toString(16).padStart(2,'0')).join('');
    const key='store-commerce-pending:'+profile.userId,previous=JSON.parse(localStorage.getItem(key)||'null');
    if(previous&&previous.hash!==fingerprint)throw new Error('有一筆下單結果尚未確認，請先查詢「我的網路訂單」，勿另建訂單。');
    const value=previous||{id:crypto.randomUUID(),hash:fingerprint};localStorage.setItem(key,JSON.stringify(value));
    if(localStorage.getItem(key)!==JSON.stringify(value))throw new Error('無法保存下單編號，本次未送出');return {key,id:value.id};
  }
  panel.onclick=event=>{
    event.stopPropagation();const button=event.target.closest('[data-commerce]');if(!button)return;
    void run(async()=>{
      const command=button.dataset.commerce;
      if(command==='wallet'){const result=await api('/wallet');panel.querySelector('[data-wallet-status]').textContent=`目前可用購物金 ${Math.max(0,result.balance).toLocaleString('zh-TW')} 點，實際下單仍會重新查核。`;}
      if(command==='load-buyer'){
        const form=panel.querySelector('[data-commerce-form="quote"]');
        const result=await api('/buyer-profile');
        if(!form?.isConnected||!current())return;
        if(!result.profile)throw Error('尚未儲存網購人資料，請先至「我的 → 會員註冊」填寫。');
        savedBuyerProfile=result.profile;
        for(const key of ['name','phone','email'])form.elements['buyer_'+key].value=savedBuyerProfile[key]||'';
        copyBuyerAddress(form,true);form.dispatchEvent(new Event('input'));
        panel.querySelector('.commerce-error').textContent='已帶入本人網購資料，請核對收件人、寄送方式與門市／地址；本次沒有建立訂單。';
      }
      if(command==='settings')settingsForm(await api('/settings'));
      if(command==='orders')await listOrders(0);
      if(command==='reconcile'){const o=orders[Number(button.dataset.index)];await api('/orders/reconcile',{order_id:o.id,scope:mode==='merchant'?'merchant':'buyer'});await listOrders(page);}
      if(command==='prev')await listOrders(page-1);
      if(command==='next')await listOrders(page+1);
      if(command==='edit'){checkoutForm();reveal('[data-commerce-form="quote"]');}
      if(command==='cancel'){
        const o=orders[Number(button.dataset.index)];if(!window.confirm('確認尚未匯款，並取消這筆訂單？若已匯款請聯絡店家。'))return;
        await api('/orders/action',{action:'cancel',order_id:o.id,version:o.version,request_key:crypto.randomUUID()});await listOrders(page);
      }
      if(command==='place'){
        if(!quoted?.quote_hash||!input)throw Error('請先重新核對訂單金額');
        if(!panel.querySelector('[name="confirm_order"]')?.checked)throw Error('請先勾選確認商品、折抵點數、運費與應付金額');
        const pending=await pendingKey(input);
        let result;
        try{result=await api('/orders',{...input,quote_hash:quoted.quote_hash,request_key:pending.id});}
        catch(e){
          // Only an explicit validation rejection AND an empty scoped lookup
          // permit a fresh form. Network/5xx ambiguity must retain the old ID.
          if([400,409,413].includes(e.status)){
            const found=await api('/orders/lookup?request_key='+encodeURIComponent(pending.id));
            if(!found.order)localStorage.removeItem(pending.key);
          }
          throw e;
        }
        showPlaced(result.order);
        localStorage.removeItem(pending.key);
      }
    });
  };
  panel.onsubmit=event=>{
    event.preventDefault();event.stopPropagation();const form=event.target;const values=Object.fromEntries(new FormData(form));
    void run(async()=>{
      const type=form.dataset.commerceForm;
      if(type==='settings'){
        const result=await api('/settings',{version:config.version,enabled:values.enabled==='true',bank_name:values.bank_name,bank_code:values.bank_code,bank_account:values.bank_account,bank_holder:values.bank_holder,shipping_fee_cents:Math.round(Number(values.fee)*100),free_shipping_cents:Math.round(Number(values.free)*100)});settingsForm(result);
        panel.querySelector('.commerce-error').textContent='設定已儲存。未執行付款或扣點。';
      }
      if(type==='quote'){
        if(quoted)throw Error('訂單已報價，請先按返回修改');
        sameRecipient=values.same_recipient==='on';
        input={shop_id:shop.id,payment_method:'REMITTANCE',points_used:pointsEnabled?Number(values.points_used):0,items:products.map(p=>({id:p.id,quantity:Number(values['qty-'+p.id])})).filter(p=>p.quantity!==0),buyer:{name:values.buyer_name,phone:values.buyer_phone,email:values.buyer_email},customer:{name:sameRecipient?values.buyer_name:values.name,phone:sameRecipient?values.buyer_phone:values.phone,carrier:values.carrier,postal_code:values.postal_code||'',city:values.city||'',district:values.district||'',address:values.address||'',store_info:values.store_info||'',note:values.note}};
        quoted=await api('/quote',input);
        panel.querySelector('[data-checkout-review]').innerHTML=`<section class="commerce-stage"><h2>4. 請確認訂單</h2>${receipt(quoted.snapshot)}${buyerDetails(quoted.snapshot)}<p>收件人：${esc(input.customer.name)}<br>${esc(input.customer.phone)}<br>${deliverySummary(quoted.snapshot.customer)}</p><p>款項直接付給 ${esc(quoted.snapshot.bank.holder)}，平台不代收。建立訂單後才顯示匯款帳號。${input.points_used?'確認下單時扣點；取消未回報匯款的訂單才可自動退點。':''}</p><label class="commerce-check"><input type="checkbox" name="confirm_order">我已核對商品、折抵點數、運費與應匯款金額</label><button type="button" data-commerce="place" class="primary">${input.points_used?`確認下單並扣除 ${esc(input.points_used)} 點`:'確認建立匯款訂單'}</button><button type="button" data-commerce="edit">返回修改</button></section>`;
        panel.querySelectorAll('.commerce-steps li').forEach((el,i)=>i===1?el.setAttribute('aria-current','step'):el.removeAttribute('aria-current'));
        reveal('[data-checkout-review]');
      }
      if(type==='action'){
        const o=orders[Number(form.dataset.index)],action=form.dataset.action;
        const result=await api('/orders/action',{action,order_id:o.id,version:o.version,request_key:form.dataset.key,...(action==='report_remittance'?{last5:values.last5}:{}),...(action==='ship'?{tracking_number:values.tracking_number||''}:{}),...(action==='complete'&&pickupOrder(o)?{confirmed_pickup:values.confirmed_pickup==='on'}:{}),...(action==='verify_remittance'?{received_cents:Math.round(Number(values.received)*100),confirmed:values.confirmed==='on'}:{}),...(action==='refund'?{returned_cash_cents:o.received_cents,confirmed:values.confirmed==='on'}:{})});
        if(placedView&&action==='report_remittance')showPlaced(result.order);else await listOrders(page);
      }
    });
  };
  paint('<p role="status">驗證線上商城設定…</p>');
  try {
    const capability=await api('/capabilities');pointsEnabled=capability.points_enabled===true;
    if(mode==='merchant')settingsForm(await api('/settings'));
    else if(mode==='orders')await listOrders();
    else {if(capability.enabled)checkoutForm();else paint('<h2>線上交易準備中</h2><p>目前不會建立訂單或扣點，原有商品 QR 折抵不受影響。</p>');}
  }catch(e){error(e);}
}
