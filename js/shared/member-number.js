(function(root) {
  'use strict';
  const esc = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function day(value) {
    if (!value) return '';
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(date) : '';
  }
  function summary(user, now = new Date()) {
    const date = day(user?.memberJoinedAt);
    const days = date ? Math.floor((Date.parse(day(now)+'T00:00:00Z')-Date.parse(date+'T00:00:00Z'))/86400000) : -1;
    const source = user?.memberDateSource;
    if (source === 'legacy_unknown') return '加入日期待確認（號碼日期為補編日）';
    if (!date || days < 0) return '尚無可確認的加入紀錄';
    return date + ' · ' + (source === 'legacy_created_at' ? '建檔資歷 ' : '加入資歷 ') + days + ' 天' + (source === 'legacy_created_at' ? '（舊資料補編）' : '');
  }
  const summaryHtml = user => '<div class="crm-sub-text" data-member-seniority>' + esc(summary(user)) + '</div>';
  let revision=0, timer;
  async function preview() {
    const input=document.getElementById('crm-referrer-id'), status=document.getElementById('crm-referrer-preview');
    if(!input||!status)return;
    const value=input.value.trim(), generation=++revision, target=document.getElementById('crm-user-id')?.value;
    status.textContent=value?'核對推薦人中…':'尚未指定推薦人';
    if(!value)return;
    try {
      const response=await root.fetchAPI('adminLookupMemberNumber',{query:value},{silent:true});
      const data=response?.data||response;
      if(generation!==revision||input.value.trim()!==value||document.getElementById('crm-user-id')?.value!==target)return;
      if(response?.success===false||!data?.userId)throw Error(response?.error||'找不到推薦人');
      status.textContent=data.userId===target?'不可指定自己為推薦人':data.name+' · 個人編號 '+(data.memberNumber||'尚未編號')+' · '+summary(data);
    }catch(error){if(generation===revision&&input.value.trim()===value)status.textContent=error.message||'暫時無法核對推薦人';}
  }
  function fill(user, users = []) {
    ++revision;clearTimeout(timer);
    const number=document.getElementById('crm-member-number'), date=document.getElementById('crm-joined-at'), source=document.getElementById('crm-member-date-source');
    if(number)number.value=user.memberNumber||'尚未建立會員編號';
    if(date){date.value=day(user.memberJoinedAt);date.readOnly=true;}
    if(source)source.textContent=summary(user);
    const list=document.getElementById('crm-member-number-options');
    if(list)list.innerHTML=users.filter(u=>/^\d{11,}$/.test(u.memberNumber||'')).map(u=>'<option value="'+esc(u.memberNumber)+'">'+esc(u.name||'未命名')+' · '+esc(summary(u))+'</option>').join('');
    void preview();
  }
  document.addEventListener('input',event=>{if(event.target?.id!=='crm-referrer-id')return;++revision;clearTimeout(timer);const status=document.getElementById('crm-referrer-preview');if(status)status.textContent='輸入完成後將核對推薦人';timer=setTimeout(preview,350);});
  root.MemberNumber=Object.freeze({day,summary,summaryHtml,fill,preview});
})(globalThis);
