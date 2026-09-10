// Synthetic app shell reproduces index.html's max-w-md, px-4 and -mx-4 wrappers.
async()=>{
 if(location.origin!=='http://127.0.0.1:8794')throw Error('Local synthetic test only');
 const check=(v,m)=>{if(!v)throw Error(m);};
 const wait=async(fn)=>{for(let i=0;i<100;i++){if(fn())return;await new Promise(r=>setTimeout(r,30));}throw Error('Layout test timed out');};
 await openStoreShop();await wait(()=>document.querySelector('.shop-discovery-grid'));
 const root=document.getElementById('page-store-shop');
 const style=document.createElement('style');
 style.textContent='.fixture-app{width:100%;max-width:448px;margin:auto}.fixture-main{padding:0 16px 128px}.fixture-top{width:100%;max-width:448px}.fixture-negative{margin-left:-16px;margin-right:-16px}.hidden{display:none!important}';
 document.head.prepend(style);
 const app=document.createElement('div');app.id='app';app.className='fixture-app';
 const top=document.createElement('nav');top.id='top-nav';top.className='fixture-top';app.append(top);
 const main=document.createElement('main');main.id='main';main.className='fixture-main';app.append(main);
 root.before(app);main.append(root);root.classList.add('fixture-negative');
 let rect=root.getBoundingClientRect();
 check(Math.abs(rect.width-innerWidth)<1&&Math.abs(rect.left)<1,'embedded storefront still boxed');
 check(getComputedStyle(main).paddingLeft==='0px','parent gutter not removed');
 check(getComputedStyle(root).paddingLeft==='8px'&&getComputedStyle(root).paddingRight==='8px','store gutter not 8px');
 const grid=document.querySelector('.shop-discovery-grid').getBoundingClientRect();
 check(Math.abs(grid.left-8)<1&&Math.abs(grid.right-(innerWidth-8))<1,'nested gutter remains');
 check(Math.abs(top.getBoundingClientRect().width-innerWidth)<1,'header not aligned');
 const footer=document.querySelector('.shop-bottom-nav').getBoundingClientRect();
 check(Math.abs(footer.width-innerWidth)<1,'footer still capped');
 check(document.documentElement.scrollWidth<=innerWidth,'horizontal overflow');
 root.classList.add('hidden');
 check(getComputedStyle(main).paddingLeft==='16px','other pages gutter changed');
 check(Math.abs(app.getBoundingClientRect().width-Math.min(448,innerWidth))<1,'other pages width changed');
 root.classList.remove('hidden');
 app.before(root);app.remove();root.classList.remove('fixture-negative');
 root.id='public-store-shop';
 rect=root.getBoundingClientRect();check(Math.abs(rect.width-innerWidth)<1,'public storefront capped');
 root.id='page-store-shop';style.remove();
 return {width:innerWidth,embeddedFullWidth:true,publicFullWidth:true,gutter:8,headerAndFooterAligned:true,otherPagesRestored:true,noOverflow:true};
}
