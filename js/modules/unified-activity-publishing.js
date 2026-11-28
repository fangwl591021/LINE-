(function(){
  'use strict';
  const labels={full:'繳費／NFC',quick:'匯入名單',series:'多梯次'};
  const localTime=value=>value.replace('T',' ');
  const nonnegative=(value,label)=>{
    const number=Number(value);
    if(!value||!Number.isSafeInteger(number)||number<0)throw Error(label+'須填 0 或正整數。');
    return number;
  };
  window.mountUnifiedActivityOptions=function(form){
    const details=document.createElement('details');
    details.className='me-advanced';
    details.innerHTML='<summary>進階設定</summary><label>發布方式<select name="publicationMode"><option value="">一般活動</option><option value="full">繳費／NFC</option><option value="quick">匯入名單</option><option value="series">多梯次</option></select></label><div data-official-options hidden></div>';
    form.querySelector('[data-cancel]').parentElement.before(details);
    const options=details.querySelector('[data-official-options]');
    options.innerHTML='<p class="me-muted">進階發布使用原活動管理與核銷。單場依原流程報名，梯次可獨立設定名額。DM 封面接受圖片。</p><label data-official-fee>費用（免費填 0）<input name="officialPrice" type="number" min="0" step="1" value="0"></label><div class="me-times"><label>NFC 簽到開始<input name="officialNfcStart" type="datetime-local"></label><label>NFC 簽到結束<input name="officialNfcEnd" type="datetime-local"></label></div><label data-official-names hidden>匯入名單（每行一個姓名）<textarea name="officialNames" rows="5" maxlength="12000"></textarea></label><div data-official-series hidden><div data-batches></div><button type="button" data-add-batch>＋ 新增梯次</button></div>';
    const list=options.querySelector('[data-batches]');
    function addBatch(){
      if(list.children.length>=24)return;
      const row=document.createElement('fieldset');
      row.innerHTML='<legend>梯次</legend><label>梯次名稱<input data-batch-name maxlength="120"></label><div class="me-times"><label>開始<input data-batch-start type="datetime-local"></label><label>結束<input data-batch-end type="datetime-local"></label></div><div class="me-times"><label>費用（免費填 0）<input data-batch-price type="number" min="0" step="1" value="0"></label><label>名額（留空不限）<input data-batch-limit type="number" min="1" step="1"></label></div><button type="button">移除梯次</button>';
      row.querySelector('button').onclick=()=>row.remove();
      list.append(row);
    }
    options.querySelector('[data-add-batch]').onclick=addBatch;
    function update(){
      const mode=form.elements.publicationMode.value,advanced=!!labels[mode];
      options.hidden=!advanced;
      options.querySelector('[data-official-fee]').hidden=mode==='series';
      options.querySelector('[data-official-names]').hidden=mode!=='quick';
      options.querySelector('[data-official-series]').hidden=mode!=='series';
      for(const name of ['capacity','registrationClosesAt','feeText']){
        const control=form.elements[name];
        control.disabled=advanced;
        control.closest('label').hidden=advanced;
      }
      for(const name of ['startsAt','endsAt']){
        const control=form.elements[name];
        control.disabled=mode==='series';
        control.closest('label').hidden=mode==='series';
      }
      for(const control of options.querySelectorAll('input,textarea')){
        control.disabled=!advanced||!!control.closest('[hidden]');
      }
      if(mode==='series'&&!list.children.length)addBatch();
    }
    form.elements.publicationMode.onchange=update;
    update();
    return function readAdvanced(){
      const value=name=>form.elements[name].value;
      const mode=value('publicationMode');
      if(!labels[mode])return null;
      const start=value('officialNfcStart'),end=value('officialNfcEnd');
      if((start||end)&&(!start||!end||start>=end))throw Error('請填寫有效的 NFC 簽到起迄時間。');
      const names=mode==='quick'?value('officialNames').split(/\r?\n/).map(s=>s.trim()).filter(Boolean):[];
      if(mode==='quick'&&(!names.length||names.length>300||names.some(name=>name.length>80)))throw Error('請逐行填寫 1–300 位參加者，每人最多 80 字。');
      let batches=[];
      let price=0;
      if(mode==='series'){
        batches=[...list.children].map((row,index)=>{
          const get=key=>row.querySelector('[data-batch-'+key+']').value;
          const name=get('name').trim(),starts=get('start'),ends=get('end'),limit=get('limit');
          if(!name||!starts||!ends||starts>=ends)throw Error('請填妥第 '+(index+1)+' 梯次的名稱及起迄時間。');
          if(limit&&(!Number.isSafeInteger(Number(limit))||Number(limit)<1))throw Error('梯次名額須為正整數或留空。');
          return {name,startTime:localTime(starts),endTime:localTime(ends),price:nonnegative(get('price'),'梯次費用'),limit,nfcCheckinStart:start,nfcCheckinEnd:end};
        });
        if(!batches.length)throw Error('請至少新增一個梯次。');
        price=Math.max(...batches.map(b=>b.price));
      }else{
        price=nonnegative(value('officialPrice'),'活動費用');
      }
      if(mode!=='series'&&value('startsAt')>=value('endsAt'))throw Error('活動結束時間須晚於開始。');
      const startTime=mode==='series'?batches.map(b=>b.startTime).sort()[0]:localTime(value('startsAt'));
      const endTime=mode==='series'?batches.map(b=>b.endTime).sort().at(-1):localTime(value('endsAt'));
      return {activityName:value('title').trim(),activityType:value('category').trim(),startTime,
        endTime,description:'地點：'+value('location').trim()+'\n'+value('description').trim(),
        feeType:price?'收費':'免費',price,names,nfcCheckinStart:start,nfcCheckinEnd:end,nfcCheckinSameDayOnly:true,
        isBatch:mode==='series',...(mode==='series'?{batches}:{}),imageUrl:value('coverUrl')};
    };
  };
})();
