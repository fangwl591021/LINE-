export async function showMemberProductQr(root,productId,isActive=()=>true) {
 const owner=window.currentUserProfile?.userId;
 const active=()=>isActive()&&root.isConnected&&window.currentUserProfile?.userId===owner;
 root.innerHTML='<p role="status">產生本人商品 QR 中…</p>';
 try {
  if(!owner||!window.liff?.isLoggedIn?.())throw Error('請先透過 LINE 登入再產生本人商品 QR');
  const response=await window.callSafeCashier('issueStoreMemberProductQr',{productId});
  if(!active())return;
  if(!response?.success)throw Error(response?.error||'無法產生商品 QR');
  const {qrToken,expiresAt}=response.data;
  if(!/^[0-9a-f]{64}$/.test(qrToken)||!Number.isFinite(expiresAt))throw Error('商品 QR 回應不正確');
  const url=new URL('https://liff.line.me/'+(window.DEFAULT_LIFF_ID||'1660923784-vViMTZ1y'));
  url.searchParams.set('shopQr',qrToken);
  const {default:qrcode}=await import('../vendor/qrcode-generator-2.0.4.mjs');
  if(!active())return;
  const qr=qrcode(0,'M');qr.addData(url.href);qr.make();
  root.innerHTML='<div class="member-product-code"></div><p class="member-qr-status"></p><button type="button" class="member-qr-refresh">重新產生</button>';
  const code=root.querySelector('.member-product-code'),status=root.querySelector('.member-qr-status');
  code.innerHTML=qr.createSvgTag({cellSize:3,margin:12,scalable:true});
  root.querySelector('button').onclick=()=>void showMemberProductQr(root,productId,isActive);
  const tick=()=>{
   if(!active()){code.replaceChildren();return;}
   if(!root.contains(status))return;
   const seconds=Math.ceil((expiresAt-Date.now())/1000);
   if(seconds<=0){code.replaceChildren();status.textContent='QR 已過期，請重新產生';return;}
   status.textContent=`本人商品 QR｜${seconds} 秒內有效，請出示給此店家掃描。勿轉傳；店家確認後才扣點。`;
   setTimeout(tick,1000);
  };tick();
 }catch(e){if(active()){root.textContent=e.message;const retry=document.createElement('button');retry.type='button';retry.textContent='重試';retry.onclick=()=>void showMemberProductQr(root,productId,isActive);root.appendChild(retry);}}
}
