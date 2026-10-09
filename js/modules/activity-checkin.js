/* Activity/course QR only. Local rendering/decoding; no points, identity or registration writes. */
(() => {
  'use strict';
  let qrLibrary,decoderLibrary,active;
  const library=()=>qrLibrary||(qrLibrary=import('../vendor/qrcode-generator-2.0.4.mjs').catch(e=>{qrLibrary=null;throw e;}));
  window.renderActivityCheckinQr=async(element,text,size=240,isCurrent=()=>true)=>{
    const {default:qrcode}=await library();if(!isCurrent())return false;
    const qr=qrcode(0,'M');qr.addData(String(text),'Byte');qr.make();
    const svg=qr.createSvgTag({cellSize:4,margin:16,scalable:true});
    if(element.tagName==='IMG')element.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);
    else{element.innerHTML=svg;const node=element.querySelector('svg');node.style.width=size+'px';node.style.maxWidth='100%';node.setAttribute('role','img');node.setAttribute('aria-label','活動報名 QR');}
    return true;
  };
  window.parseActivityCheckinQr=value=>{
    let url;try{url=new URL(String(value).trim());}catch{throw Error('請掃描活動／課程的報名核銷 QR');}
    const liffId=window.DEFAULT_LIFF_ID||'1660923784-vViMTZ1y';
    const platform=url.origin==='https://fangwl591021.github.io'&&url.pathname==='/LINE-/';
    const local=url.origin===location.origin&&url.pathname===location.pathname;
    const liff=url.origin==='https://liff.line.me'&&url.pathname==='/'+liffId;
    if(!(platform||local||liff)||url.username||url.password||url.hash)throw Error('不是本平台的活動核銷 QR');
    const allowed=new Set(['verifyCheckin','checkinRowId','registrationId','activityId']);
    if([...url.searchParams.keys()].some(k=>!allowed.has(k)||url.searchParams.getAll(k).length!==1))throw Error('活動 QR 參數不正確');
    const ids=['verifyCheckin','checkinRowId','registrationId'].map(k=>url.searchParams.get(k)).filter(Boolean);
    const rowId=ids[0],activityId=url.searchParams.get('activityId')||'';
    if(ids.length!==1||!rowId||rowId.length>250||/[\s\x00-\x1f]/.test(rowId)||activityId.length>250)throw Error('活動 QR 缺少有效報名編號');
    return {rowId,activityId};
  };
  async function decoder(){
    if(window.jsQR)return;
    if(!decoderLibrary)decoderLibrary=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='js/vendor/jsQR.js?v=1';script.onload=resolve;script.onerror=()=>{script.remove();decoderLibrary=null;reject(Error('掃描元件未載入，請重試'));};document.head.append(script);});
    await decoderLibrary;
  }
  window.openActivityCheckinScanner=({activityId,title,api,getActor,isCurrent=()=>true,onComplete=async()=>{}})=>{
    if(active){active.focus();return;}
    if(!activityId||typeof api!=='function')return;
    const identity=getActor||(()=>({uid:window.currentUserProfile?.userId,token:window.liff?.getAccessToken?.()}));
    let actor;try{actor=identity();}catch{actor=null;}if(!actor?.uid||!actor.token){window.showToast?.('請先以本場主辦／店主身分登入',true);return;}
    const dialog=document.createElement('dialog');dialog.className='activity-checkin-dialog';dialog.setAttribute('aria-label','活動核銷掃描器');
    dialog.innerHTML='<header><button type="button" data-close>‹ 返回名單</button><h2>活動核銷掃描器</h2><button type="button" data-close aria-label="關閉核銷掃描器">×</button></header><section><h3 data-title></h3><p>請學員開啟活動報名紀錄並出示核銷 QR；不是商城點數 QR。</p><video playsinline muted></video><p data-status role="status" aria-live="polite">按開始掃描，允許相機後對準報名 QR。</p><div class="activity-checkin-actions"><button type="button" data-start>開始掃描</button><label>選擇 QR 圖片<input type="file" data-image accept="image/png,image/jpeg,image/webp"></label></div><details><summary>無法使用相機？貼上 QR 內容</summary><input data-ticket autocomplete="off" aria-label="活動 QR 內容"><button type="button" data-submit>核銷貼上的 QR</button></details></section>';
    dialog.querySelector('[data-title]').textContent=title||'本場活動';document.body.append(dialog);dialog.showModal();active=dialog;
    const video=dialog.querySelector('video'),status=dialog.querySelector('[data-status]');let stream,timer,watcher,closed=false,starting=false,redeeming=false,last='';
    const valid=()=>{try{const now=identity();return !closed&&isCurrent()&&now.uid===actor.uid&&now.token===actor.token;}catch{return false;}};
    const stop=()=>{clearTimeout(timer);stream?.getTracks().forEach(t=>t.stop());stream=null;video.srcObject=null;};
    const close=()=>{if(closed)return;closed=true;stop();clearInterval(watcher);window.removeEventListener('pagehide',close);document.removeEventListener('visibilitychange',visibility);dialog.close();dialog.remove();if(active===dialog)active=null;};
    const visibility=()=>{if(document.hidden)stop();};
    dialog.querySelectorAll('[data-close]').forEach(b=>b.onclick=close);dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
    window.addEventListener('pagehide',close);document.addEventListener('visibilitychange',visibility);watcher=setInterval(()=>{if(!valid())close();},250);
    const note=text=>{if(valid())status.textContent=text;};
    const redeem=async value=>{
      if(!valid()||redeeming)return;redeeming=true;note('正在核對本場報名…');
      try{
        const ticket=window.parseActivityCheckinQr(value);
        // Server checks the authoritative registration, including legacy child batches.
        const result=await api('redeemActivityCheckin',{rowId:ticket.rowId,activityId});
        if(!valid())return;const data=result?.data||result;
        if(result?.error||result?.success===false||data?.checkedIn!==true)throw Error(result?.error||'未確認核銷成功，請重新整理名單核對');
        note(data.duplicate?'已核銷，未重複計算。':'核銷成功。');
        try{await onComplete(data);}catch{note('核銷已完成，但名單更新失敗，請返回重新整理核對。');}
      }catch(error){note(error.message||'核銷未確認，請重新整理名單核對');}finally{redeeming=false;}
    };
    const decodeImage=(image)=>{const c=document.createElement('canvas'),scale=Math.min(1,1600/(image.videoWidth||image.naturalWidth||image.width));c.width=Math.round((image.videoWidth||image.naturalWidth||image.width)*scale);c.height=Math.round((image.videoHeight||image.naturalHeight||image.height)*scale);const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0,c.width,c.height);const frame=ctx.getImageData(0,0,c.width,c.height);return window.jsQR(frame.data,frame.width,frame.height,{inversionAttempts:'attemptBoth'})?.data;};
    dialog.querySelector('[data-start]').onclick=async()=>{
      if(starting||!valid()||document.hidden)return;starting=true;stop();last='';
      try{
        await decoder();if(!valid())return;
        const candidate=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:640}},audio:false});
        if(!valid()||document.hidden){candidate.getTracks().forEach(t=>t.stop());return;}stream=candidate;video.srcObject=stream;await video.play();note('對準本場活動／課程的報名核銷 QR');
        const tick=async()=>{if(!valid()||!stream)return;try{if(video.readyState>=2&&video.videoWidth){const found=decodeImage(video);if(found&&found!==last){last=found;await redeem(found);}else if(!found)last='';}}catch{stop();note('無法讀取相機畫面，請選擇 QR 圖片／貼上 QR 內容。');}if(valid()&&stream)timer=setTimeout(tick,250);};void tick();
      }catch{stop();note('無法開啟相機，請允許相機權限，或選擇 QR 圖片／貼上 QR 內容。');}finally{starting=false;}
    };
    dialog.querySelector('[data-submit]').onclick=()=>redeem(dialog.querySelector('[data-ticket]').value.trim());
    dialog.querySelector('[data-image]').onchange=async event=>{
      const file=event.target.files?.[0];if(!file||!valid())return;stop();
      if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>10*1024*1024){note('請選擇 10 MB 內的 QR 圖片');return;}
      let url;try{await decoder();if(!valid())return;url=URL.createObjectURL(file);const image=new Image();image.src=url;await image.decode();if(!valid())return;const found=decodeImage(image);if(!found)throw Error('圖片中找不到 QR，請重選清晰圖片');await redeem(found);}catch(e){note(e.message||'圖片無法辨識');}finally{if(url)URL.revokeObjectURL(url);event.target.value='';}
    };
  };
})();
