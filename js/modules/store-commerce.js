// Loaded only after opening online checkout/settings/orders, never on login.
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=c=>'NT$ '+(Number(c)/100).toLocaleString('zh-TW');
const paymentText={pending:'待匯款',reported:'已回報／待核帳',paid:'已收款',cancelled:'已取消'};
const shippingText={unfulfilled:'未出貨',shipped:'已出貨',completed:'已完成'};
const carrierText={POST:'中華郵政',FAMILY:'全家',SEVEN:'7-11'};
const field=(name,label,value='',type='text',max=200,attrs='')=>`<label>${label}<input name="${name}" type="${type}" value="${esc(value)}" maxlength="${max}" ${attrs} ${type==='number'?'min="0" step="0.01"':''}></label>`;
function receipt(s) {
  return `<h3>${esc(s.shop_name)}</h3>${s.items.map(i=>`<p>${esc(i.title)} × ${i.quantity}　${money(i.line_total_cents)}</p>`).join('')}<p>商品 ${money(s.subtotal_cents)}／運費 ${money(s.shipping_fee_cents)}<br><strong>應匯款 ${money(s.total_cents)}</strong>（本筆不折抵點數）</p>`;
}
const deliveryAddress=c=>[c.postal_code,c.city,c.district,c.address].filter(Boolean).join(' ');
function buyerDetails(s){return s.buyer?`<p>購買人：${esc(s.buyer.name)}<br>手機：${esc(s.buyer.phone)}${s.buyer.email?`<br>Email：${esc(s.buyer.email)}`:''}</p>`:'';}
function bank(s) {return `<p>收款店家：${esc(s.shop_name)}<br>${esc(s.bank.name)}（${esc(s.bank.code)}）<br>戶名：${esc(s.bank.holder)}<br>帳號：${esc(s.bank.account)}</p>`;}
export async function mountCommerce(host,{base,mode,shop,products=[],isCurrent}) {
  products=products.filter(p=>p.purchase_mode==='online'&&p.status==='active');
  const token=window.liff?.isLoggedIn?.()?window.liff.getAccessToken():'';
  if(!token)throw new Error('請從 LINE 登入後的店家商城開啟線上購物');
  const current=()=>isCurrent()&&host.isConnected&&window.liff?.getAccessToken?.()===token;
  host.innerHTML='<button type="button" data-do="manage">返回商城管理</button><section class="commerce-panel"><p role="status">載入線上商城…</p></section>';
  if(mode!=='merchant'){host.querySelector('button').dataset.do='list';host.querySelector('button').textContent='返回店家列表';}
  const panel=host.querySelector('.commerce-panel');let busy=false,epoch=0,config,quoted,input,orders=[],page=0,sameRecipient=true,savedBuyerProfile=null;
  function paint(html){if(current())panel.innerHTML=`<p class="shop-notice">各店自行收款。此階段僅匯款；LINE Pay、線上點數折抵、自動退款與物流串接尚未開放。</p><p class="commerce-error" role="alert"></p>${html}`;}
  function error(e){if(current()){const el=panel.querySelector('.commerce-error');if(el)el.textContent=e.message;}}
  async function api(path,data) {
    if(!current())throw new Error('登入身分或頁面已改變，請重新開啟');
    const response=await fetch(`${base}/v1/store-commerce${path}`,{method:data?'POST':'GET',headers:{Authorization:`Bearer ${token}`,...(data?{'Content-Type':'application/json'}:{})},body:data?JSON.stringify(data):undefined,signal:AbortSignal.timeout(15000)});
    const result=await response.json();if(!current())throw new Error('登入身分或頁面已改變，請重新開啟');
    if(!response.ok||!result.success){const error=new Error(result.error||'線上商城暫時無法使用');error.status=response.status;throw error;}return result;
  }
  async function run(job) {
    if(busy)return;busy=true;const controls=[...panel.querySelectorAll('button,input,select')],disabled=controls.map(c=>c.disabled);controls.forEach(c=>c.disabled=true);
    try{await job();}catch(e){error(e);}finally{busy=false;controls.forEach((c,i)=>c.disabled=disabled[i]);}
  }
  function settingsForm(result) {
    config=result.settings;
    paint(`<nav class="shop-row"><button data-commerce="settings">收款／寄送設定</button><button data-commerce="orders">網路訂單</button></nav><h2>本店收款與寄送</h2>${result.release_enabled?'':'<p class="shop-notice">系統尚未開放線上交易。可先儲存設定，不會開始收款。</p>'}<form data-commerce-form="settings" class="shop-box"><label>開放匯款下單<select name="enabled"><option value="false">關閉</option><option value="true" ${config.enabled?'selected':''}>開啟（仍受系統開關限制）</option></select></label>${field('bank_name','銀行名稱',config.bank_name,'text',60)}${field('bank_code','銀行代碼（三碼）',config.bank_code,'text',3)}${field('bank_holder','收款戶名',config.bank_holder,'text',80)}${field('bank_account','本店銀行帳號',config.bank_account,'text',24)}${field('fee','每筆運費（元）',config.shipping_fee_cents/100,'number')}${field('free','商品滿額免運（元；0 表示不設定）',config.free_shipping_cents/100,'number')}<p>支援郵寄地址或手填超商門市。收款資料會保存於新訂單，修改設定不改變舊訂單的收款帳號。</p><button class="primary">儲存本店設定</button></form>`);
  }
  async function listOrders(next=0) {
    if(mode!=='merchant') {
      const profile=await window.liff.getProfile();if(!current())return;
      const pendingStorage='store-commerce-pending:'+profile.userId;
      const pending=JSON.parse(localStorage.getItem(pendingStorage)||'null');
      if(pending){const recovered=await api('/orders/lookup?request_key='+encodeURIComponent(pending.id));if(recovered.order)localStorage.removeItem(pendingStorage);}
    }
    const serial=++epoch;const result=await api(`/orders?scope=${mode==='merchant'?'merchant':'buyer'}&page=${next}`);if(serial!==epoch||!current())return;
    orders=result.orders;page=next;
    paint(`${mode==='merchant'?'<button data-commerce="settings">返回收款設定</button>':''}<h2>${mode==='merchant'?'本店網路訂單':'我的網路訂單'}</h2><button data-commerce="orders">重新整理</button><div class="shop-sales-list">${orders.map((o,i)=>`<section class="shop-sale-row"><div class="shop-sale-heading"><strong>${esc(o.snapshot.shop_name)}</strong><span>${esc(paymentText[o.payment_status])}／${esc(shippingText[o.fulfillment_status])}</span></div><p>購買者：${esc(o.snapshot.buyer_name||'未提供姓名')}<br>收件人：${esc(o.snapshot.customer.name)}　${money(o.total_cents)}</p><time>${esc(new Date(o.created_at).toLocaleString('zh-TW'))}</time><details><summary>訂單內容與處理</summary>${receipt(o.snapshot)}${buyerDetails(o.snapshot)}<p>訂單：${esc(o.id)}<br>電話：${esc(o.snapshot.customer.phone)}<br>${esc(carrierText[o.snapshot.customer.carrier])}：${esc(o.snapshot.customer.carrier==='POST'?deliveryAddress(o.snapshot.customer):o.snapshot.customer.store_info)}<br>備註：${esc(o.snapshot.customer.note)}</p>${bank(o.snapshot)}${o.remittance_last5?`<p>回報末五碼：${esc(o.remittance_last5)}</p>`:''}${o.tracking_number?`<p>物流編號：${esc(o.tracking_number)}</p>`:''}${actionForm(o,i)}</details></section>`).join('')||'<p>目前沒有訂單。</p>'}</div><div class="shop-row">${page?'<button data-commerce="prev">上一頁</button>':''}${result.has_more?'<button data-commerce="next">下一頁</button>':''}</div>`);
  }
  function actionForm(o,index) {
    let action='',html='',label='';
    if(mode==='merchant') {
      if(o.payment_status==='reported'){action='verify_remittance';html=field('received','實際入帳金額（元）','','number')+'<label><input type="checkbox" name="confirmed" required>我已查核銀行入帳，不是僅依買家截圖或末五碼認定。</label>';label='確認收款';}
      else if(o.payment_status==='paid'&&o.fulfillment_status==='unfulfilled'){action='ship';html=field('tracking_number','物流編號','','text',100);label='確認已出貨';}
      else if(o.payment_status==='paid'&&o.fulfillment_status==='shipped'){action='complete';label='標記完成';}
    } else if(['pending','reported'].includes(o.payment_status)){action='report_remittance';html=field('last5','匯款帳號末五碼',o.remittance_last5,'text',5);label='回報匯款（不代表已核帳）';}
    return `${action?`<form data-commerce-form="action" data-index="${index}" data-action="${action}" data-key="${crypto.randomUUID()}">${html}<button class="primary">${label}</button></form>`:''}${mode!=='merchant'&&o.payment_status==='pending'?`<button data-commerce="cancel" data-index="${index}">取消未付款訂單</button>`:''}`;
  }
  function checkoutForm() {
    if(!products.length){paint('<h2>本店目前沒有網購商品</h2><p>限店內商品請至店內購買。</p>');return;}
    paint(`<h2>${esc(shop.name)}・線上選購</h2><form data-commerce-form="quote" class="shop-box">${products.map(p=>`<label>${esc(p.title)}　${money(p.price_cents)}<input type="number" name="qty-${esc(p.id)}" min="0" max="99" step="1" value="0" aria-label="${esc(p.title)}數量"></label>`).join('')}<h3>購買人資訊</h3><button type="button" data-commerce="load-buyer">帶入已儲存網購人資料</button><p class="shop-meta">先至「我的 → 會員註冊 → 網購人資料」填寫。帶入後請核對；勾選同購買人時也會帶入郵寄地址。</p>${field('buyer_name','購買人姓名 *','','text',80,'required autocomplete="name"')}${field('buyer_phone','購買人手機 *','','tel',30,'required autocomplete="tel"')}${field('buyer_email','Email（選填）','','email',254,'autocomplete="email"')}<h3>收件人資料</h3><label><input type="checkbox" name="same_recipient" checked>收件人同購買人</label>${field('name','收件人姓名 *','','text',80,'required')}${field('phone','收件人手機 *','','tel',30,'required')}<label>寄送方式<select name="carrier"><option value="POST">中華郵政</option><option value="FAMILY">全家（手填門市）</option><option value="SEVEN">7-11（手填門市）</option></select></label>${field('postal_code','郵遞區號（選填）','','text',6,'inputmode="numeric" autocomplete="postal-code"')}${field('city','縣市 *','','text',20,'required autocomplete="address-level1"')}${field('district','區域／鄉鎮市 *','','text',20,'required autocomplete="address-level2"')}${field('address','路名、巷弄、門牌、樓層 *','','text',200,'required autocomplete="street-address"')}${field('store_info','超商店號、店名與地址（超商寄送必填）','','text',120)}${field('note','訂單備註','','text',300)}<button class="primary">確認金額與收款店家</button></form>`);
    const form=panel.querySelector('form');
    if(input){for(const [key,value] of Object.entries(input.customer))if(form.elements[key])form.elements[key].value=value;for(const [key,value] of Object.entries(input.buyer))form.elements['buyer_'+key].value=value;for(const item of input.items)if(form.elements['qty-'+item.id])form.elements['qty-'+item.id].value=item.quantity;}
    form.elements.same_recipient.checked=sameRecipient;
    const sync=()=>{
      const f=form.elements,same=f.same_recipient.checked,post=f.carrier.value==='POST';
      for(const key of ['name','phone']){f[key].disabled=same;if(same)f[key].value=f['buyer_'+key].value;}
      for(const key of ['postal_code','city','district','address']){f[key].closest('label').hidden=!post;f[key].disabled=!post;f[key].required=post&&key!=='postal_code';}
      f.store_info.closest('label').hidden=post;f.store_info.disabled=post;f.store_info.required=!post;
    };
    form.oninput=sync;form.onchange=event=>{
      sync();
      if((event.target.name==='same_recipient'||event.target.name==='carrier')&&form.elements.same_recipient.checked)copyBuyerAddress(form);
    };sync();
  }
  function copyBuyerAddress(form){
    if(!savedBuyerProfile||!form.elements.same_recipient.checked||form.elements.carrier.value!=='POST')return;
    for(const key of ['postal_code','city','district','address'])form.elements[key].value=savedBuyerProfile[key]||'';
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
      if(command==='load-buyer'){
        const form=panel.querySelector('[data-commerce-form="quote"]');
        const result=await api('/buyer-profile');
        if(!form?.isConnected||!current())return;
        if(!result.profile)throw Error('尚未儲存網購人資料，請先至「我的 → 會員註冊」填寫。');
        savedBuyerProfile=result.profile;
        for(const key of ['name','phone','email'])form.elements['buyer_'+key].value=savedBuyerProfile[key]||'';
        copyBuyerAddress(form);form.dispatchEvent(new Event('input'));
        panel.querySelector('.commerce-error').textContent='已帶入本人網購資料，請核對收件人與地址；本次沒有建立訂單。';
      }
      if(command==='settings')settingsForm(await api('/settings'));
      if(command==='orders')await listOrders(0);
      if(command==='prev')await listOrders(page-1);
      if(command==='next')await listOrders(page+1);
      if(command==='edit')checkoutForm();
      if(command==='cancel'){
        const o=orders[Number(button.dataset.index)];if(!window.confirm('確認尚未匯款，並取消這筆訂單？若已匯款請聯絡店家。'))return;
        await api('/orders/action',{action:'cancel',order_id:o.id,version:o.version,request_key:crypto.randomUUID()});await listOrders(page);
      }
      if(command==='place'){
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
        paint(`<h2>訂單已建立，尚未付款</h2><p>請只匯款一次，匯款後回報末五碼。</p><p>訂單：${esc(result.order.id)}</p>${receipt(result.order.snapshot)}${bank(result.order.snapshot)}<button data-commerce="orders">我的網路訂單／回報匯款</button>`);
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
        sameRecipient=values.same_recipient==='on';
        input={shop_id:shop.id,payment_method:'REMITTANCE',points_used:0,items:products.map(p=>({id:p.id,quantity:Number(values['qty-'+p.id])})).filter(p=>p.quantity!==0),buyer:{name:values.buyer_name,phone:values.buyer_phone,email:values.buyer_email},customer:{name:sameRecipient?values.buyer_name:values.name,phone:sameRecipient?values.buyer_phone:values.phone,carrier:values.carrier,postal_code:values.postal_code||'',city:values.city||'',district:values.district||'',address:values.address||'',store_info:values.store_info||'',note:values.note}};
        quoted=await api('/quote',input);paint(`<h2>請確認訂單</h2>${receipt(quoted.snapshot)}${buyerDetails(quoted.snapshot)}<p>收件人：${esc(input.customer.name)}<br>${esc(input.customer.phone)}<br>${esc(carrierText[input.customer.carrier])}：${esc(input.customer.carrier==='POST'?deliveryAddress(input.customer):input.customer.store_info)}</p><p>款項直接付給 ${esc(quoted.snapshot.bank.holder)}，平台不代收。建立訂單後才顯示匯款帳號。</p><button data-commerce="place" class="primary">確認建立匯款訂單</button><button data-commerce="edit">返回修改</button>`);
      }
      if(type==='action'){
        const o=orders[Number(form.dataset.index)],action=form.dataset.action;
        await api('/orders/action',{action,order_id:o.id,version:o.version,request_key:form.dataset.key,...(action==='report_remittance'?{last5:values.last5}:{}),...(action==='ship'?{tracking_number:values.tracking_number}:{}),...(action==='verify_remittance'?{received_cents:Math.round(Number(values.received)*100),confirmed:values.confirmed==='on'}:{})});await listOrders(page);
      }
    });
  };
  paint('<p role="status">驗證線上商城設定…</p>');
  try {
    if(mode==='merchant')settingsForm(await api('/settings'));
    else if(mode==='orders')await listOrders();
    else {const capability=await api('/capabilities');if(capability.enabled)checkoutForm();else paint('<h2>線上交易準備中</h2><p>目前不會建立訂單或扣點，原有商品 QR 折抵不受影響。</p>');}
  }catch(e){error(e);}
}
