(function () {
  'use strict';
  const scriptUrl = document.currentScript.src;
  const asset = name => new URL('../../' + name, scriptUrl).href;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const clean = value => String(value ?? '').trim();
  const owner = () => clean(window.currentUserProfile?.userId);
  const safeUrl = (value, contact = false) => {
    const raw = clean(value);
    if (contact && (/^tel:\+?[0-9#*(),. -]{5,40}$/.test(raw) || /^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw))) return raw;
    try { const url = new URL(raw); return url.protocol === 'https:' && !url.username && !url.password ? url.href : ''; } catch { return ''; }
  };
  let root, client, world, worldModule, audio, presence, generation = 0, activeOwner = '', zone = 'people', query = '', industry = '', sort = 'random';
  let members = [], publicMembers = [], industries = [], next = '', selected = '', posts = null, listView = false, exitAction = null, worldState = null, savedScrollTop = 0;
  let memberTicket = 0, publicTicket = 0, selectionTicket = 0, boardTicket = 0, rollTicket = 0, busy = false, publicBusy = false, publicReady = false, actionBusy = false, initializing = false, rolling = false, rollMessage = '', dialog, styleReady;
  let heartbeatClock={at:-Infinity},presenceStatus='checking';
  const $ = selector => root.querySelector(selector);
  const active = ticket => ticket === generation && activeOwner === owner() && window.currentPage === 'business-island' && root && !root.classList.contains('hidden');
  const valid = ticket => active(ticket) && client?.current();
  const findMember = handle => {const published=publicMembers.find(row=>row.handle===handle),ordinary=members.find(row=>row.handle===handle);return published?{...published,match:ordinary?.match??published.match}:ordinary;};
  function updateRollControl(){const button=$('[data-bi-action="roll"]');button.disabled=rolling||publicBusy||!publicReady;}
  function renderPublicStatus(){
    if(!publicReady||publicBusy)return;
    const online=publicMembers.filter(row=>row.onlineKnown===true&&row.online===true).length;
    const status=$('[data-bi-public-status]');
    status.textContent=`${publicMembers.length} 位公開會員上島 · ${online?`${online} 位在線優先`:'在線優先'}${presenceStatus==='unavailable'?'（狀態暫無法更新）':''}`;
    status.title='在線指最近3分鐘在人脈島活動，狀態可能稍有延遲。';
  }
  function randomIndex(length) {
    const value = new Uint32Array(1);
    window.crypto.getRandomValues(value);
    return Math.floor(value[0] / 4294967296 * length);
  }
  function avatar(row, extra = '') {
    const url = safeUrl(row.avatarUrl || row.pictureUrl);
    return `<span class="bi-avatar ${extra}" aria-hidden="true"><span>${esc(clean(row.name || row.displayName).slice(0, 1) || '會')}</span>${url ? `<img data-bi-avatar src="${esc(url)}" alt="" referrerpolicy="no-referrer" hidden>` : ''}</span>`;
  }
  function bindAvatars(host = root) {
    for (const image of host.querySelectorAll('img[data-bi-avatar]:not([data-bound])')) {
      image.dataset.bound = '';
      const initial = image.previousElementSibling;
      const loaded = () => { initial.hidden = true; image.hidden = false; };
      const failed = () => { initial.hidden = false; image.remove(); };
      image.addEventListener('load', loaded, {once:true});
      image.addEventListener('error', failed, {once:true});
      if (image.complete) { if (image.naturalWidth > 0) loaded(); else failed(); }
    }
  }
  function note(message = '', retry = false) {
    $('[data-bi-status]').textContent = message;
    $('[data-bi-retry]').hidden = !retry;
  }
  function closeCard() { if (dialog) { dialog.close(); dialog.remove(); dialog = null; } }
  function renderAudioState(state) {
    const music=$('[data-bi-action="music"]'),sound=$('[data-bi-action="sound"]');
    if(!music||!sound)return;
    root.dataset.audioState=state.status;
    music.textContent=state.music?'音樂開':'音樂關';music.setAttribute('aria-pressed',String(state.music));
    sound.textContent=state.sound?'音效開':'音效關';sound.setAttribute('aria-pressed',String(state.sound));
    $('[data-bi-audio-status]').textContent={locked:'首次擲骰後播放，可隨時關閉',playing:'輕柔音樂播放中',muted:state.sound?'背景音樂已關閉':'聲音已關閉',paused:'聲音已暫停',blocked:'聲音尚未啟動，可再點擲骰重試',unsupported:'此裝置暫不支援聲音'}[state.status]||'';
  }
  function live() {
    if (initializing && active(generation)) { note('正在連接人脈島…'); return false; }
    if (valid(generation)) return true;
    const message = activeOwner !== owner() ? '登入身分已變更，請重新進入人脈島。' : '請重新進入 LINE 登入，再重試。';
    window.leaveBusinessIsland();
    if (root) { $('.bi-list').replaceChildren(); $('.bi-selection').replaceChildren(); note(message, true); }
    return false;
  }
  function markup() {
    return `<section class="bi-shell" aria-label="人脈島">
      <header class="bi-header"><div class="bi-brand"><span class="bi-brand-mark" aria-hidden="true">島</span><div><h1>人脈島</h1><p>探索人脈，讓合作從交流開始</p></div></div><div class="bi-toolbar"><button type="button" data-bi-action="exit">返回首頁</button><button type="button" data-bi-action="list" aria-pressed="false">快速清單</button></div></header>
      <nav class="bi-tabs" aria-label="人脈島分區"><button type="button" data-bi-zone="people" aria-pressed="true">人脈廣場</button><button type="button" data-bi-zone="board" aria-pressed="false">合作告示板</button><button type="button" data-bi-zone="home" aria-pressed="false">我的小屋</button></nav>
      <div class="bi-layout"><section class="bi-explore" aria-label="所在島自由探索"><div class="bi-dice"></div><div class="bi-explore-copy"><h2>擲骰，走近島上夥伴</h2><p class="bi-roll-result" role="status" aria-live="polite">${esc(rollMessage || '頭貼人物在島上自由漫遊，點對方就能對話；在線會員優先。')}</p><small class="bi-audio-status" data-bi-audio-status></small></div><div class="bi-play-controls"><button type="button" class="bi-roll" data-bi-action="roll">擲骰找夥伴</button><button type="button" data-bi-action="music" aria-label="開關背景音樂" aria-pressed="true">音樂開</button><button type="button" data-bi-action="sound" aria-label="開關音效" aria-pressed="true">音效開</button></div></section>
      <div class="bi-public-roster"><p data-bi-public-status role="status" aria-live="polite">正在邀請公開會員上島…</p><button type="button" data-bi-action="refresh-public">更新公開名冊</button></div>
      <div class="bi-map" aria-label="七座人脈群島，由上到下探索"><div class="bi-stage"></div></div>
      <section class="bi-panel" aria-label="人脈島資訊"><div class="bi-panel-header"><h2 data-bi-title>人脈廣場</h2><p class="bi-caption" data-bi-caption>選擇會員，查看公開名片或開始交流</p></div><div class="bi-selection" aria-live="polite"></div>
      <form class="bi-search"><label for="bi-query">找會員</label><div><input id="bi-query" type="search" maxlength="60" placeholder="姓名、英文名、公司或職稱" autocomplete="off"><button type="submit">搜尋</button></div><label for="bi-industry">業種</label><select id="bi-industry"><option value="">全部業種</option></select><label for="bi-sort">排序</label><select id="bi-sort"><option value="random">骰子隨機探索</option><option value="latest">最新名單</option><option value="match">配對排名</option></select></form>
      <p class="bi-status" data-bi-status role="status" aria-live="polite"></p><button type="button" data-bi-retry data-bi-action="retry" hidden>重新載入</button>
      <div class="bi-list"></div><button type="button" class="bi-more" data-bi-action="more" hidden>載入更多會員</button>
      <div class="bi-post-list" hidden></div><div class="bi-home-card" hidden></div></section></div></section>`;
  }
  function renderMembers() {
    const row = findMember(selected);
    $('.bi-list').innerHTML = members.length ? members.map(item => `<article class="bi-member" data-selected="${item.handle === selected}"><button type="button" class="bi-member-select" data-bi-member="${esc(item.handle)}" aria-pressed="${item.handle === selected}">${avatar(item)}<span class="bi-member-copy"><strong>${esc(item.name || '會員')}</strong><span>${esc([item.company, item.title].filter(Boolean).join(' · '))}</span>${item.memberNumber ? `<small>加入編號：${esc(item.memberNumber)}</small>` : ''}</span></button><div class="bi-member-actions"><button type="button" data-bi-action="card" data-bi-handle="${esc(item.handle)}">查看公開名片</button><button type="button" data-bi-action="chat" data-bi-handle="${esc(item.handle)}">開始交流</button></div></article>`).join('') : '<p class="bi-caption">沒有符合的會員，請調整搜尋或業種。</p>';
    if (row) {
      const score = row.match?.score;
      const match = typeof score === 'number' && Number.isFinite(score) && score >= 0 && score <= 100 ? `<p class="bi-match">${esc(score)}% · ${row.match.source === 'ai' ? 'AI' : '規則'}配對 <small>契合度參考</small></p>` : '';
      $('.bi-selection').innerHTML = `${avatar(row)}<div><h3>${esc(row.name || '會員')}</h3><p>${esc([row.company,row.title].filter(Boolean).join(' · '))}</p>${match}</div><div class="bi-actions"><button type="button" data-bi-action="card">查看公開名片</button><button type="button" data-bi-action="chat" class="bi-primary">開始交流</button></div>`;
    } else $('.bi-selection').replaceChildren();
    $('[data-bi-action="more"]').hidden = zone!=='people'||(sort === 'random' ? !members.length : !next);
    $('[data-bi-action="more"]').textContent = sort === 'random' ? '再探索一批會員' : '載入更多會員';
    $('[data-bi-action="more"]').disabled = busy;
    world?.renderMembers(publicMembers,{selected});
    bindAvatars();
  }
  async function loadPublicMembers(){
    if(!live())return;
    const ticket=generation,request=++publicTicket,cursors=new Set();
    selectionTicket++;closeCard();
    publicBusy=true;publicReady=false;publicMembers=[];updateRollControl();
    $('[data-bi-action="refresh-public"]').disabled=true;
    $('[data-bi-public-status]').textContent='正在邀請公開會員上島…';renderMembers();
    try{
      let after='';
      do{
        const params=new URLSearchParams({scope:'public'});if(after)params.set('after',after);
        const result=await client.request('/members?'+params.toString());
        if(!valid(ticket)||request!==publicTicket)return;
        const incoming=Array.isArray(result.items)?result.items.filter(row=>typeof row.handle==='string').map(row=>({...row,online:row.onlineKnown===true&&row.online===true,onlineKnown:row.onlineKnown===true})):[];
        publicMembers=[...new Map([...publicMembers,...incoming].map(row=>[row.handle,row])).values()];
        after=clean(result.next);
        if(after&&(after.length>800||cursors.has(after)||!incoming.length))throw Error('公開名冊分頁已變更，請重新載入。');
        cursors.add(after);renderMembers();
        $('[data-bi-public-status]').textContent=`已邀請 ${publicMembers.length} 位公開會員${after?'，繼續載入…':'上島'}`;
      }while(after);
      publicReady=true;
      presence?.refresh();
    }catch(error){if(active(ticket)&&request===publicTicket)$('[data-bi-public-status]').textContent=error.message||'公開名冊載入失敗，請更新重試。';}
    finally{if(active(ticket)&&request===publicTicket){publicBusy=false;$('[data-bi-action="refresh-public"]').disabled=false;updateRollControl();renderPublicStatus();}}
  }
  async function loadMembers(append = false) {
    if (!live()) return;
    if (!append) { selectionTicket++; closeCard(); }
    const ticket = generation, request = ++memberTicket;
    const previousHandles = new Set(members.map(row => row.handle));
    busy = true; $('[data-bi-action="more"]').disabled = true;
    note(append ? '載入更多會員…' : '正在尋找會員…');
    try {
      const params = new URLSearchParams({sort});
      if (query) params.set('q',query);
      if (industry) params.set('industry',industry);
      if (sort !== 'random' && append && next) params.set('after',next);
      const result = await client.request('/members?' + params.toString());
      if (!valid(ticket) || request !== memberTicket || zone !== 'people') return;
      const incoming = Array.isArray(result.items) ? result.items.filter(row => typeof row.handle === 'string') : [];
      members = append ? [...new Map([...members,...incoming].map(row => [row.handle,row])).values()] : incoming;
      next = clean(result.next); industries = Array.isArray(result.industries) ? result.industries : [];
      $('#bi-industry').innerHTML = '<option value="">全部業種</option>' + industries.map(value => `<option value="${esc(value)}">${esc(value)}</option>`).join('');
      $('#bi-industry').value = industry;
      if (!findMember(selected)) selected = members[0]?.handle || '';
      renderMembers(); note(append && incoming.length && !incoming.some(row => !previousHandles.has(row.handle)) ? '這一批沒有新增會員，可以繼續擲骰或調整搜尋。' : '');
      return incoming;
    } catch (error) {
      if (active(ticket) && request === memberTicket && zone === 'people') note(error.message || '會員載入失敗，請重試。', true);
    } finally {
      if (active(ticket) && request === memberTicket) { busy = false; $('[data-bi-action="more"]').disabled = false; }
    }
  }
  function chooseMember(handle) {
    if (!live() || rolling || !findMember(handle)) return;
    selectionTicket++; selected = handle;
    if (zone !== 'people') chooseZone('people');
    renderMembers();world?.clearArrival();world?.showArrival(handle);note();
  }
  function chatWithMember(handle){
    if(!live()||actionBusy||zone!=='people'||!publicMembers.some(row=>row.handle===handle))return;
    cancelRoll();chooseMember(handle);void memberAction('chat');
  }
  async function rollDice() {
    if (!live() || rolling || busy || actionBusy || zone !== 'people') return;
    if(!publicReady){$('[data-bi-public-status]').textContent=publicBusy?'公開會員仍在上島，請稍候。':'請先更新公開名冊，再開始探索。';return;}
    void audio?.unlock();
    const ticket = generation, request = ++rollTicket, dice1 = randomIndex(6) + 1, dice2 = randomIndex(6) + 1;
    if (!world) { note('群島場景尚未載入，請重試。',true); return; }
    if (listView) {
      listView=false;root.dataset.view='map';const toggle=$('[data-bi-action="list"]');toggle.textContent='快速清單';toggle.setAttribute('aria-pressed','false');
    }
    world.pause(false);
    rolling = true; selectionTicket++; closeCard();
    const button = $('[data-bi-action="roll"]');
    button.disabled = true; button.textContent = '準備探索…';
    $('.bi-roll-result').textContent='準備走近島上的夥伴…';
    try {
      button.textContent='正在擲骰…';
      let phase='dice';
      const result = await world.roll({dice1,dice2,rows:publicMembers,
        valid:()=>valid(ticket)&&request===rollTicket&&zone==='people'&&!listView,
        onPhase:info=>{
          if(!valid(ticket)||request!==rollTicket)return;
          phase=info.phase;
          if(phase==='cancelled')audio?.stopEffects();
          if(phase==='dice')audio?.play('dice');
          else if(phase==='boarding')audio?.play('depart');
          else if(phase==='arrived')audio?.play('arrive');
          const labels={dice:'正在擲骰…',walking:'走近島上的夥伴…',arrived:'已抵達',cancelled:'探索已暫停，可重新擲骰'};
          button.textContent=labels[phase]||'探索中…';
          $('.bi-roll-result').textContent=labels[phase]||'探索中…';
        },
        onStep:({step,total})=>{if(valid(ticket)&&request===rollTicket){$('.bi-roll-result').textContent=`${dice1} + ${dice2} = ${total} 點 · 前進 ${step} / ${total} 步`;}}
      });
      if (!result || !valid(ticket) || request !== rollTicket || zone !== 'people') return;
      selected=result.handle||'';selectionTicket++;renderMembers();if(selected)world.showArrival(selected);
      rollMessage=selected?`${dice1} + ${dice2} = ${result.total} 點 · 遇見 ${clean(findMember(selected)?.name)||'公開會員'}`:`已探索 ${result.total} 步，本島目前沒有公開會員，可繼續散步。`;
      $('.bi-roll-result').textContent = rollMessage;
    } catch (error) {
      if(active(ticket)&&request===rollTicket)note(error.message||'探索暫時中斷，可以重新擲骰。',true);
    } finally {
      if (active(ticket) && request === rollTicket) {
        rolling = false;updateRollControl();button.textContent = '再擲骰找夥伴';
      }
    }
  }
  async function sailToIsland(category){
    if(!live()||rolling||actionBusy||zone!=='people'||!world)return;
    void audio?.unlock();
    const ticket=generation,request=++rollTicket,button=$('[data-bi-action="roll"]');
    if(listView){listView=false;root.dataset.view='map';const toggle=$('[data-bi-action="list"]');toggle.textContent='快速清單';toggle.setAttribute('aria-pressed','false');}
    world.pause(false);rolling=true;selectionTicket++;closeCard();updateRollControl();
    try{
      const result=await world.sailTo(category,{valid:()=>valid(ticket)&&request===rollTicket&&zone==='people'&&!listView,
        onPhase:info=>{if(!valid(ticket)||request!==rollTicket)return;if(info.phase==='boarding')audio?.play('depart');else if(info.phase==='arrived')audio?.play('arrive');else if(info.phase==='cancelled')audio?.stopEffects();const labels={walking:'步行前往碼頭…',boarding:'正在登船…',sailing:'搭船航行中…',docking:'正在靠岸…',arrived:'已抵達新島',cancelled:'航程已暫停'};button.textContent=labels[info.phase]||'換島中…';$('.bi-roll-result').textContent=labels[info.phase]||'換島中…';}
      });
      if(!result||!valid(ticket)||request!==rollTicket)return;
      selected='';renderMembers();const label=worldModule.CATEGORIES.find(item=>item.id===world.currentIsland())?.label||'新島';rollMessage=`已抵達${label}，可以擲骰走近夥伴，或直接點頭貼對話。`;$('.bi-roll-result').textContent=rollMessage;
    }catch(error){if(active(ticket)&&request===rollTicket)note(error.message||'搭船暫時中斷，可以重試。',true);}
    finally{if(active(ticket)&&request===rollTicket){rolling=false;updateRollControl();button.textContent='擲骰找夥伴';}}
  }
  async function loadPosts() {
    if (!live()) return;
    const ticket = generation, request = ++boardTicket;
    note('正在讀取公開交流內容…');
    try {
      if (typeof window.fetchAPI !== 'function') throw Error('交流內容尚未載入，請重新整理。');
      const result = await window.fetchAPI('listExchangeZonePosts',{limit:30,ownOnly:false},true);
      if (!valid(ticket) || request !== boardTicket || zone !== 'board') return;
      if (!result || result.success === false || result.access?.allowed === false || !Array.isArray(result.posts)) throw Error(result?.error || '公開交流內容讀取失敗，請重試。');
      posts = result.posts;
      $('.bi-post-list').innerHTML = posts.length ? posts.map(post => `<button type="button" class="bi-post" data-bi-post="${esc(post.postHandle)}"><strong>${esc(post.title)}</strong><p>${esc(post.excerpt)}</p><span>${esc(post.author?.name || '會員')} · 查看公開內容</span></button>`).join('') : '<p class="bi-caption">目前沒有公開交流內容。</p>';
      note();
    } catch (error) { if (active(ticket) && request === boardTicket && zone === 'board') note(error.message || '交流內容讀取失敗，請重試。',true); }
  }
  function renderHome() {
    const profile = window.currentUserProfile || {};
    $('.bi-home-card').innerHTML = `${avatar(profile)}<h3>${esc(profile.displayName || '我的小屋')}</h3><p>讓對方認識你，也接續已開始的交流。</p><div class="bi-actions"><button type="button" data-bi-action="my-card">我的名片</button><button type="button" data-bi-action="my-chats">我的聊天</button></div>`;
    bindAvatars();
  }
  function cancelRoll() {
    rollTicket++; rolling = false; world?.cancel(); world?.clearArrival();audio?.stopEffects();
    updateRollControl(); $('[data-bi-action="roll"]').textContent = '擲骰找夥伴';
  }
  function chooseZone(value) {
    if (!['people','board','home'].includes(value) || !live()) return;
    cancelRoll(); zone = value; memberTicket++; boardTicket++; selectionTicket++; busy = false;
    for (const button of root.querySelectorAll('[data-bi-zone]')) button.setAttribute('aria-pressed', String(button.dataset.biZone === zone));
    $('.bi-search').hidden = zone !== 'people'; $('.bi-list').hidden = zone !== 'people'; $('.bi-selection').hidden = zone !== 'people';
    $('[data-bi-action="more"]').hidden = zone !== 'people' || (sort === 'random' ? !members.length : !next);
    $('.bi-explore').hidden = zone !== 'people';
    $('.bi-public-roster').hidden=zone!=='people';
    $('.bi-post-list').hidden = zone !== 'board'; $('.bi-home-card').hidden = zone !== 'home';
    $('.bi-map').hidden = zone !== 'people';world?.pause(zone!=='people'||listView);
    if(zone==='people')void audio?.resume();else audio?.pause();
    $('[data-bi-title]').textContent = {people:'人脈廣場',board:'合作告示板',home:'我的小屋'}[zone];
    $('[data-bi-caption]').textContent = {people:'選擇會員，查看公開名片或開始交流',board:'看看大家正在分享的服務與合作方向',home:'維護自己的介紹，接續每一次交流'}[zone];
    note();
    if (zone === 'people') { if (!members.length) void loadMembers(); else {renderMembers();if(!listView&&selected)world?.showArrival(selected);} }
    else if (zone === 'board') void loadPosts();
    else renderHome();
    if(!publicReady&&!publicBusy)void loadPublicMembers();
  }
  function showCard(card) {
    closeCard();
    const opener = document.activeElement;
    dialog = document.createElement('dialog'); dialog.className = 'bi-card-dialog';
    dialog.setAttribute('aria-label','公開名片');
    const image = safeUrl(card.imageUrl);
    const links = (Array.isArray(card.buttons) ? card.buttons : []).map(item => ({label:clean(item.label),url:safeUrl(item.url,true)})).filter(item => item.url);
    dialog.innerHTML = `<header class="bi-dialog-header"><h2>公開名片</h2><button type="button">關閉 ×</button></header><div class="bi-card-body">${image ? `<img src="${esc(image)}" alt="${esc(card.name || '公開名片')}" referrerpolicy="no-referrer">` : ''}<h3>${esc(card.name || '會員')}</h3><p>${esc([card.companyName,card.title].filter(Boolean).join(' · '))}</p><p class="bi-prewrap">${esc(card.description || card.services)}</p><div class="bi-card-links">${links.map(item => `<a href="${esc(item.url)}" target="_blank" rel="noopener noreferrer">${esc(item.label || '聯絡')}</a>`).join('')}</div></div>`;
    const close = () => { closeCard(); opener?.focus?.(); };
    dialog.querySelector('button').addEventListener('click',close);
    dialog.addEventListener('cancel',event => {event.preventDefault();close();});
    dialog.querySelector('img')?.addEventListener('error',event => event.target.remove(),{once:true});
    document.body.append(dialog); dialog.showModal();
  }
  async function memberAction(action) {
    if (!live() || rolling || actionBusy || !selected) return;
    const row = findMember(selected); if (!row) return;
    const ticket = generation, selection = selectionTicket, handle = row.handle;
    actionBusy = true;
    for (const button of root.querySelectorAll('.bi-selection button')) button.disabled = true;
    note(action === 'card' ? '正在讀取公開名片…' : '正在開啟交流…');
    try {
      if (action === 'card') {
        const result = await client.request('/members/' + encodeURIComponent(handle) + '/card');
        if (!valid(ticket) || selection !== selectionTicket || selected !== handle || zone !== 'people') return;
        if (!result.card) throw Error('對方目前沒有可查看的公開名片');
        showCard(result.card); note();
      } else {
        const result = await client.request('/threads',{cardHandle:handle});
        if (!valid(ticket) || selection !== selectionTicket || selected !== handle || zone !== 'people') return;
        if (typeof window.openExchangeZone !== 'function') throw Error('交流功能尚未載入，請重新整理。');
        await window.openExchangeZone({tab:'threads',threadId:result.id});
        if (valid(ticket)) note();
      }
    } catch (error) { if (active(ticket) && selection === selectionTicket) note(error.message || '目前無法開啟，請重試。'); }
    finally { if (active(ticket)) { actionBusy = false; for (const button of root.querySelectorAll('.bi-selection button')) button.disabled = false; } }
  }
  function bind() {
    $('.bi-search').addEventListener('submit',event => {event.preventDefault();cancelRoll();query=$('#bi-query').value.trim();industry=$('#bi-industry').value;sort=$('#bi-sort').value;next='';void loadMembers();});
    $('#bi-industry').addEventListener('change',() => $('.bi-search').requestSubmit());
    $('#bi-sort').addEventListener('change',() => $('.bi-search').requestSubmit());
    root.onclick = async event => {
      const button = event.target.closest('button'); if (!button || !root.contains(button)) return;
      if (button.dataset.biZone) { chooseZone(button.dataset.biZone); return; }
      if (button.dataset.biMember) { chooseMember(button.dataset.biMember); return; }
      const action = button.dataset.biAction;
      if (action === 'exit') { const exit = exitAction; window.leaveBusinessIsland(); if (exit) exit(); else window.goPage('home'); return; }
      if (action === 'retry') { if (!valid(generation)) await window.initBusinessIsland(); else if (zone === 'people') await loadMembers(); else if (zone === 'board') await loadPosts(); return; }
      if (!live()) return;
      if (action === 'list') { cancelRoll();listView = !listView; root.dataset.view = listView ? 'list' : 'map'; button.textContent=listView?'回到島嶼':'快速清單';button.setAttribute('aria-pressed',String(listView));world?.pause(listView);if(!listView&&selected)world?.showArrival(selected); }
      else if(action==='music'&&audio){const enabled=!audio.settings.music;audio.setMusicEnabled(enabled);if(enabled)void audio.unlock();}
      else if(action==='sound'&&audio){const enabled=!audio.settings.sound;audio.setSoundEnabled(enabled);if(enabled)void audio.resume();}
      else if(action==='refresh-public'){cancelRoll();void loadPublicMembers();}
      else if (action === 'roll') await rollDice();
      else if (action === 'more' && !busy && !rolling && (next || sort === 'random')) await loadMembers(true);
      else if (action === 'card' || action === 'chat') { if (button.dataset.biHandle) chooseMember(button.dataset.biHandle); await memberAction(action); }
      else if (action === 'my-card') { if (typeof window.openMyCardSettings === 'function') window.openMyCardSettings(); else note('名片功能尚未載入，請重新整理。'); }
      else if (action === 'my-chats') { if (typeof window.openExchangeZone === 'function') await window.openExchangeZone({tab:'threads'}); else note('交流功能尚未載入，請重新整理。'); }
      else if (button.dataset.biPost && posts?.some(post => post.postHandle === button.dataset.biPost)) {
        const ticket = generation;
        try {
          if (typeof window.openExchangeZone !== 'function' || typeof window.openExchangeZonePost !== 'function') throw Error('交流內容尚未載入，請重新整理。');
          await window.openExchangeZone({tab:'public'});
          if (valid(ticket) && zone === 'board') await window.openExchangeZonePost(button.dataset.biPost,button);
        } catch (error) { if (active(ticket)) note(error.message); }
      }
    };
  }
  window.leaveBusinessIsland = function () {
    generation++; memberTicket++; publicTicket++; selectionTicket++; boardTicket++; rollTicket++;
    presence?.destroy();presence=null;
    if(world){savedScrollTop=document.getElementById('main')?.scrollTop||0;world.cancel();worldState=world.snapshot();}
    audio?.destroy();audio=null;
    client?.close(); client = null; world?.destroy();world=null;busy = false;publicBusy=false;actionBusy = false; initializing = false; rolling = false; closeCard();
  };
  window.addEventListener('pagehide', window.leaveBusinessIsland);
  window.addEventListener('pageshow', event => {
    if (event.persisted && window.currentPage === 'business-island' && root && !root.classList.contains('hidden')) void window.initBusinessIsland({onExit:exitAction});
  });
  window.openBusinessIsland = function (options = {}) {
    window.leaveBusinessRichman?.();
    window.goPage('business-island',true);
    return window.initBusinessIsland(options);
  };
  window.initBusinessIsland = async function (options = {}) {
    window.leaveBusinessIsland();
    root = document.getElementById('page-business-island'); if (!root) return;
    initializing = true;
    const changedOwner = activeOwner !== owner(); activeOwner = owner();
    const main = document.getElementById('main'), scrollTop = changedOwner ? 0 : worldState ? savedScrollTop : main?.scrollTop || 0;
    if (changedOwner) { members=[];publicMembers=[];industries=[];next='';selected='';posts=null;query='';industry='';sort='random';zone='people';listView=false;rollMessage='';worldState=null;savedScrollTop=0;heartbeatClock={at:-Infinity}; }
    publicReady=false;
    presenceStatus='checking';
    exitAction = typeof options.onExit === 'function' ? options.onExit : null;
    if (!document.querySelector('link[data-business-island]')) {
      const style = document.createElement('link');style.rel='stylesheet';style.href=asset('css/business-island.css?v=7');style.dataset.businessIsland='';
      styleReady = new Promise((resolve,reject) => {
        style.addEventListener('load',resolve,{once:true});
        style.addEventListener('error',()=>{style.remove();styleReady=null;reject(Error('人脈島樣式載入失敗，請重試。'));},{once:true});
      });
      document.head.append(style);
    }
    root.innerHTML=markup();root.dataset.view=listView?'list':'map'; bind();
    $('[data-bi-action="list"]').textContent=listView?'回到島嶼':'快速清單';
    $('[data-bi-action="list"]').setAttribute('aria-pressed',String(listView));
    $('#bi-query').value=query;$('#bi-sort').value=sort;
    $('#bi-industry').innerHTML = '<option value="">全部業種</option>' + industries.map(value => `<option value="${esc(value)}">${esc(value)}</option>`).join(''); $('#bi-industry').value=industry;
    const ticket = generation;
    note('正在連接人脈島…');
    try {
      const [module,scene,sound,pulse] = await Promise.all([import(new URL('member-chat.js?v=15',scriptUrl).href),import(new URL('business-island-world.mjs?v=5',scriptUrl).href),import(new URL('business-island-audio.mjs?v=1',scriptUrl).href),import(new URL('business-island-presence.mjs?v=1',scriptUrl).href),styleReady]);
      if (!active(ticket)) return;
      client=module.createChatClient({base:window.Config?.WORKER_URL||window.WORKER_URL,isCurrent:()=>active(ticket)});
      audio=sound.createIslandAudio({isCurrent:()=>valid(ticket),onState:state=>{if(active(ticket))renderAudioState(state);}});
      worldModule=scene;
      world=scene.createIslandWorld({host:$('.bi-stage'),diceHost:$('.bi-dice'),asset,avatar,profile:window.currentUserProfile,
        isCurrent:()=>valid(ticket),onMember:chooseMember,onChat:chatWithMember,onSail:sailToIsland,
        onCategory:id=>{if(!live()||rolling)return;const row=publicMembers.find(item=>worldModule.classifyMember(item)===id);if(row)chooseMember(row.handle);else $('.bi-roll-result').textContent='這座島目前沒有公開會員，仍可自由散步。';}
      });
      initializing = false;
      presence=pulse.createIslandPresence({client,getMembers:()=>publicReady?publicMembers:[],isCurrent:()=>valid(ticket),isVisible:()=>active(ticket),heartbeatClock,
        onUpdate:statuses=>{if(!valid(ticket))return;const byHandle=new Map(statuses.map(row=>[row.handle,row]));publicMembers=publicMembers.map(row=>{const status=byHandle.get(row.handle);return status?{...row,online:status.online,onlineKnown:status.onlineKnown}:row;});world?.renderMembers(publicMembers,{selected});renderPublicStatus();},
        onState:state=>{if(valid(ticket)){presenceStatus=state;renderPublicStatus();}}
      });
      world.renderMembers(publicMembers,{selected});
      chooseZone(zone);
      presence.refresh();
      if(worldState){world.restore(worldState);if(selected)world.showArrival(selected);}
      if (main) main.scrollTop = scrollTop;
    } catch (error) { if (active(ticket)) note(error.message||'人脈島載入失敗，請重試。',true); }
    finally { if (active(ticket)) initializing = false; }
  };
})();
