import {fieldLabels,drawSignature,applicationPdf} from './reward-application-pdf.mjs?v=1';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const status=v=>({pending:'已簽署・待審核',accepted:'審核通過・開通另行處理',rejected:'審核未通過'}[v]||v);
let active;
function snapshotHtml(s){return `<h3>${esc(s.terms.title)}</h3>${Object.entries(fieldLabels).filter(([k])=>s.fields[k]?.length).map(([k,label])=>`<p class="ra-copy"><strong>${label}：</strong>${esc(Array.isArray(s.fields[k])?s.fields[k].join('、'):s.fields[k])}</p>`).join('')}<h3>合作條款</h3><small>版本：${esc(s.terms.version)}</small>${s.terms.paragraphs.map(p=>`<p class="ra-copy">${esc(p)}</p>`).join('')}`;}
export async function openRewardApplications({base,admin=false,target='',isCurrent=()=>true,fetcher=fetch}={}){
 if(active?.busy)throw Error('申請正在送出，請先等候結果');active?.close();
 const token=window.liff?.isLoggedIn?.()?window.liff.getAccessToken():'';if(!token)throw Error('請先使用 LINE 登入');
 if(target&&!/^U[0-9a-f]{32}$/i.test(target))throw Error('請選擇有效的 CRM 會員');
 if(!document.querySelector('[data-reward-application-style]')){const link=document.createElement('link');link.rel='stylesheet';link.href=new URL('../../css/reward-applications.css?v=1',import.meta.url).href;link.dataset.rewardApplicationStyle='';document.head.appendChild(link);}
 const dialog=document.createElement('dialog');dialog.className='reward-application-dialog';dialog.setAttribute('aria-label',admin?'CRM 合作申請審核':'合作申請／我的合約');
 const opener=document.activeElement;let closed=false,busy=false,generation=0,formDraft={},attempt,record;
 const urls=[];const current=()=>!closed&&dialog.isConnected&&isCurrent()&&window.liff?.isLoggedIn?.()&&window.liff.getAccessToken()===token;
 let lifecycle;
 const close=(force=false)=>{if(busy&&!force)return;closed=true;generation++;clearInterval(lifecycle);urls.forEach(URL.revokeObjectURL);dialog.close();dialog.remove();if(active?.dialog===dialog)active=null;opener?.focus();};
 active={dialog,close,get busy(){return busy;}};document.body.appendChild(dialog);dialog.showModal();
 lifecycle=setInterval(()=>{if(!current())close(true);},500);
 const message=text=>{const node=dialog.querySelector('[data-message]');if(node)node.textContent=text;};
 const shell=(title,body)=>{dialog.innerHTML=`<button type="button" class="ra-close" data-action="close">關閉 ×</button><h2>${title}</h2><div>${body}</div><p data-message role="alert" aria-live="polite"></p>`;dialog.scrollTop=0;};
 const api=async(path='',data)=>{
  if(!current())throw Error('登入或頁面已變更，請重新開啟');
  const response=await fetcher(String(base).replace(/\/+$/,'')+'/v1/reward-applications'+path,{method:data?'POST':'GET',headers:{Authorization:'Bearer '+token,...(data?{'Content-Type':'application/json'}:{})},body:data?JSON.stringify(data):undefined,cache:'no-store',signal:AbortSignal.timeout(20000)});
  const result=await response.json();if(!current())throw Error('登入或頁面已變更，請重新開啟');if(!response.ok||!result.success)throw Error(result.error||'申請服務暫時無法完成');return result;
 };
 async function run(fn){if(busy||!current())return;busy=true;const controls=[...dialog.querySelectorAll('button,input,textarea')];controls.forEach(c=>c.disabled=true);message('處理中，請稍候…');try{await fn();if(current())message('');}catch(e){if(current())message(e.name==='TimeoutError'?'連線逾時，結果尚未確認。請使用原內容重試，或返回清單確認是否已送出。':e.message);}finally{busy=false;controls.forEach(c=>c.disabled=false);if(attempt&&dialog.querySelector('[data-form=sign]')){dialog.querySelectorAll('[data-action=edit],[data-action=clear],input').forEach(c=>c.disabled=true);const b=dialog.querySelector('[data-form=sign] button[type=submit]');b.textContent='用原簽署內容重試送出';if(!dialog.querySelector('[data-form=sign] [data-action=refresh]'))b.insertAdjacentHTML('afterend','<button type="button" data-action="refresh">返回清單確認結果</button>');}}}
 const adminPath=()=>admin?'/admin':'';
 async function list(after=''){
  const gen=++generation;const params=new URLSearchParams();if(admin&&target)params.set('target',target);if(after)params.set('after',after);
  shell(admin?'CRM 合作申請審核':'合作申請／我的合約','<p>讀取中…</p>');
  const result=await api(adminPath()+'?'+params);if(gen!==generation)return;
  shell(admin?'CRM 合作申請審核':'合作申請／我的合約',`<p class="ra-note">${admin?'本頁只記錄審核結果，不會自動改變會員角色、贈點額度或公開單位資料。':'免費申請贈點單位。簽署後送平台審核，尚未核准前不會自動開通。'}</p>${!admin?'<button class="primary" data-action="new">＋ 贈點單位申請</button>':''}<button data-action="refresh">重新整理</button>${result.applications.map(a=>`<article class="ra-record"><strong>${esc(a.unit_name)}</strong><p>${esc(a.applicant_name)} · ${status(a.status)}</p><small>${esc(new Date(a.signed_at).toLocaleString('zh-TW',{timeZone:'Asia/Taipei'}))}</small><button data-action="detail" data-id="${esc(a.id)}">查看申請／下載 PDF</button></article>`).join('')||'<p>目前沒有已送出的申請。</p>'}${after?'<button data-action="refresh">回第一頁</button>':''}${result.next?`<button data-action="next" data-id="${esc(result.next)}">下一頁</button>`:''}`);
 }
 async function form(){
  attempt=null;const template=await api('/template');
  const input=(name,label,max,required=false)=>`<label>${label}<input name="${name}" maxlength="${max}" ${required?'required':''} value="${esc(formDraft[name]||'')}" ${name==='phone'?'type="tel" autocomplete="tel"':''}></label>`;
  shell('1／3 填寫申請資料',`<p class="ra-note">本次只申請免費贈點單位，不含特約折抵、雙向完整版或共創夥伴。資料與簽名用於申請審核及紀錄保存，僅本人與平台管理員可查閱；不會自動公開。</p><form data-form="application">${input('unit_name','申請單位 *',120,true)}${input('applicant_name','負責人／申請人 *',80,true)}${input('phone','行動電話 *（聯絡使用，不代表已完成簡訊驗證）',30,true)}${input('line_contact','LINE ID（選填）',80)}${Object.entries(template.options).map(([key,values])=>`<fieldset><legend>${fieldLabels[key]} *</legend><div class="ra-choices">${values.map(v=>`<label><input type="checkbox" name="${key}" value="${v}" ${(formDraft[key]||[]).includes(v)?'checked':''}>${v}</label>`).join('')}</div>${input(key+'_other','勾選其他時請補充',key==='scenarios'?200:100)}</fieldset>`).join('')}<p>推薦來源由現有 CRM 紀錄帶入，本表單不修改會員歸屬。</p><button type="button" data-action="refresh">返回我的申請</button><button class="primary" type="submit">下一步：預覽完整申請書</button></form>`);
 }
 let preview,strokes=[],stroke=null,pointer=null;
 function previewScreen(result){
  preview=result;attempt=null;strokes=[];stroke=null;
  const s=result.snapshot;
  shell('2／3 閱讀並手寫簽名',`${snapshotHtml(s)}<p class="ra-note">請核對上述完整資料。修改資料會清除簽名；本次預覽有效 30 分鐘。</p><form data-form="sign">${Object.entries(s.confirmations).map(([k,text])=>`<label><input type="checkbox" name="${k}" required>${esc(text)}</label>`).join('')}<h3>申請人手寫簽名</h3><p>請在框內用手指或滑鼠簽名。</p><canvas width="1000" height="400" aria-label="手寫簽名區"></canvas><button type="button" data-action="clear">清除重簽</button><p>此流程驗證 LINE 帳號，並非實名驗證或憑證式數位簽章。</p><button type="button" data-action="edit">返回修改資料</button><button class="primary" type="submit">確認簽署並送出申請</button></form>`);
  const canvas=dialog.querySelector('canvas'),ctx=canvas.getContext('2d');
  const point=e=>{const r=canvas.getBoundingClientRect();return [Math.round(Math.max(0,Math.min(1000,(e.clientX-r.left)/r.width*1000))),Math.round(Math.max(0,Math.min(400,(e.clientY-r.top)/r.height*400)))];};
  canvas.onpointerdown=e=>{if(busy||attempt||pointer!==null||!current()||strokes.length>=80)return;e.preventDefault();pointer=e.pointerId;stroke=[point(e)];strokes.push(stroke);canvas.setPointerCapture(pointer);};
  canvas.onpointermove=e=>{if(pointer!==e.pointerId||!stroke||busy||attempt)return;e.preventDefault();if(strokes.reduce((n,s)=>n+s.length,0)>=2500)return;stroke.push(point(e));ctx.clearRect(0,0,1000,400);drawSignature(ctx,strokes);};
  const end=e=>{if(e.pointerId!==pointer)return;if(stroke?.length<2)strokes.pop();pointer=null;stroke=null;};canvas.onpointerup=end;canvas.onpointercancel=end;
 }
 async function detail(id){const result=await api(adminPath()+'?'+new URLSearchParams({id,...(admin&&target?{target}:{})}));showRecord(result.application);}
 function showRecord(value){
  record=value;const s=record.snapshot;
  shell('申請紀錄',`<p class="ra-note">${status(record.status)}。申請簽署完成不代表權限已開通。</p><button data-action="refresh">← 返回申請清單</button><button data-action="pdf" class="primary">下載已簽申請書 PDF</button><div data-download></div><small class="ra-copy">申請編號：${esc(record.id)}</small>${snapshotHtml(s)}<h3>簽署確認</h3>${Object.values(s.confirmations).map(v=>`<p>${esc(v)}</p>`).join('')}<canvas width="1000" height="400" aria-label="已保存的手寫簽名"></canvas><p>簽署時間：${esc(new Date(record.signed_at).toLocaleString('zh-TW',{timeZone:'Asia/Taipei'}))}</p><small class="ra-copy">內容校驗碼：${esc(record.content_sha256)}</small><p>${esc(s.assurance)}</p>${record.review_note?`<h3>審核說明</h3><p class="ra-copy">${esc(record.review_note)}</p>`:''}${admin&&record.status==='pending'?'<form data-form="review"><h3>平台審核</h3><label>審核說明（必填）<textarea name="note" required maxlength="1000" rows="3"></textarea></label><button type="submit" name="decision" value="accepted">確認審核通過</button><button type="submit" name="decision" value="rejected">審核不通過</button><p>只記錄審核結果，不自動改角色或開通贈點。審核後不可覆寫此筆結果。</p></form>':''}`);
  drawSignature(dialog.querySelector('canvas').getContext('2d'),s.signing.strokes);
 }
 dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
 dialog.onclick=e=>{const button=e.target.closest('[data-action]');if(!button)return;const action=button.dataset.action;
  if(action==='close'){close();return;}if(busy||!current())return;if(action==='clear'){if(attempt)return;strokes=[];stroke=null;pointer=null;dialog.querySelector('canvas').getContext('2d').clearRect(0,0,1000,400);return;}
  void run(async()=>{
   if(action==='refresh')await list();if(action==='next')await list(button.dataset.id);if(action==='new'||action==='edit')await form();if(action==='detail')await detail(button.dataset.id);
   if(action==='pdf'){const blob=await applicationPdf(record);if(!current())return;const url=URL.createObjectURL(blob);urls.push(url);const slot=dialog.querySelector('[data-download]');slot.innerHTML=`<a class="ra-download" download="贈點單位申請-${esc(record.id)}.pdf" href="${url}">PDF 已備妥，點此儲存／開啟</a><small>若 LINE 未顯示下載，請在外部瀏覽器開啟後下載。本副本不是憑證式數位簽章。</small>`;slot.querySelector('a').click();}
  });
 };
 dialog.onsubmit=e=>{e.preventDefault();if(busy||!current())return;const formEl=e.target;if(!formEl.reportValidity())return;const submittedValues=new FormData(formEl),submittedDecision=e.submitter?.value;
  void run(async()=>{
   if(formEl.dataset.form==='application'){
    const values=submittedValues;formDraft={};for(const key of Object.keys(fieldLabels))formDraft[key]=['unit_types','recipients','scenarios'].includes(key)?values.getAll(key):String(values.get(key)||'').trim();
    previewScreen(await api('/preview',{fields:formDraft}));
   }else if(formEl.dataset.form==='sign'){
    if(!attempt){const values=submittedValues;if(pointer!==null)throw Error('請完成簽名後再送出');const distance=strokes.reduce((sum,s)=>sum+s.slice(1).reduce((n,p,i)=>n+Math.hypot(p[0]-s[i][0],p[1]-s[i][1]),0),0);if(distance<80||strokes.reduce((n,s)=>n+s.length,0)<8)throw Error('請完整手寫簽名，不可空白或只點一下');attempt={preview_id:preview.preview_id,strokes:JSON.parse(JSON.stringify(strokes)),electronic:values.get('electronic')==='on',terms:values.get('terms')==='on',authority:values.get('authority')==='on'};}
    if(attempt.strokes.reduce((n,s)=>n+s.length,0)<8){attempt=null;throw Error('請完整手寫簽名');}
    const result=await api('/submit',attempt);showRecord(result.application);
   }else if(formEl.dataset.form==='review'){
    const note=String(submittedValues.get('note')||'').trim(),decision=submittedDecision;
    if(!window.confirm('確定送出此審核結果？此操作不會開通或變更贈點權限。'))return;
    showRecord((await api('/review',{id:record.id,decision,note})).application);
   }
  });
 };
 shell('合作申請／我的合約','<p>讀取中…</p>');await run(()=>list());
 return {close};
}
