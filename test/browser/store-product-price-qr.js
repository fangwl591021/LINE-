// Layout-only fixture: fake credential issuance, no real account or debit calls.
async()=>{
 if(location.origin!=='http://127.0.0.1:8794')throw Error('Local only');
 const check=(v,m)=>{if(!v)throw Error(m);};
 const wait=async(fn)=>{for(let i=0;i<140;i++){if(fn())return;await new Promise(r=>setTimeout(r,30));}throw Error('QR layout timed out');};
 window.currentUserProfile={userId:'U'+'b'.repeat(32)};
 let issued=0,validFor=300000;
 window.callSafeCashier=async(action,payload)=>{
  check(action==='issueStoreMemberProductQr'&&payload.productId==='p-a','unexpected action');
  issued++;return {success:true,data:{qrToken:issued.toString(16).padStart(64,'0'),expiresAt:Date.now()+validFor}};
 };
 await openStoreShop();await wait(()=>document.querySelector('[data-do=view]'));
 document.querySelector('[data-do=view]').click();await wait(()=>document.querySelector('[data-product-qr]'));
 check(issued===0,'must issue only on click');
 document.querySelector('[data-product-qr]').click();await wait(()=>document.querySelector('.shop-inline-qr svg'));
 const card=document.querySelector('.shop-product-card');
 const price=card.querySelector('.shop-price').getBoundingClientRect(),qr=card.querySelector('.member-product-code svg').getBoundingClientRect();
 check(qr.left>price.right&&Math.abs(qr.top-price.top)<2,'QR not beside price');
 check(qr.width>=110&&qr.width===qr.height,'QR too small or distorted');
 check(card.querySelector('.shop-detail-link'),'detail action removed');
 check(!card.querySelector('.shop-product-actions .member-product-code'),'QR still in action footer');
 check(document.documentElement.scrollWidth<=innerWidth,'list overflow');
 card.querySelector('.member-qr-refresh').click();await wait(()=>issued===2&&card.querySelector('.shop-inline-qr svg'));
 card.querySelector('.shop-detail-link').click();await wait(()=>document.querySelector('.shop-product-detail'));
 document.querySelector('.shop-product-detail [data-do=member-qr]').click();
 await wait(()=>document.querySelector('.shop-product-detail .shop-inline-qr svg'));
 check(issued===3&&!!document.querySelector('.shop-product-detail [data-do=online-buy]'),'QR replaced purchase action');
 check(document.documentElement.scrollWidth<=innerWidth,'detail overflow');
 validFor=50;document.querySelector('.shop-product-detail .member-qr-refresh').click();
 await wait(()=>document.querySelector('.shop-product-detail .member-qr-status')?.textContent.includes('已過期'));
 check(!document.querySelector('.shop-product-detail .member-product-code svg'),'expired QR still visible');
 check(getComputedStyle(document.querySelector('.member-qr-refresh')).whiteSpace==='nowrap','refresh vertical text');
 return {width:innerWidth,qrWidth:qr.width,priceAndQrSameRow:true,detailAndBuyPreserved:true,refresh:true,expiry:true,noOverflow:true,onlySyntheticIssuance:true};
}
