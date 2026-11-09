(() => {
  const label = (tag, text, className) => {
    const el = document.createElement(tag);
    el.textContent = text;
    if (className) el.className = className;
    return el;
  };
  function branch(node, generation, legacy=false) {
    const li = document.createElement('li');
    const card = document.createElement('div');
    card.className = 'org-person';
    card.append(label('small', generation ? '第 '+generation+' 代' : '組織起點'),label('strong',node.name));
    if (node.number) card.append(label('span', node.number));
    if (node.independent) card.append(label('span',legacy?'已獨立':'專案獨立','org-badge'));
    if (legacy && node.side) card.append(label('small',node.side));
    if (!legacy && generation) card.append(label('small',node.credited ? '推薦成交已認列' : '契約推薦已確認'));
    li.append(card);
    if (node.children.length) {
      const group = document.createElement('ul');
      group.append(...node.children.map(child=>branch(child,generation+1,legacy)));
      const toggle = label('button','收合下線');
      toggle.type='button';
      toggle.setAttribute('aria-expanded','true');
      toggle.onclick=()=>{
        group.hidden=!group.hidden;
        toggle.setAttribute('aria-expanded',String(!group.hidden));
        toggle.textContent=group.hidden?'展開下線':'收合下線';
      };
      card.append(toggle);
      li.append(group);
    } else if (node.hasChildren) card.append(label('small','還有下一代'));
    return li;
  }
  function draw(box,root,title,legacy=false){
    const scroll=document.createElement('div');
    scroll.className='org-chart-scroll';scroll.tabIndex=0;scroll.setAttribute('aria-label',title+'，可左右捲動');
    const tree=document.createElement('ul');tree.className='org-chart';tree.append(branch(root,0,legacy));scroll.append(tree);
    box.replaceChildren(label('p',title,'org-caption'),scroll);
    requestAnimationFrame(()=>{scroll.scrollLeft=(scroll.scrollWidth-scroll.clientWidth)/2;});
  }
  function historical(box,root,type){
    const format=n=>({name:n.name||n.displayName||n.memberName||'會員',number:n.memberNumber||'',
      independent:n.independent===true,side:({left:'左區',right:'右區'})[n.placementSide]||'',
      children:(n.children||n.downlines||n.members||n.nodes||[]).map(format)});
    draw(box,format(root),type==='placement'?'舊制安置組織':'舊制推薦與加入來源',true);
  }
  const requests = new WeakMap();
  async function render(box, {target='',depth=3}={}) {
    const request=Symbol();
    requests.set(box,request);
    const actor=window.liff?.getContext?.()?.userId;
    const token=window.liff?.getAccessToken?.();
    const current=()=>requests.get(box)===request && box.isConnected && token===window.liff?.getAccessToken?.() && actor===window.liff?.getContext?.()?.userId;
    box.replaceChildren(label('p','讀取組織中…'));
    try {
      if (!token) throw Error('請先使用 LINE 登入');
      const base=window.Config?.WORKER_URL || (typeof WORKER_URL==='undefined'?'':WORKER_URL);
      if (!base) throw Error('組織服務尚未載入');
      const url=new URL('/v1/partner-applications/'+(target?'admin/organization':'organization'),base);
      if (target) url.searchParams.set('target',target);
      url.searchParams.set('depth',String(depth));
      const response=await fetch(url,{headers:{Authorization:'Bearer '+token},cache:'no-store',signal:AbortSignal.timeout(20000)});
      const data=await response.json();
      if (!response.ok || !data.success) throw Error(data.error || '組織圖讀取失敗');
      if (!current()) return;
      const org=data.organization, root=org.root;
      const title=root.hasChildren?'契約推薦組織':'目前沒有已確認的直推成員';
      draw(box,root,title);
      if(org.limited) box.append(label('p','本圖最多顯示 240 位成員。'));
    } catch (err) {
      if (current()) box.replaceChildren(label('p',err.name==='TimeoutError'?'讀取逾時，請重新查詢。':err.message));
    }
  }
  function member() {
    if(document.querySelector('dialog.contract-org-dialog'))return;
    const dialog=document.createElement('dialog');dialog.className='contract-org-dialog';dialog.setAttribute('aria-label','我的組織圖');
    const head=document.createElement('header'),close=label('button','關閉 ×');
    close.type='button';close.onclick=()=>dialog.close();head.append(label('h2','我的組織圖'),close);
    const depth=document.createElement('select');
    for(const n of [2,3,5,10]) depth.add(new Option(n+' 代',String(n),n===3,n===3));
    const depthLabel=label('label','顯示代數 ');depthLabel.append(depth);
    const box=document.createElement('section'),refresh=label('button','重新查詢');refresh.type='button';
    refresh.onclick=depth.onchange=()=>render(box,{depth:depth.value});
    const toolbar=document.createElement('div');toolbar.className='org-toolbar';toolbar.append(depthLabel,refresh);
    dialog.append(head,toolbar,box);document.body.append(dialog);
    const actor=window.liff?.getContext?.()?.userId, token=window.liff?.getAccessToken?.(),page=window.currentPage;
    const timer=setInterval(()=>{if(actor!==window.liff?.getContext?.()?.userId||token!==window.liff?.getAccessToken?.()||page!==window.currentPage)dialog.close();},500);
    dialog.addEventListener('close',()=>{clearInterval(timer);dialog.remove();},{once:true});
    dialog.showModal();refresh.onclick();
  }
  window.ContractOrganization={render,member,historical,cancel:box=>requests.delete(box)};
})();

