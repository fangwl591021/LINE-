// Local DOM fixture with actual shell CSS and navigation source. Never run on production.
async({html,navigation})=>{
 if(location.origin!=='http://127.0.0.1:8794')throw Error('Local layout test only');
 const source=new DOMParser().parseFromString(html,'text/html');
 const shellStyle=source.getElementById('store-shop-shell-layout');
 if(!shellStyle)throw Error('Missing production shell style');
 if(shellStyle.textContent.includes(':has('))throw Error('Shell visibility must work without :has');
 if(!navigation)throw Error('Pass the actual navigation.js source');
 const iframe=document.createElement('iframe');iframe.style.cssText='position:fixed;inset:0;width:100%;height:100%;z-index:99999;border:0';
 document.body.append(iframe);
 try{
  const doc=iframe.contentDocument;
  doc.open();doc.write('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0}.hidden{display:none!important}#top-nav{position:fixed;top:0;height:96px;width:100%;display:flex}#main{padding:112px 16px 128px}.space-y-6>:not([hidden])~:not([hidden]){margin-top:24px}</style>'+shellStyle.outerHTML+'<div id="app"><nav id="top-nav">原系統標頭</nav><main id="main" class="space-y-6"><div id="page-home" class="hidden">原系統首頁</div><div id="page-inbox" class="hidden">收件匣</div><div id="page-points-wallet" class="hidden">點數專區</div><div id="page-store-shop" class="hidden"><header class="shop-brand">生活好店</header><button>點數 QR</button></div></main><nav id="bottom-nav"><button id="nav-btn-home" class="nav-btn"></button><button id="nav-btn-inbox" class="nav-btn"></button></nav><nav id="bottom-nav-admin" class="hidden"><button id="admin-nav-btn-inbox" class="nav-btn"></button></nav></div>');doc.close();
  const win=iframe.contentWindow;
  let apiCalls=0;
  const unexpectedRequest=()=>{apiCalls++;throw Error('Layout navigation must not call APIs');};
  win.fetch=unexpectedRequest;win.fetchAPI=unexpectedRequest;
  win.loadUserActivities=unexpectedRequest;win.loadInbox=unexpectedRequest;win.loadPointsWallet=unexpectedRequest;
  win.currentViewMode='user';win.eval(navigation);
  win.goPage('store-shop',true);
  const header=doc.getElementById('top-nav'),main=doc.getElementById('main'),mall=doc.getElementById('page-store-shop');
  const check=(ok,message)=>{if(!ok)throw Error(message);};
  const css=node=>iframe.contentWindow.getComputedStyle(node);
  const mallTop=mall.getBoundingClientRect().top;
  check(doc.body.classList.contains('store-shop-page'),'Router enters mall shell state');
  check(css(header).display==='none','Hide shared header in embedded mall');
  check(css(main).paddingTop==='0px'&&css(mall).marginTop==='0px'&&mallTop===0,'Remove header and sibling-spacing gaps');
  check(css(doc.querySelector('.shop-brand')).display!=='none','Keep lifestyle brand and its action');
  const dialog=doc.createElement('dialog');dialog.innerHTML='<button>會員點數操作</button>';doc.body.append(dialog);dialog.showModal();
  check(css(header).display==='none','Header stays hidden while point POP is open');dialog.close();dialog.remove();
  win.goPage('inbox',true);
  check(!doc.body.classList.contains('store-shop-page'),'Router clears mall shell state on exit');
  check(css(header).display==='flex'&&css(main).paddingTop==='112px','Restore original shell when leaving mall');
  check(!doc.getElementById('bottom-nav').classList.contains('hidden')&&doc.getElementById('bottom-nav-admin').classList.contains('hidden'),'Preserve user navigation mode');
  win.goPage('store-shop',true);
  check(css(header).display==='none'&&mall.getBoundingClientRect().top===0,'Reenter mall without a header gap');
  win.currentViewMode='admin';win.goPage('inbox',true);
  check(css(header).display==='flex'&&doc.getElementById('bottom-nav').classList.contains('hidden')&&!doc.getElementById('bottom-nav-admin').classList.contains('hidden'),'Preserve admin navigation mode on exit');
  win.goPage('store-shop',true);win.goPage('points-wallet',true);
  check(css(header).display==='flex'&&doc.getElementById('bottom-nav').classList.contains('hidden')&&doc.getElementById('bottom-nav-admin').classList.contains('hidden'),'Preserve existing wallet navigation');
  win.goPage('store-shop',true);win.goPage('home',true);
  check(!doc.body.classList.contains('store-shop-page')&&doc.body.classList.contains('home-page')&&doc.body.classList.contains('shared-front-banner-page'),'Keep original home shell classes');
  check(apiCalls===0,'No API or data loader calls during layout navigation');
  return {passed:true,viewport:innerWidth,mallTop,headerHidden:true,brandPreserved:true,popupCompatible:true,restoredOnExit:true,navigationModesPreserved:true,requiresHas:false,noAPICalls:true};
 }finally{iframe.remove();}
}
