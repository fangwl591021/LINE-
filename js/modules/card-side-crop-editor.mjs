// This editor always starts from the uncut source, never from an AI-cropped thumbnail.
export async function editCardSideImage(source, label, {allowReplace=false}={}) {
  if(typeof window.Cropper!=='function')throw new Error('裁切工具尚未載入，請重新整理後再試');
  const dialog=document.createElement('dialog');
  dialog.setAttribute('aria-label',label+'圖片裁切');
  dialog.style.cssText='box-sizing:border-box;width:min(96vw,620px);max-height:94dvh;padding:18px;border:0;border-radius:20px;color:#183a3a;background:white;overflow:auto';
  dialog.innerHTML='<h2 style="margin:0 0 8px">調整'+label+'</h2><p style="margin:8px 0">拖曳框線，只保留完整名片。確認四邊、姓名及聯絡資訊都在框內。</p>'+
    (allowReplace?'<p>若原圖已被裁掉，請重新上傳完整原照。</p><label>重新上傳'+label+'原照 <input type="file" accept="image/*" data-replace></label>':'')+
    '<div style="height:min(48dvh,420px);margin:12px 0;background:#e2e8f0"><img data-source alt="'+label+'原始圖片" style="display:block;max-width:100%"></div>'+
    '<div style="display:flex;gap:8px;flex-wrap:wrap"><button type="button" data-rotate>旋轉 90°</button><button type="button" data-reset>重設</button></div><p data-error role="alert" style="color:#b91c1c"></p>'+
    '<div style="display:flex;gap:8px;flex-wrap:wrap;position:sticky;bottom:0;background:white;padding-top:10px"><button type="button" data-cancel>取消</button><button type="button" data-save style="background:#008568;color:white">確認裁切</button></div>';
  dialog.querySelectorAll('button').forEach(button=>{button.style.cssText+=';min-height:44px;border:1px solid #cbd5e1;border-radius:10px;padding:10px 16px;font:inherit;font-weight:700;cursor:pointer';});
  if(allowReplace)dialog.querySelector('[data-save]').textContent='確認裁切並儲存';
  document.body.appendChild(dialog);dialog.showModal();
  return new Promise(resolve=>{
    let cropper=null,url='',closed=false,busy=false,generation=0;
    const img=dialog.querySelector('[data-source]'),error=dialog.querySelector('[data-error]');
    const controls=disabled=>dialog.querySelectorAll('button,input').forEach(el=>el.disabled=el.hasAttribute('data-cancel')?false:disabled);
    const finish=result=>{if(closed)return;closed=true;generation++;cropper?.destroy();if(url)URL.revokeObjectURL(url);dialog.close();dialog.remove();resolve(result);};
    async function load(file){
      const current=++generation;busy=true;controls(true);error.textContent='';
      try{
        if(!file?.type?.startsWith('image/')||file.size>15*1024*1024)throw new Error('請選擇 15 MB 以內的圖片');
        // Bake camera orientation into pixels once; Cropper must not reapply EXIF.
        const bitmap=await createImageBitmap(file);
        let normalized;
        try{const c=document.createElement('canvas'),scale=Math.min(1,2200/Math.max(bitmap.width,bitmap.height));c.width=Math.round(bitmap.width*scale);c.height=Math.round(bitmap.height*scale);c.getContext('2d').drawImage(bitmap,0,0,c.width,c.height);normalized=await new Promise(r=>c.toBlob(r,'image/png'));}finally{bitmap.close?.();}
        if(closed||current!==generation)return;
        if(!normalized)throw new Error('無法讀取圖片');
        cropper?.destroy();cropper=null;if(url)URL.revokeObjectURL(url);
        url=URL.createObjectURL(normalized);img.src=url;
        cropper=new window.Cropper(img,{viewMode:1,dragMode:'crop',autoCropArea:1,aspectRatio:NaN,background:false,checkOrientation:false,rotatable:true,zoomable:false,toggleDragModeOnDblclick:false,
          ready(){if(closed||current!==generation)return;busy=false;controls(false);}});
      }catch(e){if(!closed){busy=false;controls(false);error.textContent=e.message||'圖片讀取失敗';}}
    }
    dialog.querySelector('[data-cancel]').onclick=()=>finish(null);
    dialog.addEventListener('cancel',event=>{event.preventDefault();finish(null);});
    dialog.querySelector('[data-rotate]').onclick=()=>cropper?.rotate(90);
    dialog.querySelector('[data-reset]').onclick=()=>cropper?.reset();
    const replace=dialog.querySelector('[data-replace]');if(replace)replace.onchange=()=>{const file=replace.files?.[0];replace.value='';if(file&&!busy)load(file);};
    dialog.querySelector('[data-save]').onclick=async()=>{
      if(busy||!cropper)return;busy=true;controls(true);error.textContent='';
      try{
        const canvas=cropper.getCroppedCanvas({maxWidth:1600,maxHeight:1600,imageSmoothingEnabled:true,imageSmoothingQuality:'high',fillColor:'#ffffff'});
        if(!canvas||canvas.width<40||canvas.height<40)throw new Error('裁切範圍太小，請重新調整');
        const blob=await new Promise(r=>canvas.toBlob(r,'image/webp',.92));
        if(!blob)throw new Error('無法產生裁切圖片');
        finish(new File([blob],'card-side.webp',{type:'image/webp'}));
      }catch(e){busy=false;controls(false);error.textContent=e.message||'裁切失敗';}
    };
    load(source);
  });
}
