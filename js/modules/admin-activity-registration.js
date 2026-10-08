/* Admin-only view over the existing mobile activity/registrant APIs. */
(function () {
  'use strict';
  const state = { mounted: false, listRequest: 0, rosterRequest: 0, selected: '', rows: null, busy: false, counts: new Map() };
  let creation = null;
  let editLink = null;
  let editDm = null;
  const $ = id => document.getElementById(id);
  const text = value => String(value ?? '');
  const esc = value => text(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const pick = (row, keys, fallback = '') => {
    for (const key of keys) if (row?.[key] !== undefined && row[key] !== null && row[key] !== '') return row[key];
    return fallback;
  };
  const activityId = row => text(pick(row, ['活動ID', 'activityId', 'rowId']));
  const title = row => text(pick(row, ['活動名稱', 'activityName', 'name'], '未命名活動'));
  const network = row => text(pick(row, ['歸屬網', 'networkId', '建立者ID', 'creatorId', 'userId'], 'admin'));
  const status = row => pick(row, ['狀態', 'status'], '上架') === '下架' ? '下架' : '上架';
  const seriesId = row => text(pick(row, ['seriesId', 'series_id']));
  const isSeries = row => row?.isBatch === true || /^(true|1)$/i.test(text(pick(row, ['是否系列', 'is_series'])));
  // New forms contain their own options. Group legacy child rows only for compatibility.
  // Orphans stay visible if the parent is absent (e.g. the API's 500-row limit).
  function activityForms(rows) {
    const key = row => JSON.stringify([network(row), activityId(row)]);
    const parents = new Map(rows.filter(row => !seriesId(row) && isSeries(row)).map(row => [key(row), {...row, formBatches: [...(row.batches || [])]}]));
    const parentFor = row => parents.get(JSON.stringify([network(row), seriesId(row)]));
    for (const row of rows) if (seriesId(row) && parentFor(row)) parentFor(row).formBatches.push(row);
    for (const parent of parents.values()) parent.formBatches.sort((a,b) => text(pick(a,['開始時間','startTime'])).localeCompare(text(pick(b,['開始時間','startTime']))));
    const seen = new Set();
    return rows.flatMap(row => {
      const form = (seriesId(row) ? parentFor(row) : parents.get(key(row))) || row;
      const id = key(form);
      if (seen.has(id)) return [];
      seen.add(id); return [form];
    });
  }
  const date = value => text(value).replace('T', ' ').slice(0, 10);
  function list(result) {
    if (!result || result.success === false) return null;
    if (Array.isArray(result)) return result;
    for (const key of ['data', 'items', 'activities', 'registrations']) if (Array.isArray(result[key])) return result[key];
    return null;
  }
  function registrant(row) {
    const checked = pick(row, ['簽到', 'checkedIn', 'checkinStatus'], false);
    const payment = text(pick(row, ['付款狀態', '繳費狀態', 'paymentStatus']));
    const amount = Number(pick(row, ['金額', 'amount'], 0)) || 0;
    return {
      id: text(pick(row, ['rowId', 'registrationId', '報名ID'])),
      name: text(pick(row, ['姓名', 'name'], '未命名')),
      activityName: text(pick(row, ['活動名稱','activityName'])),
      phone: text(pick(row, ['手機', '電話', 'phone'])),
      identity: text(pick(row, ['身份', 'identity'], '會員')),
      cancelled: row.status === 'cancelled' || row['報名狀態'] === '已取消',
      checked: checked === true || /^(true|1)$/i.test(text(checked)),
      paid: ['已付款', '已繳費'].includes(payment), payment, amount,
      time: text(pick(row, ['nfcCheckinTime', '簽到時間', 'checkedInAt']))
    };
  }
  function summary(rows) {
    const active = rows.filter(row => !row.cancelled);
    return { active: active.length, checked: active.filter(row => row.checked).length,
      unpaid: active.filter(row => row.amount > 0 && !row.paid).length,
      cancelled: rows.length - active.length };
  }
  function filterActivities(rows, filters) {
    const query = text(filters.query).trim().toLocaleLowerCase();
    return rows.filter(row => {
      return (!filters.network || filters.network === 'all' || network(row) === filters.network) &&
        (!filters.status || filters.status === 'all' || status(row) === filters.status) &&
        [row, ...(row.formBatches || [])].some(item => {
          const start = date(pick(item, ['開始時間', 'startTime']));
          return (!query || `${title(row)} ${title(item)} ${activityId(item)}`.toLocaleLowerCase().includes(query)) &&
            (!filters.from || (start && start >= filters.from)) && (!filters.to || (start && start <= filters.to));
        });
    });
  }
  function filterRegistrants(rows, filters) {
    const query = text(filters.query).trim().toLocaleLowerCase();
    return rows.filter(row => (!query || `${row.name} ${row.phone} ${row.id}`.toLocaleLowerCase().includes(query)) &&
      (!filters.state || filters.state === 'all' || (filters.state === 'cancelled' ? row.cancelled :
        !row.cancelled && (filters.state === 'active' || (filters.state === 'checked' ? row.checked : !row.checked)))) &&
      (!filters.payment || filters.payment === 'all' || (filters.payment === 'paid' ? row.paid : filters.payment === 'free' ? row.amount === 0 : row.amount > 0 && !row.paid)));
  }
  function csv(titleValue, rows) {
    // Prefix formula-like values and phone numbers with an apostrophe; never use ="..." formulas.
    const cell = value => '"' + (/^[\s]*[=+\-@\t\r\n]/.test(text(value)) ? "'" : '') + text(value).replace(/"/g, '""') + '"';
    return '\ufeff' + [['活動名稱','姓名','電話','身份','付款狀態','報名狀態','簽到狀態','簽到時間','報名編號'],
      ...rows.map(row => [row.activityName || titleValue,row.name,row.phone ? "'" + row.phone : '',row.identity,row.payment,
        row.cancelled ? '已取消' : '有效',row.checked ? '已簽到' : '未簽到',row.time,row.id])]
      .map(row => row.map(cell).join(',')).join('\r\n');
  }
  function countFor(row) {
    if (state.counts.has(activityId(row))) return state.counts.get(activityId(row));
    const value = pick(row, ['報名人數', 'registrantCount'], null);
    return value !== null && Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : null;
  }
  const stats = entries => entries.map(([label, value]) => `<div class="aar-stat"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`).join('');
  function activityDescription(description, location = '', scheduleText = '') {
    const body = text(description).trim(), place = text(location).trim(), schedule = text(scheduleText).trim();
    const compact = value => value.replace(/\s+/g,'');
    const parts = [];
    if (place && !compact(body).includes(compact(place))) parts.push(`活動地點：${place}`);
    if (schedule && !compact(body).includes(compact(schedule))) parts.push(`DM 活動時間原文：${schedule}`);
    if (body) parts.push(body);
    return parts.join('\n\n');
  }
  function creationPayload(values, id) {
    const name = text(values.activityName).trim();
    if (!name) throw new Error('請填寫活動名稱');
    const series = values.isBatch === true;
    const batches = series ? validateBatches(values.batches) : [];
    const start = series ? batches.map(b=>b.startTime).sort()[0] : text(values.startTime), end = series ? '' : text(values.endTime);
    const validTime = validBatchTime;
    if (!validTime(start)) throw new Error('請填寫活動開始日期與時間');
    if (end && (!validTime(end) || end <= start)) throw new Error('結束時間必須晚於開始時間');
    const price = series ? Math.max(...batches.map(b=>b.price)) : Number(values.price);
    if (!Number.isSafeInteger(price) || price < 0 || (!series && text(values.price).trim() === '')) throw new Error('金額請填 0 或正整數');
    const imageUrl = text(values.imageUrl).trim();
    if (imageUrl) {
      let url; try { url = new URL(imageUrl); } catch (_) { throw new Error('宣傳圖請使用完整的 http / https 網址'); }
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('宣傳圖請使用完整的 http / https 網址');
    }
    const description = activityDescription(values.description,values.location);
    if (description.length > 10000) throw new Error('活動地點與說明合計請勿超過 10000 字');
    return { activityId: id, activityName: name, activityType: text(values.activityType).trim() || '活動',
      startTime: start.replace('T',' '), endTime: end.replace('T',' '), price, feeType: price > 0 ? '收費' : '免費',
      description, imageUrl,
      imageRatio: ['16:9','1:1','2:3'].includes(values.imageRatio) ? values.imageRatio : '16:9',
      status: values.status === '下架' ? '下架' : '上架', names: [], isBatch: series, ...(series?{batches}:{}), nfcCheckinSameDayOnly: true };
  }
  function validBatchTime(value) {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return false;
    const d=new Date(value+':00Z');return Number.isFinite(d.getTime()) && d.toISOString().slice(0,16)===value;
  }
  function validateBatches(rows) {
    if (!Array.isArray(rows) || !rows.length || rows.length>24) throw Error('請勾選 1–24 個梯次');
    const keys=new Set();
    return rows.map((b,i)=>{
      const name=text(b.name).trim(),startTime=text(b.startTime).replace(' ','T'),endTime=text(b.endTime).replace(' ','T'),price=Number(b.price);
      if(!name || !validBatchTime(startTime))throw Error(`第 ${i+1} 個勾選梯次需填寫名稱與完整開始時間`);
      if(endTime && (!validBatchTime(endTime)||endTime<=startTime))throw Error('梯次結束時間必須晚於開始時間');
      if(b.price===null||text(b.price).trim()===''||!Number.isSafeInteger(price)||price<0)throw Error('請確認每個勾選梯次的費用（免費填 0）');
      if(keys.has(name+startTime))throw Error('請勿重複勾選相同梯次');keys.add(name+startTime);
      return {name,startTime,endTime,price};
    });
  }
  function slotMarkup(b,i) {
    return `<div class="aar-slot" data-slot data-slot-source="${esc(b.scheduleText||'')}"><label class="aar-slot-check"><input type="checkbox" data-slot-select checked> 梯次 ${i+1}</label><p class="aar-note">${esc(b.scheduleText || '請依 DM 核對時段')}</p>
      <label>梯次名稱<input data-slot-field="name" maxlength="120" value="${esc(b.name||`第 ${i+1} 梯次`)}"></label>
      <label>開始時間 *<input data-slot-field="startTime" type="datetime-local" value="${esc(b.startTime)}"></label>
      <label>結束時間<input data-slot-field="endTime" type="datetime-local" value="${esc(b.endTime)}"></label>
      <label>此梯次費用（免費填 0）<input data-slot-field="price" type="number" min="0" step="1" value="${esc(b.price)}"></label></div>`;
  }
  function renderSlots(container,batches) {
    container.innerHTML=batches.slice(0,24).map(slotMarkup).join('');
    container.onchange=event=>{
      if(event.target.matches('[data-slot-select]'))event.target.closest('[data-slot]').querySelectorAll('[data-slot-field]').forEach(input=>{input.disabled=!event.target.checked;});
    };
  }
  function selectedSlots(container) {
    return [...container.querySelectorAll('[data-slot]')].filter(row=>row.querySelector('[data-slot-select]').checked)
      .map(row=>({scheduleText:row.dataset.slotSource||'',...Object.fromEntries([...row.querySelectorAll('[data-slot-field]')].map(input=>[input.dataset.slotField,input.value]))}));
  }
  function syncSeriesMode() {
    const form=$('aar-create-form'),series=form.elements.seriesMode.checked;
    $('aar-create-slots').hidden=!series;
    for(const key of ['startTime','endTime','price']) {form.elements[key].disabled=series;form.elements[key].closest('label').hidden=series;}
    form.elements.startTime.required=!series;form.elements.price.required=!series;
  }
  function closeCreate() {
    if (!creation || creation.busy) return;
    $('aar-create-dialog').close();
    // An uncertain submission is retained when closed, so reopening cannot silently create a second event.
    if (!creation.payload) { $('aar-create-dialog').remove(); creation = null; }
  }
  function openCreate() {
    if (!['admin','store'].includes(adminRole)) return;
    if ($('aar-create-dialog')) { $('aar-create-dialog').showModal(); return; }
    creation = { id: 'ACT_' + crypto.randomUUID(), payload: null, busy: false, uploadFailed: false, aiImage: '', aiDraft: null };
    const dialog = document.createElement('dialog');
    dialog.id = 'aar-create-dialog'; dialog.className = 'aar-create'; dialog.setAttribute('aria-labelledby','aar-create-title');
    dialog.innerHTML = `<form id="aar-create-form">
      <header class="aar-head"><div><h2 id="aar-create-title">新增活動</h2><p class="aar-note">建立後與手機端同步；不會自動新增報名者或發送通知。</p></div><button type="button" class="aar-button" data-create-close aria-label="關閉新增活動">✕</button></header>
      <div class="aar-create-body"><fieldset class="aar-filters" id="aar-create-fields">
        <section class="aar-ai aar-wide" aria-label="AI 活動上架助手">
          <h3>✨ AI 活動上架助手</h3><p class="aar-note">重點擷取活動名稱、時間、地點與活動說明；先核對原圖，再確認上架，也可以直接手動填寫。</p>
          <label>上傳活動 DM／宣傳圖<input name="imageFile" type="file" accept="image/jpeg,image/png,image/webp"><span class="aar-note">JPG / PNG / WebP；AI 辨識限 4 MB，僅上傳宣傳圖限 10 MB。</span></label>
          <img id="aar-ai-image" alt="活動 DM 預覽" hidden>
          <button type="button" class="aar-button aar-primary" id="aar-ai-read" disabled>AI 讀取 DM 並整理活動資料</button>
          <p id="aar-ai-status" class="aar-status" role="status">AI 只產生草稿，不會自動上架。</p>
          <div id="aar-ai-preview" hidden><h3>活動核心資料核對</h3><p class="aar-note">多時段套用後會列出梯次勾選，請逐項核對後建立。</p><div id="aar-ai-content"></div><button type="button" class="aar-button" id="aar-ai-apply">套用草稿到下方表單</button></div>
        </section>
        <label class="aar-wide">活動名稱 *<input name="activityName" required maxlength="120" placeholder="例如：商務交流講座"></label>
        <label>活動類型<input name="activityType" value="活動" maxlength="40"></label>
        <label>上架狀態<select name="status"><option value="上架">上架（開放報名）</option><option value="下架">草稿（暫不上架）</option></select></label>
        <label class="aar-wide aar-slot-check"><input name="seriesMode" type="checkbox">同一張報名表提供多個梯次（可複選）</label>
        <section id="aar-create-slots" class="aar-wide aar-dm-panel" hidden><p>勾選要建立的梯次；未勾選不建立。缺漏時間與費用請自行補齊。</p><div id="aar-slot-list"></div><button type="button" class="aar-button" id="aar-add-slot">＋新增梯次</button></section>
        <label>開始時間 *<input name="startTime" type="datetime-local" required></label><label>結束時間<input name="endTime" type="datetime-local"></label>
        <label class="aar-wide">活動地點<input name="location" maxlength="300" placeholder="場地名稱、完整地址、樓層／室號或線上平台"></label>
        <label class="aar-wide">活動說明<textarea name="description" rows="6" maxlength="10000" placeholder="活動主題、內容、講者、議程與注意事項"></textarea></label>
        <label>金額（免費填 0）<input name="price" type="number" min="0" step="1" value="0" required></label>
        <label>宣傳圖版型<select name="imageRatio"><option value="16:9">橫式 16:9</option><option value="1:1">正方 1:1</option><option value="2:3">滿版 2:3</option></select></label>
        <label class="aar-wide">宣傳圖網址<input name="imageUrl" type="url" placeholder="https://…（選填）"></label>
        <label class="aar-wide aar-ai-review" id="aar-ai-review" hidden><input name="aiReviewed" type="checkbox">我已核對活動名稱、時間、地點、說明與費用，並完成必要修正</label>
      </fieldset></div>
      <footer><p id="aar-create-status" class="aar-status" role="status"></p><div class="aar-actions"><button type="button" class="aar-button" data-create-close>取消</button><button type="submit" class="aar-button aar-primary" id="aar-create-submit">建立活動</button></div></footer>
    </form>`;
    $('tab-activities').appendChild(dialog);
    dialog.querySelectorAll('[data-create-close]').forEach(button => button.addEventListener('click',closeCreate));
    dialog.addEventListener('cancel',event=>{event.preventDefault();closeCreate();});
    $('aar-create-form').addEventListener('submit',event=>{event.preventDefault();void submitCreate();});
    dialog.querySelector('[name="imageFile"]').addEventListener('change',event=>{void uploadCreateImage(event.target);});
    dialog.querySelector('[name="imageUrl"]').addEventListener('input',()=>{creation.uploadFailed=false;});
    $('aar-ai-read').addEventListener('click',()=>{void readActivityDm();});
    $('aar-ai-apply').addEventListener('click',applyActivityDraft);
    dialog.querySelector('[name="seriesMode"]').addEventListener('change',syncSeriesMode);
    $('aar-add-slot').onclick=()=>{const n=$('aar-slot-list').children.length;if(n<24)$('aar-slot-list').insertAdjacentHTML('beforeend',slotMarkup({},n));};
    $('aar-create-fields').addEventListener('input',event=>{
      if (event.target.name !== 'aiReviewed' && !$('aar-ai-review').hidden) $('aar-create-form').elements.aiReviewed.checked=false;
    });
    dialog.showModal();
  }
  function lockCreate(busy) {
    creation.busy = busy;
    $('aar-create-fields').disabled = busy || !!creation.payload;
    $('aar-create-dialog').querySelectorAll('button').forEach(button=>{button.disabled=busy;});
    $('aar-ai-read').disabled = busy || !!creation.payload || !creation.aiImage;
    $('aar-ai-apply').disabled = busy || !!creation.payload || !creation.aiDraft;
  }
  async function readActivityDm() {
    if (!creation || creation.busy || creation.payload || !creation.aiImage) return;
    lockCreate(true); creation.aiDraft=null; $('aar-ai-preview').hidden=true;
    message('aar-ai-status','AI 正在辨識 DM，可能需要約 30–45 秒，請勿重複送出…');
    try {
      const result = await fetchAPI('extractActivityDmDraft',{base64Image:creation.aiImage},{silent:true,timeoutMs:55000});
      const draft = result?.draft || result?.data?.draft;
      if (!result || result.success === false || !draft?.activityName) throw new Error('AI 未完成辨識，原表單未變更。請重新辨識或手動填寫。');
      creation.aiDraft = draft;
      $('aar-ai-content').innerHTML = `<dl>${[
        ['活動名稱',draft.activityName],['活動時間原文',draft.scheduleText],
        ['開始時間',draft.startTime],['結束時間',draft.endTime],
        ['活動地點',draft.location],['活動說明',draft.description],['類型',draft.activityType],
        ['費用',draft.price === null || draft.price === undefined ? '' : draft.price === 0 ? '免費（0 元）' : `NT$ ${draft.price}`]
      ].map(([label,value])=>`<dt>${esc(label)}</dt><dd>${esc(value || '待人工補充')}</dd>`).join('')}</dl>`;
      $('aar-ai-preview').hidden=false;
      message('aar-ai-status',`請先核對活動名稱、時間、地點與說明。${text(draft.confidenceNote) || '資料及費用仍須人工確認。'}`);
    } catch(error) { message('aar-ai-status',error.message,true); }
    finally { $('aar-ai-read').textContent='重新辨識 DM';lockCreate(false); }
  }
  function applyActivityDraft() {
    if (!creation || creation.busy || creation.payload || !creation.aiDraft) return;
    const form = $('aar-create-form'), draft = creation.aiDraft;
    const hasEdits = ['activityName','startTime','endTime','location','description'].some(key=>form.elements[key].value.trim()) ||
      !['','活動'].includes(form.elements.activityType.value.trim()) || !['','0'].includes(form.elements.price.value);
    if (hasEdits && !window.confirm('套用 AI 草稿會取代下方名稱、時間、地點、說明、類型與費用，確定套用嗎？')) return;
    for (const key of ['activityName','activityType','startTime','endTime','location']) form.elements[key].value=text(draft[key]);
    form.elements.price.value = draft.price === null || draft.price === undefined ? '' : text(draft.price);
    form.elements.description.value=activityDescription(draft.description,'',draft.scheduleText);
    form.elements.seriesMode.checked=draft.timeStatus==='multiple' || draft.batches?.length>1;
    renderSlots($('aar-slot-list'),draft.batches || []);syncSeriesMode();
    $('aar-ai-review').hidden=false; form.elements.aiReviewed.required=true; form.elements.aiReviewed.checked=false;
    message('aar-ai-status',`已套用草稿。${text(draft.confidenceNote)} 請核對名稱、時間、地點、說明與費用，再按「建立活動」。`);
    form.elements.activityName.focus();
  }
  async function uploadCreateImage(input) {
    const file = input.files?.[0];
    if (!file || !creation || creation.busy || creation.payload) return;
    creation.uploadFailed = true;
    creation.aiImage='';creation.aiDraft=null;$('aar-ai-preview').hidden=true;$('aar-ai-image').hidden=true;
    $('aar-ai-image').removeAttribute('src');$('aar-ai-read').disabled=true;
    message('aar-ai-status','請先完成圖片上傳，再以 AI 整理內容。');
    if (!['image/jpeg','image/png','image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024) {
      message('aar-create-status','請選擇 10 MB 以內的 JPG / PNG / WebP 圖片，或直接填寫圖片網址。',true);input.value='';return;
    }
    lockCreate(true);message('aar-create-status','正在上傳宣傳圖，請稍候…');
    try {
      const base64Image = await new Promise((resolve,reject)=>{
        const reader = new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('讀取圖片失敗'));reader.readAsDataURL(file);
      });
      const result = await fetchAPI('uploadImageToR2',{base64Image},{silent:true});
      const url = text(result?.url || result?.data?.url);
      if (!/^https?:\/\//i.test(url)) throw new Error('圖片上傳失敗，請重新選圖或填寫圖片網址後再建立。');
      $('aar-create-form').elements.imageUrl.value=url;
      $('aar-ai-image').src=base64Image;$('aar-ai-image').hidden=false;
      creation.aiImage = file.size <= 4 * 1024 * 1024 ? base64Image : '';
      message('aar-ai-status',creation.aiImage ? '圖片已就緒，按「AI 讀取 DM 並整理活動資料」。' : '圖片已上傳；若要 AI 辨識，請改選 4 MB 以內圖片。');
      creation.uploadFailed=false;message('aar-create-status','宣傳圖已上傳，請完成表單後按「建立活動」。');
    } catch(error) { message('aar-create-status',error.message,true); }
    finally { input.value='';lockCreate(false); }
  }
  async function submitCreate() {
    if (!creation || creation.busy || !['admin','store'].includes(adminRole)) return;
    if (creation.uploadFailed) { message('aar-create-status','宣傳圖尚未上傳成功，請重新選圖或填寫圖片網址。',true);return; }
    const form = $('aar-create-form');
    if (!creation.payload && !form.reportValidity()) return;
    const boundCreation=creation,uid=text(adminProfile?.userId),token=editAccessToken();
    const formValues=creation.payload?null:{...Object.fromEntries(new FormData(form)),isBatch:form.elements.seriesMode.checked,batches:selectedSlots($('aar-slot-list'))};
    lockCreate(true);
    try {
      if (!creation.payload) {
        const payload=creationPayload(formValues,creation.id);
        const visibility=await window.chooseActivityVisibility({isCurrent:()=>creation===boundCreation && $('aar-create-dialog')?.open && text(adminProfile?.userId)===uid && editAccessToken()===token});
        if (!visibility) return;
        payload.visibility=visibility;payload.createOnly=true;creation.payload=payload;
      }
      if (creation!==boundCreation || text(adminProfile?.userId)!==uid || editAccessToken()!==token) throw Error('登入或活動已變更，請重新開啟');
      message('aar-create-status','正在建立活動…');$('aar-create-submit').textContent='建立中…';
      // Same mobile creation action. Empty names avoids registration side effects; retry reuses this ID and snapshot.
      const result = await fetchAPI('bulkAddRegistrants',structuredClone(creation.payload),{silent:true});
      if (!result || result.success === false || !activityId(result)) throw new Error('尚未確認是否建立成功。請勿另建一筆；可按「重試同一筆建立」，或關閉後再回來繼續。');
      const published = creation.payload.status === '上架';
      $('aar-create-dialog').close();$('aar-create-dialog').remove();creation=null;
      ['aar-activity-query','aar-activity-from','aar-activity-to'].forEach(id=>{$(id).value='';});
      $('act-tenant-filter').value='all';$('aar-activity-state').value='all';
      showToast(published ? '活動已建立並上架' : '活動草稿已建立，暫不上架');
      await load();
    } catch(error) {
      if (!creation) return;
      message('aar-create-status',error.message,true);$('aar-create-submit').textContent='重試同一筆建立';
    } finally { if (creation) lockCreate(false); }
  }
  function draftMarkup(draft) {
    return `<dl>${[['活動名稱',draft.activityName],['活動時間原文',draft.scheduleText],['活動地點',draft.location],['活動說明',draft.description],['開始時間',draft.startTime],['結束時間',draft.endTime],['費用',draft.price]]
      .map(([label,value])=>`<dt>${label}</dt><dd>${esc(value === 0 ? '免費（0 元）' : value || '待人工補充')}</dd>`).join('')}</dl>`;
  }
  function clearEditDm() { editDm?.listeners?.abort();editDm=null; if($('edit-a-ai'))$('edit-a-ai').replaceChildren(); }
  function editDmCurrent(s) {
    return editDm===s && $('edit-a-id')?.value===s.id && !$('modal-activity-edit').classList.contains('hidden') &&
      text(adminProfile?.userId)===s.uid && editAccessToken()===s.token;
  }
  function editAccessToken() { try{return text(window.liff?.getAccessToken?.());}catch(_){return '';} }
  function mountEditDm(activity) {
    clearEditDm();
    const host=$('edit-a-ai');if(!host)return;
    const s=editDm={id:activityId(activity),uid:text(adminProfile?.userId),token:editAccessToken(),busy:false,draft:null,image:'',imageUrl:'',activity};
    host.innerHTML=`<section class="aar-dm-panel"><h3>✨ DM 重新辨識</h3><p>以目前宣傳圖重新擷取活動資料，先預覽再套用，不會直接儲存。</p>
      <button type="button" id="edit-dm-read">重新辨識 DM</button>
      <label>或選擇 DM 檔案供辨識（不變更宣傳圖）<input type="file" id="edit-dm-file" accept="image/jpeg,image/png,image/webp"></label>
      <p id="edit-dm-status" role="status"></p><div id="edit-dm-preview" hidden><div id="edit-dm-content"></div>
      <section id="edit-dm-slot-picker" hidden aria-label="辨識梯次勾選"><h3>核對本活動時段</h3><p>單場活動請只選本場時段。編輯不會另建活動或報名表。</p>
      <div id="edit-dm-slots"></div><button type="button" id="edit-dm-add-slot">＋新增梯次</button></section>
      <button type="button" id="edit-dm-apply">確認套用至本活動</button>
      <p id="edit-dm-action-status" role="status" aria-live="polite" tabindex="-1" hidden></p></div>
      <label id="edit-dm-review" class="aar-slot-check" hidden><input type="checkbox" id="edit-dm-reviewed">我已核對辨識後的內容、時間與費用</label></section>`;
    $('edit-dm-read').onclick=()=>{void readEditDm(s);};
    $('edit-dm-file').onchange=async event=>{
      const file=event.target.files?.[0];if(!file || s.busy)return;
      try {
        const image=await dmFileData(file);
        if(!editDmCurrent(s))return;
        s.image=image;s.imageUrl=$('edit-a-image').value;s.draft=null;$('edit-dm-preview').hidden=true;
        $('edit-dm-status').textContent='DM 已就緒，按「重新辨識 DM」。';
      }catch(e){if(editDmCurrent(s))$('edit-dm-status').textContent=e.message;}
    };
    $('edit-dm-apply').onclick=()=>applyEditDm(s);
    $('edit-dm-add-slot').onclick=()=>{
      if(!readyEditDm(s))return;
      const n=$('edit-dm-slots').children.length;
      if(n>=24){editDmMessage('最多 24 個梯次，請先調整現有項目。',true);return;}
      $('edit-dm-slots').insertAdjacentHTML('beforeend',slotMarkup({},n));
      $('edit-dm-slots').lastElementChild.querySelector('[data-slot-field="name"]').focus();
    };
    // Manual edits after applying require review again, without replacing other modal handlers.
    host.closest('#modal-activity-edit').addEventListener('input',event=>{
      if(editDm===s && event.target.id!=='edit-dm-reviewed' && $('edit-dm-reviewed'))$('edit-dm-reviewed').checked=false;
    },{signal:(s.listeners=new AbortController()).signal});
  }
  function editDmMessage(value,error=false) {
    const node=$('edit-dm-action-status');if(!node)return;
    node.hidden=false;node.textContent=value;node.dataset.error=String(error);
    node.scrollIntoView({block:'nearest'});node.focus({preventScroll:true});
  }
  function readyEditDm(s) {
    if(!editDmCurrent(s)){editDmMessage('登入狀態或活動已變更，請重新開啟活動後再辨識。',true);return false;}
    if(s.busy||!s.draft){editDmMessage('請先完成 DM 重新辨識。',true);return false;}
    if(s.draftUrl!==$('edit-a-image').value){editDmMessage('宣傳圖已變更，請重新辨識。',true);return false;}
    return true;
  }
  async function dmFileData(file) {
    if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>4*1024*1024)throw Error('辨識請使用 4 MB 以內 JPG / PNG / WebP');
    return await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(Error('無法讀取 DM'));r.readAsDataURL(file);});
  }
  async function currentDmImage(url) {
    let parsed;try{parsed=new URL(url);}catch(_){throw Error('請先上傳宣傳圖，或選擇 DM 檔案供辨識');}
    if(!['https:','http:'].includes(parsed.protocol)||parsed.username||parsed.password)throw Error('宣傳圖網址無效');
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
    try {
      const response=await fetch(parsed.href,{credentials:'omit',signal:controller.signal});
      if(!response.ok||!response.body)throw Error('image');
      const reader=response.body.getReader(),chunks=[];let total=0;
      while(true){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>4*1024*1024){await reader.cancel();throw Error('size');}chunks.push(value);}
      return await dmFileData(new Blob(chunks,{type:(response.headers.get('content-type')||'').split(';')[0]}));
    }catch(_){throw Error('無法讀取現有宣傳圖（網址限制、逾時或超過 4 MB）。請在此選擇原 DM 檔案再辨識，原表單未變更。');}
    finally{clearTimeout(timer);}
  }
  async function readEditDm(s) {
    if(!editDmCurrent(s)||s.busy)return;
    const url=$('edit-a-image').value;s.busy=true;s.draft=null;$('edit-dm-preview').hidden=true;$('edit-dm-action-status').hidden=true;
    $('edit-dm-status').textContent='重新辨識中，請稍候…';
    $('edit-a-ai').querySelectorAll('button,input').forEach(e=>{e.disabled=true;});
    try{
      const image=s.image && s.imageUrl===url ? s.image : await currentDmImage(url);
      if(!editDmCurrent(s)||$('edit-a-image').value!==url)return;
      const result=await fetchAPI('extractActivityDmDraft',{base64Image:image},{silent:true,timeoutMs:55000});
      if(!editDmCurrent(s)||$('edit-a-image').value!==url)return;
      const draft=result?.draft||result?.data?.draft;
      if(!draft?.activityName||result.success===false)throw Error('辨識失敗，原表單未變更，可再次按「重新辨識 DM」。');
      s.draft=draft;s.draftUrl=url;
      $('edit-dm-content').innerHTML=draftMarkup(draft);renderSlots($('edit-dm-slots'),draft.batches||[]);
      const multiple=draft.timeStatus==='multiple'||draft.batches?.length>0;
      $('edit-dm-preview').hidden=false;$('edit-dm-slot-picker').hidden=!multiple || isSeries(s.activity);
      $('edit-dm-status').textContent=text(draft.confidenceNote)+(isSeries(s.activity)
        ? ' 同一張報名表的原有梯次、報名網址及報名紀錄全部保留；本次僅更新活動名稱、類型與說明，不新增活動。'
        : ' 單場活動請勾選本場時段；編輯只更新原活動，不另建報名表。');
      if(multiple && !isSeries(s.activity)){
        $('edit-dm-slot-picker').scrollIntoView({block:'start'});
        if(!draft.batches?.length)editDmMessage('辨識到多時段，但未取得可用梯次。請重新辨識，或按「＋新增梯次」依上方時間原文補上；不會自行猜測日期。',true);
      }
    }catch(e){if(editDmCurrent(s))$('edit-dm-status').textContent=e.message;}
    finally{if(editDmCurrent(s)){s.busy=false;$('edit-a-ai').querySelectorAll('button,input').forEach(e=>{e.disabled=false;});}}
  }
  function applyEditDm(s) {
    if(!readyEditDm(s))return;
    const draft=s.draft,isSeries=s.activity.isBatch===true||String(s.activity['是否系列']).toUpperCase()==='TRUE';let slot=null;
    if(!isSeries && !$('edit-dm-slot-picker').hidden){
      const slots=selectedSlots($('edit-dm-slots'));
      if(slots.length!==1){editDmMessage('本活動僅可套用一個時段；請只勾本場時段。原有報名保留，不會另建活動。',true);return;}
      slot=slots[0];
    }
    if(!window.confirm('確認用辨識草稿取代本活動名稱、類型及說明'+(isSeries?'（保留原梯次時間與費用）':'、時間與費用')+'？套用後仍需儲存。'))return;
    $('edit-a-name').value=draft.activityName;$('edit-a-type').value=draft.activityType||'活動';
    $('edit-a-desc').value=activityDescription(draft.description,draft.location,draft.scheduleText);
    if(!isSeries){const chosen=slot||draft;$('edit-a-start').value=text(chosen.startTime).replace('T',' ');$('edit-a-end').value=text(chosen.endTime).replace('T',' ');$('edit-a-price').value=text(chosen.price);}
    $('edit-dm-review').hidden=false;$('edit-dm-reviewed').checked=false;
    editDmMessage('草稿已套用至下方表單。請補齊日期、費用，核對並勾選確認後儲存；尚未更新正式活動。');
  }
  function canSaveEditDm() {
    if(!editDm)return true;
    if(editDm.busy){showToast('DM 辨識中，請完成後再儲存',true);return false;}
    const start=$('edit-a-start').value.replace(' ','T'),end=$('edit-a-end').value.replace(' ','T'),price=$('edit-a-price').value.trim();
    if(!$('edit-dm-review').hidden && (!$('edit-dm-reviewed').checked || !validBatchTime(start) || (end && (!validBatchTime(end)||end<=start)) || price==='' || !Number.isSafeInteger(Number(price)) || Number(price)<0)) {
      showToast('請補齊日期、費用並勾選核對辨識內容後再儲存',true);return false;
    }
    return true;
  }
  function mount() {
    if (state.mounted) return;
    state.mounted = true;
    $('admin-activity-toolbar').innerHTML = `
      <div class="aar-head"><div><h2>活動報名與簽到管理</h2><p class="aar-note">與手機端共用活動及報名資料，選擇活動即可管理名單。</p></div><div class="aar-actions"><button type="button" class="aar-button aar-primary" data-aar="create">＋新增活動</button><button type="button" class="aar-button" data-aar="refresh-list">重新整理活動</button></div></div>
      <div class="aar-stats" id="aar-activity-stats"></div>
      <div class="aar-filters">
        <label class="aar-search">搜尋活動<input id="aar-activity-query" type="search" placeholder="活動名稱或編號"></label>
        <label>歸屬網<select id="act-tenant-filter"><option value="all">全部歸屬網</option></select></label>
        <label>活動狀態<select id="aar-activity-state"><option value="all">全部狀態</option><option>上架</option><option>下架</option></select></label>
        <label>開始日期（起）<input id="aar-activity-from" type="date"></label><label>開始日期（迄）<input id="aar-activity-to" type="date"></label>
      </div><p id="aar-list-status" class="aar-status" role="status"></p>`;
    $('tab-activities').addEventListener('click', handleClick);
    $('admin-activity-toolbar').addEventListener('input', renderOverview);
    $('admin-activity-registrants').addEventListener('input', renderRoster);
    $('aar-activity-stats').innerHTML = stats([['已載入活動','—'],['上架','—'],['下架','—'],['符合篩選','—']]);
  }
  function message(id, value, error = false) {
    $(id).textContent = value;
    $(id).dataset.error = String(error);
  }
  async function load() {
    mount();
    const request = ++state.listRequest;
    const button = $('tab-activities').querySelector('[data-aar="refresh-list"]');
    button.disabled = true;
    $('acts-table-body').innerHTML = '<tr><td colspan="8" class="aar-empty">載入活動中…</td></tr>';
    message('aar-list-status', '正在讀取活動…');
    try {
      // Use the existing manager endpoint; never silently fall back to a public list.
      const rows = list(await fetchAPI('getAllActivities', {}, { silent: true }));
      if (request !== state.listRequest) return;
      if (!rows) throw new Error('無法讀取活動，請按「重新整理活動」重試。');
      allActivitiesData = rows;
      state.counts.clear();
      $('stat-acts').innerText = activityForms(rows).length;
      const selectedNetwork = $('act-tenant-filter').value;
      $('act-tenant-filter').innerHTML = '<option value="all">全部歸屬網</option>' + [...new Set(rows.map(network))].map(id => `<option value="${esc(id)}">${esc(id === 'admin' ? '平台' : id)}</option>`).join('');
      if ([...$('act-tenant-filter').options].some(option => option.value === selectedNetwork)) $('act-tenant-filter').value = selectedNetwork;
      message('aar-list-status', rows.length >= 500 ? '已達 API 500 筆讀取上限，以下篩選僅限已載入活動。' : '依管理權限顯示活動；名單人數於開啟活動後更新。');
      renderOverview();
      if (state.selected) {
        if (rows.some(row => activityId(row) === state.selected)) await openRoster(state.selected);
        else back();
      }
    } catch (error) {
      if (request !== state.listRequest) return;
      allActivitiesData = [];
      back();
      $('acts-table-body').innerHTML = '<tr><td colspan="8" class="aar-empty">活動資料讀取失敗</td></tr>';
      $('aar-activity-stats').innerHTML = stats([['已載入活動','—'],['上架','—'],['下架','—'],['符合篩選','—']]);
      message('aar-list-status', error.message, true);
    } finally { if (request === state.listRequest) button.disabled = false; }
  }
  function renderOverview() {
    if (!state.mounted) return;
    const forms = activityForms(allActivitiesData);
    const rows = filterActivities(forms, { query: $('aar-activity-query').value, network: $('act-tenant-filter').value,
      status: $('aar-activity-state').value, from: $('aar-activity-from').value, to: $('aar-activity-to').value });
    $('aar-activity-stats').innerHTML = stats([['已載入活動',forms.length],['上架',forms.filter(row => status(row) === '上架').length],
      ['下架',forms.filter(row => status(row) === '下架').length],['符合篩選',rows.length]]);
    $('acts-table-body').innerHTML = rows.length ? renderActivitySectionRows('上架區', rows.filter(row => status(row) === '上架'), false) +
      renderActivitySectionRows('下架區', rows.filter(row => status(row) === '下架'), true) :
      `<tr><td colspan="8" class="aar-empty">${allActivitiesData.length ? '沒有符合條件的活動' : '目前沒有活動資料'}</td></tr>`;
  }
  function back() {
    if (state.busy) return;
    ++state.rosterRequest;
    state.selected = ''; state.rows = null;
    $('admin-activity-registrants').hidden = true;
    $('admin-activity-toolbar').hidden = false;
    $('admin-activity-overview').hidden = false;
  }
  async function openRoster(id) {
    if (!id || state.busy) return;
    const activity = allActivitiesData.find(row => activityId(row) === id);
    if (!activity) return;
    state.selected = id; state.rows = null;
    $('admin-activity-toolbar').hidden = true;
    $('admin-activity-overview').hidden = true;
    const panel = $('admin-activity-registrants');
    panel.hidden = false;
    panel.innerHTML = `
      <div class="aar-head"><button type="button" class="aar-button" data-aar="back">← 返回活動列表</button><div class="aar-actions"><button type="button" class="aar-button" data-aar="refresh-roster">重新整理名單</button><button type="button" class="aar-button aar-primary" data-aar="export" disabled>匯出篩選名單 CSV</button></div></div>
      <h2>${esc(title(activity))}</h2><p class="aar-note">${esc(pick(activity,['開始時間','startTime'],'時間未設定'))} · ${esc(status(activity))} · ${esc(id)}</p>
      <div id="aar-roster-stats" class="aar-stats"></div>
      <div class="aar-filters"><label class="aar-search">搜尋報名者<input id="aar-roster-query" type="search" placeholder="姓名、電話或報名編號"></label>
      <label>報名／簽到狀態<select id="aar-roster-state"><option value="all">全部名單</option><option value="active">有效報名</option><option value="checked">已簽到</option><option value="unchecked">未簽到</option><option value="cancelled">已取消</option></select></label>
      <label>付款狀態<select id="aar-roster-payment"><option value="all">全部付款狀態</option><option value="paid">已付款／已繳費</option><option value="unpaid">待付款／待對帳</option><option value="free">免費</option></select></label></div>
      <p id="aar-roster-status" class="aar-status" role="status"></p>
      <div class="aar-panel"><div class="aar-panel-head"><h3>報名與簽到名單</h3><p class="aar-note">統計與匯出以本活動已載入資料為準，手動操作與手機端共用紀錄。</p></div>
      <div class="aar-scroll"><table class="aar-table"><thead><tr><th>姓名／身份</th><th>電話</th><th>付款狀態</th><th>報名／簽到</th><th>簽到時間</th><th>操作</th></tr></thead><tbody id="aar-roster-body"></tbody></table></div></div>`;
    await refreshRoster();
  }
  async function refreshRoster(note = '') {
    const id = state.selected;
    if (!id) return;
    const request = ++state.rosterRequest;
    state.rows = null;
    renderRoster();
    message('aar-roster-status', '正在讀取名單…');
    try {
      const rows = list(await fetchAPI('getActivityRegistrants', { activityId: id }, { silent: true }));
      if (request !== state.rosterRequest || id !== state.selected) return;
      if (!rows) throw new Error('無法讀取名單，請重新整理；尚未確認最新狀態前不提供名單操作。');
      state.rows = rows.map(registrant);
      const counts = summary(state.rows);
      if (rows.length < 500) state.counts.set(id, counts.active);
      message('aar-roster-status', (note ? note + ' ' : '') + (rows.length >= 500 ? '已達 API 500 筆讀取上限，統計與 CSV 可能不是完整名單。' : `顯示 ${rows.length} 筆報名紀錄（含已取消）。`));
      renderRoster();
      renderOverview();
    } catch (error) {
      if (request !== state.rosterRequest || id !== state.selected) return;
      $('aar-roster-body').innerHTML = '<tr><td colspan="6" class="aar-empty">名單讀取失敗，請使用上方重新整理</td></tr>';
      message('aar-roster-status', (note ? note + ' ' : '') + error.message, true);
    }
  }
  function visibleRows() {
    return filterRegistrants(state.rows || [], { query: $('aar-roster-query').value, state: $('aar-roster-state').value, payment: $('aar-roster-payment').value });
  }
  function renderRoster() {
    if (!state.selected) return;
    const counts = state.rows ? summary(state.rows) : {};
    $('aar-roster-stats').innerHTML = stats([['有效報名',counts.active ?? '—'],['已簽到',counts.checked ?? '—'],['待付款',counts.unpaid ?? '—'],['已取消',counts.cancelled ?? '—']]);
    const rows = visibleRows();
    $('admin-activity-registrants').querySelector('[data-aar="export"]').disabled = state.busy || !state.rows || !rows.length;
    if (!state.rows) {
      $('aar-roster-body').innerHTML = '<tr><td colspan="6" class="aar-empty">名單尚未載入</td></tr>';
      return;
    }
    $('aar-roster-body').innerHTML = rows.length ? rows.map(row => `<tr>
      <td><strong>${esc(row.name)}</strong><div class="aar-note">${esc(row.identity)}</div>${row.activityName?`<div class="aar-note">${esc(row.activityName)}</div>`:''}</td><td>${esc(row.phone || '未提供')}</td>
      <td>${esc(row.payment || (row.amount > 0 ? '待付款' : '免費'))}<div class="aar-note">NT$ ${esc(row.amount)}</div></td>
      <td><span class="aar-badge ${row.cancelled ? 'aar-muted' : row.checked ? 'aar-ok' : ''}">${row.cancelled ? '已取消' : row.checked ? '已簽到' : '未簽到'}</span></td>
      <td>${esc(row.time || '—')}</td><td><div class="aar-actions">${!row.cancelled && row.id ?
        `<button type="button" class="aar-button" data-row="${esc(row.id)}" data-mutation="toggleCheckin" ${state.busy ? 'disabled' : ''}>${row.checked ? '取消簽到' : '簽到'}</button>` +
        (row.amount > 0 && !row.paid ? `<button type="button" class="aar-button" data-row="${esc(row.id)}" data-mutation="confirmPayment" ${state.busy ? 'disabled' : ''}>確認繳費</button>` : '') : '—'}</div></td></tr>`).join('') :
      `<tr><td colspan="6" class="aar-empty">${state.rows.length ? '沒有符合條件的報名者' : '尚無報名者'}</td></tr>`;
  }
  async function mutate(action, rowId) {
    if (state.busy || !['toggleCheckin','confirmPayment'].includes(action)) return;
    const row = state.rows?.find(item => item.id === rowId);
    if (!state.selected || !row || row.cancelled || (action === 'confirmPayment' && (row.paid || row.amount <= 0))) return;
    const label = action === 'confirmPayment' ? '確認已收到款項' : row.checked ? '取消簽到' : '簽到';
    if (!window.confirm(`確定為「${row.name}」${label}？`)) return;
    state.busy = true;
    $('admin-activity-registrants').querySelectorAll('button').forEach(button => { button.disabled = true; });
    let note;
    try {
      const result = await fetchAPI(action, { rowId, activityId: state.selected }, { silent: true });
      note = result && result.success !== false ? '操作已完成，已重新核對名單。' : '未收到成功確認，請先核對最新狀態；系統不會自動重送。';
    } catch (_) { note = '連線異常，請先核對最新狀態；系統不會自動重送。'; }
    try { await refreshRoster(note); }
    finally {
      state.busy = false;
      $('admin-activity-registrants').querySelectorAll('[data-aar="back"], [data-aar="refresh-roster"]').forEach(button => { button.disabled = false; });
      renderRoster();
    }
  }
  function download() {
    if (state.busy || !state.rows || !visibleRows().length) return;
    const activity = allActivitiesData.find(row => activityId(row) === state.selected);
    if (!activity) return;
    const url = URL.createObjectURL(new Blob([csv(title(activity), visibleRows())], { type: 'text/csv;charset=utf-8;' }));
    const link = document.createElement('a');
    link.href = url; link.download = `${title(activity).replace(/[\\/:*?"<>|\r\n]/g, '_').slice(0, 60)}_報名名單.csv`;
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function handleClick(event) {
    const button = event.target.closest('button');
    if (!button || button.disabled || state.busy) return;
    if (button.dataset.registrants) { void openRoster(button.dataset.registrants); return; }
    if (button.dataset.copyActivity) { void copyActivityId(button.dataset.copyActivity); return; }
    if (button.dataset.mutation) { void mutate(button.dataset.mutation, button.dataset.row); return; }
    switch (button.dataset.aar) {
      case 'create': openCreate(); break;
      case 'refresh-list': void load(); break;
      case 'back': back(); renderOverview(); break;
      case 'refresh-roster': void refreshRoster(); break;
      case 'export': download(); break;
    }
  }
  function editToken() {
    try { return window.liff?.isLoggedIn() ? window.liff.getAccessToken() : ''; } catch (_) { return ''; }
  }
  function isCurrentEditLink(link) {
    return !!link && editLink === link && adminProfile?.userId === link.uid && editToken() === link.token &&
      $('edit-a-id').value === link.id && !$('modal-activity-edit').classList.contains('hidden');
  }
  function clearEditLink() {
    editLink = null;
    $('edit-a-registration-link').value = '';
    $('edit-a-registration-link').placeholder = '尚未取得報名短網址';
    $('edit-a-link-status').textContent = '';
    $('edit-a-link-copy').disabled = true;
    $('edit-a-link-open').removeAttribute('href');
    $('edit-a-link-open').setAttribute('aria-disabled', 'true');
    $('edit-a-link-open').tabIndex = -1;
    $('edit-a-link-retry').hidden = true;
  }
  async function loadEditLink(activity = editLink?.activity) {
    clearEditLink();
    if (!activity) return;
    const link = { activity, id: activityId(activity), uid: adminProfile?.userId, token: editToken(), url: '' };
    editLink = link;
    const statusEl = $('edit-a-link-status');
    if (!['上架','active','published'].includes(text(pick(activity, ['狀態','status'])))) {
      statusEl.textContent = '此活動尚未上架，請先回活動列表上架，再取得報名連結。'; return;
    }
    if (!link.uid || !link.token) { statusEl.textContent = '請重新登入後台後取得報名連結。'; return; }
    statusEl.textContent = '正在取得報名短網址…';
    try {
      const result = await fetchAPI('createActivityShareLink', { activityId: link.id,
        networkId: text(pick(activity, ['歸屬網','networkId','network_id'], 'admin')) }, { silent: true, timeoutMs: 12000 });
      if (!isCurrentEditLink(link)) return;
      const url = new URL((result?.data || result)?.url || '');
      if (result?.success === false || url.protocol !== 'https:' || url.origin !== new URL(WORKER_URL).origin ||
          url.username || url.password || url.search || url.hash || !/^\/a\/[A-Za-z0-9_-]{16}$/.test(url.pathname)) throw Error('INVALID_SHORT_LINK');
      link.url = url.href;
      $('edit-a-registration-link').value = link.url;
      $('edit-a-link-copy').disabled = false;
      $('edit-a-link-open').href = link.url;
      $('edit-a-link-open').setAttribute('aria-disabled', 'false');
      $('edit-a-link-open').tabIndex = 0;
      statusEl.textContent = '可直接複製分享；修改活動內容後，請記得按「儲存變更」。';
    } catch (_) {
      if (!isCurrentEditLink(link)) return;
      statusEl.textContent = '暫時無法取得報名連結，請按「重新取得」；不影響活動編輯。';
      $('edit-a-link-retry').hidden = false;
    }
  }
  function canUseEditLink() { return isCurrentEditLink(editLink) && !!editLink.url; }
  async function copyEditLink() {
    if (!canUseEditLink()) return;
    const link = editLink;
    try {
      if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(link.url);
      else {
        $('edit-a-registration-link').focus(); $('edit-a-registration-link').select();
        if (!document.execCommand('copy')) throw Error('COPY_FAILED');
      }
      if (isCurrentEditLink(link)) showToast('報名連結已複製');
    } catch (_) {
      if (isCurrentEditLink(link)) {
        $('edit-a-registration-link').focus(); $('edit-a-registration-link').select();
        $('edit-a-link-status').textContent = '無法自動複製，請長按或選取上方連結手動複製。';
      }
    }
  }
  window.AdminActivityRegistration = { load, renderActivities: renderOverview, countFor,
    mountEditDm, clearEditDm, canSaveEditDm, validateBatches,
    loadEditLink, clearEditLink, canUseEditLink, copyEditLink,
    list, registrant, summary, activityForms, filterActivities, filterRegistrants, csv, creationPayload, activityDescription };
})();
