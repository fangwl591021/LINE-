/* Welfare-style file -> extraction preview -> explicit apply. No publish/upload action. */
(function(){
  'use strict';
  const MAX=4*1024*1024,types=['image/jpeg','image/png','image/webp','application/pdf'];
  const identity=()=>{const uid=window.currentUserProfile?.userId,token=window.liff?.isLoggedIn?.()?window.liff.getAccessToken?.():'';if(!uid||!token)throw Error('請先從 LINE 登入');return {uid,token};};
  const same=a=>{const b=identity();return a.uid===b.uid&&a.token===b.token;};
  function read(blob,signal){return new Promise((resolve,reject)=>{const reader=new FileReader(),stop=()=>reader.abort();signal.addEventListener('abort',stop,{once:true});const end=()=>signal.removeEventListener('abort',stop);reader.onload=()=>{end();resolve(reader.result);};reader.onerror=()=>{end();reject(Error('檔案讀取失敗'));};reader.onabort=()=>{end();reject(Error('已取消'));};if(signal.aborted){end();reject(Error('已取消'));return;}reader.readAsDataURL(blob);});}
  async function fileData(file,signal){
    if(!types.includes(file.type)||!file.size||file.size>(file.type==='application/pdf'?MAX:10*1024*1024))throw Error('請選 10 MB 內 JPG／PNG／WebP，或 4 MB 內 PDF');
    if(file.type==='application/pdf')return read(file,signal);
    let bitmap;
    try{
      bitmap=await createImageBitmap(file);if(signal.aborted)throw Error('已取消');
      const scale=Math.min(1,2000/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
      const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.88));if(!blob||blob.size>MAX)throw Error('圖片仍過大，請先縮小後重選');return read(blob,signal);
    }finally{bitmap?.close();}
  }
  window.prepareMemberEventDmFile=async(file,signal)=>({type:file.type==='application/pdf'?'application/pdf':'image/jpeg',data:await fileData(file,signal)});
  window.installMemberEventDm=(container,options)=>{
    const root=document.createElement('section');root.className='me-dm-import';root.innerHTML='<h3>從 DM／PDF 帶入活動</h3><label>活動 DM 檔案<input type="file" accept="image/jpeg,image/png,image/webp,application/pdf,.jpg,.jpeg,.png,.webp,.pdf" data-dm-file></label><p class="me-muted">JPG／PNG／WebP 10 MB 內（自動等比縮小），PDF 4 MB 內。點辨識後交由平台 AI 處理，請勿上傳敏感個資；不自動公開原檔或發布活動。</p><img data-dm-preview alt="活動 DM 預覽" hidden><div class="me-actions"><button type="button" data-dm-read disabled>AI 辨識活動</button><button type="button" data-dm-stop hidden>取消辨識</button></div><p data-dm-status role="status" aria-live="polite"></p><section data-dm-result hidden><h3>辨識結果（尚未套用）</h3><dl></dl><fieldset data-dm-sessions hidden><legend>選擇本場時段（單選）</legend></fieldset><p data-dm-warning></p><button type="button" data-dm-apply>確認帶入草稿</button></section>';
    container.append(root);const q=s=>root.querySelector(s),input=q('[data-dm-file]'),readButton=q('[data-dm-read]'),cancel=q('[data-dm-stop]'),preview=q('img'),result=q('[data-dm-result]'),status=q('[data-dm-status]');
    let file=null,draft=null,draftActor=null,prepared=null,generation=0,controller=null,objectUrl='',busy=false,disposed=false,recognized=false;
    const scope={controllers:new Set(),closed:false};
    const valid=(g,a)=>!disposed&&g===generation&&options.isValid()&&same(a);
    const note=v=>status.textContent=v;
    function stop(message=''){generation++;controller?.abort();scope.controllers.forEach(c=>c.abort());controller=null;scope.controllers.clear();busy=false;cancel.hidden=true;input.disabled=false;readButton.disabled=!file;readButton.textContent=recognized?'重新辨識 DM／PDF':'AI 辨識活動';if(message)note(message);}
    function clear(){stop();file=null;draft=null;draftActor=null;prepared=null;recognized=false;result.hidden=true;input.value='';preview.hidden=true;preview.removeAttribute('src');if(objectUrl)URL.revokeObjectURL(objectUrl);objectUrl='';readButton.disabled=true;options.discard?.();note('');}
    input.onchange=()=>{
      const selected=input.files?.[0];clear();file=selected||null;
      if(!file)return;
      if(!types.includes(file.type)||!file.size||file.size>(file.type==='application/pdf'?MAX:10*1024*1024)){file=null;note('請選 10 MB 內 JPG／PNG／WebP，或 4 MB 內 PDF');return;}
      note('已選取：'+file.name+'。尚未送出辨識。');readButton.disabled=false;
      if(file.type!=='application/pdf'){objectUrl=URL.createObjectURL(file);preview.src=objectUrl;preview.hidden=false;}
    };
    cancel.onclick=()=>{draft=null;result.hidden=true;stop('已取消辨識，原表單未變更。');};
    readButton.onclick=async()=>{
      if(!file||busy||!options.isValid())return;let actor;try{actor=identity();}catch(e){note(e.message);return;}
      busy=true;draft=null;result.hidden=true;const g=++generation,selected=file;controller=new AbortController();const signal=controller.signal;input.disabled=true;readButton.disabled=true;cancel.hidden=false;readButton.textContent='辨識中…';note('正在準備與辨識活動資料，原表單未變更…');
      try{
        const data=await fileData(selected,signal);if(!valid(g,actor)||signal.aborted)return;
        const response=await options.api('/dm-draft',{file:{type:selected.type==='application/pdf'?'application/pdf':'image/jpeg',data}},scope,55000);
        if(!valid(g,actor)||signal.aborted)return;draft=response.draft;draftActor=actor;prepared={type:selected.type==='application/pdf'?'application/pdf':'image/jpeg',data};recognized=true;
        const dl=q('dl');dl.replaceChildren();for(const [label,value]of [['活動名稱',draft.activityName],['活動時間原文',draft.scheduleText],['活動開始',draft.startTime],['活動結束',draft.endTime],['活動地點',draft.location],['活動說明',draft.description],['費用',draft.price===null?'':draft.price===0?'免費':'NT$ '+draft.price]]){const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=value||'未能確認，請手動補填';dl.append(dt,dd);}
        const sessions=q('[data-dm-sessions]');sessions.replaceChildren();const legend=document.createElement('legend');legend.textContent='選擇本場時段（單選）';sessions.append(legend);sessions.hidden=draft.timeStatus!=='multiple';
        if(draft.timeStatus==='multiple')for(const [i,b]of (draft.batches||[]).entries()){const label=document.createElement('label'),radio=document.createElement('input');radio.type='radio';radio.name='dm-session';radio.value=String(i);label.append(radio,document.createTextNode(b.name+' · '+b.scheduleText));sessions.append(label);}
        q('[data-dm-warning]').textContent=(draft.confidenceNote||'請核對原檔後再套用。')+(draft.timeStatus==='multiple'?'；本會員模式只辦一場，請選擇本次時段，系統不會拆成多場。':'');result.hidden=false;note('辨識完成，先核對再帶入；尚未建立活動。');
      }catch(e){if(g===generation&&!disposed){draft=null;note(e.message||'辨識失敗，原表單未變更');}}
      finally{if(g===generation){busy=false;controller=null;input.disabled=false;readButton.disabled=!file;readButton.textContent='重新辨識 DM／PDF';cancel.hidden=true;}}
    };
    q('[data-dm-apply]').onclick=async()=>{
      if(!draft||busy||!options.isValid())return;
      const chosen=q('input[name="dm-session"]:checked');if(draft.timeStatus==='multiple'&&!chosen&&(draft.batches||[]).length){note('請先選擇本場時段');return;}
      const candidate=chosen?draft.batches[Number(chosen.value)]:draft,amount=chosen?candidate.price:draft.price;
      const fields={title:draft.activityName,description:draft.description,location:draft.location,startsAt:candidate.startTime||'',endsAt:candidate.endTime||'',feeText:amount===null||amount===undefined?'':amount===0?'免費':'NT$ '+amount};
      const g=generation,actor=draftActor;busy=true;
      try{if(!actor||!valid(g,actor))throw Error('登入身分已變更，請重新辨識');const current=options.get();if(Object.values(current).some(Boolean)&&!await options.confirm('帶入將取代目前活動名稱、時間、地點、說明及費用；DM 將帶到確認頁，尚未上傳或發布。要繼續嗎？'))return;if(!valid(g,actor))return;options.apply(fields,actor,prepared);draft=null;draftActor=null;result.hidden=true;note('已帶入文字及 DM 草稿，請核對後確認發布；尚未上傳或儲存。');}catch(e){note(e.message);}finally{busy=false;}
    };
    const toggle=()=>{root.hidden=!options.isValid();if(root.hidden)clear();};options.checkbox?.addEventListener('change',toggle);toggle();
    const observer=new MutationObserver(toggle);observer.observe(options.watch||container,{attributes:true,attributeFilter:['class','hidden'],subtree:false});
    const dispose=()=>{if(disposed)return;clear();disposed=true;scope.closed=true;observer.disconnect();options.checkbox?.removeEventListener('change',toggle);window.removeEventListener('pagehide',dispose);};window.addEventListener('pagehide',dispose);return dispose;
  };
})();
