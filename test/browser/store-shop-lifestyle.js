// Local synthetic fixture only: run the expression through Chrome evaluation.
async()=>{
 if(location.origin!=='http://127.0.0.1:8794')throw Error('Local synthetic test only');
 const until=async(fn)=>{for(let i=0;i<100;i++){if(fn())return;await new Promise(r=>setTimeout(r,40));}throw Error(document.body.innerText);};
 const check=(v,m)=>{if(!v)throw Error(m);};
 window.testToken='b';window.currentUserProfile={userId:'U'+'b'.repeat(32)};
 window.pointWalletStatus='ready';window.pointWalletData={balance:9999,walletDisplayOwner:'U'+'a'.repeat(32)};
 await openStoreShop();await until(()=>document.querySelector('.shop-life-hero'));
 check(!document.querySelector('.shop-wallet-card').textContent.includes('9,999'),'other user balance exposed');
 check(document.querySelectorAll('[data-scope=shops]').length===8,'categories changed');
 check(getComputedStyle(document.querySelector('.shop-discovery-grid')).gridTemplateColumns.split(' ').length===2,'mobile cards not two columns');
 window.pointWalletData={balance:1117,walletDisplayOwner:window.currentUserProfile.userId};
 document.querySelector('[data-do=list]').click();await until(()=>document.querySelector('.shop-wallet-card')?.textContent.includes('1,117'));
 window.pointWalletStatus='error';document.querySelector('[data-do=list]').click();await until(()=>document.querySelector('.shop-wallet-card')&&!document.querySelector('.shop-wallet-card').textContent.includes('1,117'));
 let opened=0;window.openPointsWallet=()=>opened++;document.querySelector('.shop-wallet-cta').click();check(opened===1,'wallet entry not reused');
 document.querySelector('[data-do=region]').click();await until(()=>document.activeElement?.name==='q');
 const search=document.querySelector('[data-form=search]');search.elements.q.value='不存在的地區';search.requestSubmit();await until(()=>document.body.textContent.includes('目前沒有符合條件'));
 check(!document.querySelector('.shop-life-hero'),'search should not repeat hero');
 document.querySelector('[data-do=list]').click();await until(()=>document.querySelector('[data-do=view]'));
 document.querySelector('[data-do=view]').click();await until(()=>document.querySelector('[data-do=detail]'));
 document.querySelector('[data-do=detail]').click();await until(()=>document.querySelector('.shop-product-detail'));
 check(document.querySelector('.shop-product-detail').textContent.includes('8800')||document.querySelector('.shop-product-detail').textContent.includes('8,800'),'price changed');
 check(!document.querySelector('img[src=x]'),'product XSS');
 document.querySelector('[data-do=mine]').click();check(!!document.querySelector('.shop-member-home'),'my page missing');
 document.querySelector('.shop-member-links [data-do=online-orders]').click();await until(()=>document.querySelector('.shop-sales-list'));
 check(document.documentElement.scrollWidth<=innerWidth,'mobile overflow');
 const footer=document.querySelector('.shop-bottom-nav').getBoundingClientRect();check(footer.bottom<=innerHeight+1,'footer outside viewport');
 document.querySelector('[data-do=list]').click();await until(()=>document.querySelector('.shop-life-hero'));
 return {width:innerWidth,ownerCheckedBalance:true,errorNotZero:true,categories:8,twoColumnCards:true,regionSearch:true,productDetail:true,walletEntry:true,noXss:true,noOverflow:true};
}
