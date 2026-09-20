// Shared by the standalone and LIFF partner administration forms.
(function(){
  const labels={name:'店家名稱',category:'業種',summary:'簡介',description:'詳細介紹',phone:'店家電話',contactName:'聯絡人',contactEmail:'聯絡 Email',taxId:'統一編號',websiteUrl:'官網',lineUrl:'LINE 網址',branchName:'分店名稱',city:'縣市',district:'區域',address:'地址',businessHours:'營業時間',mapsUrl:'地圖網址'};
  async function api(path,data){
    const token=window.liff?.getAccessToken?.();if(!token)throw new Error('請先使用 LINE 登入');
    const base=String(window.WORKER_URL||(typeof WORKER_URL!=='undefined'?WORKER_URL:'')).replace(/\/$/,'');
    if(!base)throw new Error('未設定服務網址');
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),90000);
    try{
      const response=await fetch(base+'/v1/store-shop/admin/onboarding'+path,{method:data?'POST':'GET',signal:controller.signal,headers:{Authorization:'Bearer '+token,...(data?{'Content-Type':'application/json'}:{})},...(data?{body:JSON.stringify(data)}:{})});
      const result=await response.json();
      if(window.liff?.getAccessToken?.()!==token)throw new Error('登入狀態已變更，請重新開啟表單');
      if(!response.ok||result.success!==true)throw new Error(result.error||'讀取失敗，請重試');return result;
    }catch(e){throw new Error(e.name==='AbortError'?'連線逾時，請稍後重試':e.message||'連線失敗');}
    finally{clearTimeout(timer);}
  }
  async function prepareImage(file){
    if(!file||!['image/jpeg','image/png','image/webp'].includes(file.type))throw new Error('請上傳 JPG、PNG 或 WebP 名片／DM');
    if(file.size>10*1024*1024)throw new Error('原始圖片請小於 10 MB');
    const url=URL.createObjectURL(file),image=new Image();
    try{
      await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(new Error('無法讀取圖片'));image.src=url;});
      if(!image.naturalWidth||!image.naturalHeight)throw new Error('圖片尺寸不正確');
      const ratio=Math.min(1,2000/Math.max(image.naturalWidth,image.naturalHeight));
      const canvas=document.createElement('canvas');canvas.width=Math.round(image.naturalWidth*ratio);canvas.height=Math.round(image.naturalHeight*ratio);
      const context=canvas.getContext('2d');context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(image,0,0,canvas.width,canvas.height);
      const data=canvas.toDataURL('image/jpeg',0.9);if(data.length>Math.ceil(4*1024*1024*4/3)+32)throw new Error('圖片仍過大，請縮小後重試');return data;
    }finally{URL.revokeObjectURL(url);}
  }
  function mount(options){
    const {select,fields,sourceField,handleField,onCards}=options;
    select.setAttribute('aria-label','選擇收藏名片');
    const doc=select.ownerDocument;
    if(!doc.getElementById('partner-onboarding-styles')){
      const css=doc.createElement('link');css.id='partner-onboarding-styles';css.rel='stylesheet';css.href='css/partner-onboarding.css?v=1';doc.head.append(css);
    }
    const el=(tag,text)=>{const node=doc.createElement(tag);if(text!==undefined)node.textContent=text;return node;};
    const button=(text,handler)=>{const node=el('button',text);node.type='button';node.addEventListener('click',handler);return node;};
    const sourcePanel=select.parentElement.parentElement;
    const search=el('div');search.className='partner-source-search';
    const label=el('label','搜尋收藏名片'),query=el('input');query.type='search';query.maxLength=80;query.placeholder='姓名、公司、電話、地址或服務';label.append(query);
    const searchButton=button('搜尋',()=>void load(false)),more=button('載入更多',()=>void load(true));more.hidden=true;
    const searchStatus=el('p');searchStatus.setAttribute('role','status');search.append(label,searchButton,more,searchStatus);sourcePanel.insertBefore(search,select.parentElement);
    const panel=el('section');panel.className='partner-ai-onboarding';sourcePanel.after(panel);
    panel.append(el('h4','AI 開店'),el('p','選擇資料來源，AI 先整理草稿，再由你確認並修改。'));
    const modeLabel=el('label','分析來源'),mode=el('select');
    for(const [value,text]of [['card','上方已選的收藏名片'],['image','上傳名片／DM 圖片'],['website','官方網站網址']]){const option=el('option',text);option.value=value;mode.append(option);}modeLabel.append(mode);panel.append(modeLabel);
    mode.value='card';
    const fileLabel=el('label','名片／DM（JPG、PNG、WebP；原圖最多 10 MB）'),file=el('input');file.type='file';file.accept='image/jpeg,image/png,image/webp';fileLabel.append(file);fileLabel.hidden=true;panel.append(fileLabel);
    const imagePreview=el('img');imagePreview.alt='待分析名片或 DM 預覽';imagePreview.hidden=true;panel.append(imagePreview);
    const urlLabel=el('label','公開 HTTPS 官網網址'),url=el('input');url.type='url';url.maxLength=500;url.placeholder='https://…';urlLabel.append(url);urlLabel.hidden=true;panel.append(urlLabel);
    panel.append(el('p','分析資料將傳送 OpenAI。請只提供有權使用的店家資料；圖片不會自動公開，不會建立名片或贈扣點。'));
    const analyze=button('AI 分析開店資料',()=>void run());analyze.className='primary';
    const status=el('p');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
    const result=el('div'),apply=button('確認帶入空白欄位',applyDraft);apply.hidden=true;apply.className='primary';panel.append(analyze,status,result,apply);
    let cards=[],next='',searchEpoch=0,searching=false,epoch=0,busy=false,imageData='',draft=null;
    function invalidate(){epoch++;draft=null;result.replaceChildren();apply.hidden=true;status.textContent='';}
    function reset(){invalidate();file.value='';url.value='';imageData='';imagePreview.removeAttribute('src');imagePreview.hidden=true;mode.value='card';fileLabel.hidden=true;urlLabel.hidden=true;}
    function changeMode(){invalidate();fileLabel.hidden=mode.value!=='image';urlLabel.hidden=mode.value!=='website';imagePreview.hidden=mode.value!=='image'||!imageData;}
    mode.addEventListener('change',changeMode);url.addEventListener('input',invalidate);select.addEventListener('change',invalidate);
    query.addEventListener('input',()=>{searchEpoch++;next='';more.hidden=true;select.replaceChildren(el('option','按搜尋以更新結果'));select.value='';onCards([]);invalidate();searchStatus.textContent='請按搜尋或 Enter';});
    query.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();void load(false);}});
    file.addEventListener('change',async()=>{
      invalidate();imageData='';imagePreview.hidden=true;imagePreview.removeAttribute('src');const ticket=epoch;
      if(!file.files?.[0])return;analyze.disabled=true;status.textContent='處理圖片中…';
      try{const data=await prepareImage(file.files[0]);if(ticket!==epoch)return;imageData=data;imagePreview.src=data;imagePreview.hidden=false;status.textContent='圖片就緒，請按 AI 分析。';}
      catch(e){if(ticket===epoch)status.textContent=e.message;}
      finally{analyze.disabled=busy;}
    });
    async function load(append=false){
      if(append&&(!next||searching))return;
      const ticket=++searchEpoch,cursor=append?next:'';searching=true;searchButton.disabled=true;more.disabled=true;searchStatus.textContent='搜尋本人收藏中…';
      if(!append){cards=[];onCards([]);select.replaceChildren(el('option','搜尋中…'));invalidate();}
      try{
        const response=await api('/cards?q='+encodeURIComponent(query.value.trim())+'&after='+encodeURIComponent(cursor));
        if(ticket!==searchEpoch)return;
        if(!Array.isArray(response.cards))throw new Error('收藏名片回傳格式不正確');
        const selected=append?select.value:'';
        cards=[...new Map([...cards,...response.cards].map(card=>[card.rowId,card])).values()];onCards(cards);next=response.next||'';
        const prompt=el('option',cards.length?'請選擇收藏名片':'沒有符合的收藏名片');prompt.value='';select.replaceChildren(prompt);
        for(const card of cards){const option=el('option',[card.companyName,card.name,card.officePhone||card.mobile].filter(Boolean).join('｜')||'未命名收藏名片');option.value=card.rowId;select.append(option);}
        select.value=selected;more.hidden=!next;searchStatus.textContent='已載入 '+cards.length+' 張'+(next?'，可繼續載入更多':'');
      }catch(e){if(ticket===searchEpoch){searchStatus.textContent=e.message;if(!append)select.replaceChildren(el('option','讀取失敗，請重新搜尋'));}}
      finally{searching=false;searchButton.disabled=false;more.disabled=false;}
    }
    async function run(){
      if(busy)return;invalidate();const ticket=epoch,handle=handleField.value;let data;
      if(mode.value==='card'){if(!select.value){status.textContent='請先搜尋並選擇收藏名片';return;}data={mode:'card',cardId:select.value};}
      else if(mode.value==='image'){if(!imageData){status.textContent='請先上傳名片或 DM 圖片';return;}data={mode:'image',base64Image:imageData};}
      else{if(!url.value.trim()){status.textContent='請輸入官網網址';return;}data={mode:'website',url:url.value.trim()};}
      busy=true;analyze.disabled=true;status.textContent='AI 分析中，尚未儲存店家…';
      try{
        const response=await api('/analyze',data);if(ticket!==epoch||handle!==handleField.value)return;
        if(!response.fields||!Array.isArray(response.warnings))throw new Error('AI 回傳格式不完整');
        draft={...response,handle};const heading=el('h5','分析預覽｜請核對後帶入'),list=el('dl');result.append(heading,list);
        for(const [key,label]of Object.entries(labels)){const value=response.fields[key];if(!value)continue;list.append(el('dt',label),el('dd',value));}
        for(const warning of response.warnings)result.append(el('p','需確認：'+warning));
        const missing=Object.keys(labels).filter(key=>!response.fields[key]).map(key=>labels[key]);if(missing.length)result.append(el('p','未辨識／待補：'+missing.join('、')));
        status.textContent='分析完成；按下方按鈕只填空白欄位，已有內容保留。仍須自行按「儲存店家」。';apply.hidden=false;
      }catch(e){if(ticket===epoch)status.textContent=e.message;}
      finally{busy=false;analyze.disabled=false;}
    }
    function applyDraft(){
      if(!draft||draft.handle!==handleField.value)return;let count=0,kept=0;
      for(const [key,id]of Object.entries(fields)){
        const node=doc.getElementById(id),value=draft.fields[key];if(!node||!value)continue;
        if(String(node.value||'').trim()){kept++;continue;}
        node.value=value;node.dispatchEvent(new Event('input',{bubbles:true}));count++;
      }
      if(draft.sourceCardRowId&&!sourceField.value)sourceField.value=draft.sourceCardRowId;
      status.textContent=`已帶入 ${count} 個空白欄位，保留 ${kept} 個既有欄位。請修改核對後再儲存；尚未建立或上架店家。`;
      draft=null;apply.hidden=true;
    }
    return {load,reset};
  }
  window.PartnerOnboarding={mount};
})();
