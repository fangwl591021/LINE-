// Local-only synthetic data; run on a fresh store-commerce-server instance.
async()=>{
 if(location.origin!=='http://127.0.0.1:8794')throw Error('Local test only');
 const check=(v,m)=>{if(!v)throw Error(m);};
 const until=async(fn)=>{for(let i=0;i<180;i++){if(fn())return;await new Promise(r=>setTimeout(r,30));}throw Error('Timeout: '+document.body.innerText);};
 const click=s=>document.querySelector(s).click();
 const api=async(path,data,token='a')=>{const response=await fetch('/v1/store-shop'+path,{method:data?'POST':'GET',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:data?JSON.stringify(data):undefined});return {status:response.status,...await response.json()};};
 window.testToken='b';await openStoreShop();click('[data-do=manage]');await until(()=>document.querySelector('[data-form=store]'));
 let form=document.querySelector('[data-form=store]');
 form.elements.name.value='一般會員本人店面';form.elements.status.value='active';form.requestSubmit();
 await until(()=>document.querySelector('[data-do=new]'));
 check(!document.querySelector('[data-do=sales]')&&!document.querySelector('[data-do=online-manage]'),'Normal member must not see transaction management');
 click('[data-do=new]');form=document.querySelector('[data-form=product]');
 check(!!form.querySelector('[data-do=dm-import]'),'DM entry missing');
 check(form.elements.purchase_mode.options.length===1&&form.elements.redeem_type.options.length===1,'Restricted product policy');
 form.elements.title.value='本人測試商品';form.elements.price.value='100';form.elements.status.value='active';form.requestSubmit();
 await until(()=>!document.querySelector('[data-form=product]')&&document.querySelector('[data-do=new]')?.disabled);
 check(document.querySelectorAll('.shop-grid article').length===1,'One product displayed');
 click('[data-do=view]');await until(()=>document.querySelector('.shop-store-intro'));
 check(!document.querySelector('[data-do=member-qr]'),'No unavailable product QR for ordinary seller');
 click('[data-do=manage]');await until(()=>document.querySelector('[data-do=edit]'));click('[data-do=edit]');
 form=document.querySelector('[data-form=product]');form.elements.status.value='archived';form.requestSubmit();
 await until(()=>document.querySelector('[data-do=new]')&&!document.querySelector('[data-do=new]').disabled);
 const created=await api('/manage',undefined,'a');
 for(let i=created.product_count;i<102;i++){const r=await api('/product',{title:'分頁測試 '+i,price_cents:10000,redeem_type:'none',redeem_value:0,status:'active',request_key:crypto.randomUUID()});check(r.success,'Seed local product');}
 window.testToken='a';await openStoreShop();click('[data-do=manage]');await until(()=>document.querySelector('[data-do=more-products]'));
 check(document.querySelectorAll('.shop-grid article').length===100,'First management page');
 check(document.querySelector('[data-do=new]').disabled===false,'Store can create beyond 100');
 click('[data-do=more-products]');await until(()=>document.querySelectorAll('.shop-grid article').length===102);
 check(!document.querySelector('[data-do=more-products]'),'Final management page');
 click('[data-do=view]');await until(()=>document.querySelector('.shop-store-intro')&&document.querySelector('[data-do=more-products]'));
 click('[data-do=more-products]');await until(()=>document.querySelectorAll('.shop-grid article').length===102);
 check(!document.querySelector('[data-do=more-products]'),'Final public page');
 check(document.documentElement.scrollWidth<=innerWidth,'No horizontal overflow');
 return {passed:true,normalMember:'create own shop / one product / archive / no transaction controls',store:'102 products, management + public pagination',width:innerWidth};
}
