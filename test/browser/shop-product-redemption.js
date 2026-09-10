async()=>{
 const assert=(v,m)=>{if(!v)throw Error(m);};
 const until=async(fn)=>{for(let i=0;i<100;i++){if(fn())return;await new Promise(r=>setTimeout(r,30));}throw Error('wait failed: '+document.body.innerText);};
 await until(()=>document.querySelector('[data-do=manage]'));
 document.querySelector('[data-do=manage]').click();
 await until(()=>document.querySelector('[data-product-qr] svg'));
 const link=document.querySelector('[data-product-qr]'),productId=new URL(link.href).searchParams.get('shopProduct');
 assert(new URL(link.href).hostname==='liff.line.me'&&productId,'QR route');
 const footer=link.closest('.shop-product-footer').getBoundingClientRect(),qrBox=link.getBoundingClientRect();
 assert(Math.abs(footer.right-qrBox.right)<2,'QR bottom right');
 assert(document.documentElement.scrollWidth<=innerWidth,'no mobile overflow');
 const img=new Image();img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(link.querySelector('svg').outerHTML);await img.decode();
 const canvas=document.createElement('canvas');canvas.width=canvas.height=400;const ctx=canvas.getContext('2d');ctx.drawImage(img,0,0,400,400);
 assert(window.jsQR(ctx.getImageData(0,0,400,400).data,400,400)?.data===link.href,'QR decodes exact product link');
 window.StoreShop.mount(document.getElementById('app'),false,productId);
 await until(()=>document.querySelector('.shop-checkout'));
 const form=document.querySelector('.shop-checkout form');
 form.elements.points.value='800';form.requestSubmit();await until(()=>document.querySelector('.checkout-result').textContent.includes('先確認'));
 assert((await (await fetch('/test-state')).json()).writes===0,'no customer means no write');
 const customer=document.querySelector('.customer');customer.value='U'+'c'.repeat(32);customer.dispatchEvent(new Event('input'));document.querySelector('.lookup').click();
 await until(()=>document.querySelector('.customer-info').textContent.includes('顧客：'));
 window.confirm=()=>false;form.requestSubmit();await new Promise(r=>setTimeout(r,50));
 assert((await (await fetch('/test-state')).json()).writes===0,'cancel confirmation no write');
 window.confirm=()=>true;form.requestSubmit();await until(()=>document.querySelector('.checkout-result').textContent.includes('已完成折抵'));
 assert((await (await fetch('/test-state')).json()).writes===1,'one confirmed write');
 // Drop the next HTTP response AFTER the journal succeeds, then recover by status query.
 await fetch('/test-drop',{method:'POST'});
 customer.value='U'+'c'.repeat(32);customer.dispatchEvent(new Event('input'));document.querySelector('.lookup').click();
 await until(()=>document.querySelector('.customer-info').textContent.includes('顧客：'));
 form.elements.points.value='700';form.requestSubmit();await until(()=>document.querySelector('.checkout-result').textContent.includes('查詢原交易'));
 assert((await (await fetch('/test-state')).json()).writes===2,'response loss wrote once');
 document.querySelector('.check').click();await until(()=>document.querySelector('.checkout-result').textContent.includes('交易已完成'));
 assert((await (await fetch('/test-state')).json()).writes===2,'lookup does not write again');
 assert(document.querySelector('.customer').value==='','completed query clears customer');
 return {result:'PASS',width:innerWidth,qrDecode:true,confirmedWrites:2,timeoutLookupNoDuplicate:true};
}
