// Local CSS-only fixture: pass the actual index.html source. Never run on production.
async(html)=>{
 if(location.origin!=='http://127.0.0.1:8794')throw Error('Local layout test only');
 const source=new DOMParser().parseFromString(html,'text/html');
 const shellStyle=source.getElementById('store-shop-shell-layout');
 if(!shellStyle)throw Error('Missing production shell style');
 const iframe=document.createElement('iframe');iframe.style.cssText='position:fixed;inset:0;width:100%;height:100%;z-index:99999;border:0';
 document.body.append(iframe);
 try{
  const doc=iframe.contentDocument;
  doc.open();doc.write('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0}.hidden{display:none!important}#top-nav{position:fixed;top:0;height:96px;width:100%;display:flex}#main{padding:112px 16px 128px}.space-y-6>:not([hidden])~:not([hidden]){margin-top:24px}</style>'+shellStyle.outerHTML+'<div id="app"><nav id="top-nav">原系統標頭</nav><main id="main" class="space-y-6"><div id="page-home" class="hidden">原系統首頁</div><div id="page-store-shop"><header class="shop-brand">生活好店</header><button>點數 QR</button></div></main></div>');doc.close();
  const header=doc.getElementById('top-nav'),main=doc.getElementById('main'),mall=doc.getElementById('page-store-shop');
  const check=(ok,message)=>{if(!ok)throw Error(message);};
  const css=node=>iframe.contentWindow.getComputedStyle(node);
  const mallTop=mall.getBoundingClientRect().top;
  check(css(header).display==='none','Hide shared header in embedded mall');
  check(css(main).paddingTop==='0px'&&css(mall).marginTop==='0px'&&mallTop===0,'Remove header and sibling-spacing gaps');
  check(css(doc.querySelector('.shop-brand')).display!=='none','Keep lifestyle brand and its action');
  const dialog=doc.createElement('dialog');dialog.innerHTML='<button>會員點數操作</button>';doc.body.append(dialog);dialog.showModal();
  check(css(header).display==='none','Header stays hidden while point POP is open');dialog.close();dialog.remove();
  mall.classList.add('hidden');doc.getElementById('page-home').classList.remove('hidden');
  check(css(header).display==='flex'&&css(main).paddingTop==='112px','Restore original shell when leaving mall');
  mall.classList.remove('hidden');doc.getElementById('page-home').classList.add('hidden');
  check(css(header).display==='none'&&mall.getBoundingClientRect().top===0,'Reenter mall without a header gap');
  mall.remove();check(css(header).display==='flex','No mall element leaves other pages unchanged');
  return {passed:true,viewport:innerWidth,mallTop,headerHidden:true,brandPreserved:true,popupCompatible:true,restoredOnExit:true,noAPICalls:true};
 }finally{iframe.remove();}
}
