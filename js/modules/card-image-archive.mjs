// Original-photo preservation runs beside the local preview; record writes await ensure().
export function createCardImageArchive({prepared,uploadOriginal,uploadProcessed,onChange=()=>{},timeoutMs=120000}) {
  const task={status:'pending',jobId:'',error:'',promise:null,cancel,ensure};
  let job=null,controller=null,generation=0;
  function start(){
    const run=++generation;controller=new AbortController();const activeController=controller,signal=activeController.signal;
    task.status='uploading';task.error='';
    const timer=setTimeout(()=>activeController.abort(new DOMException('圖片上傳逾時','TimeoutError')),timeoutMs);
    task.promise=(async()=>{
      const [original,file]=await Promise.all([job||uploadOriginal(signal),prepared]);
      if(signal.aborted||run!==generation)throw new Error('圖片上傳已取消');
      job=original;task.jobId=job.id;
      await uploadProcessed(job.id,file,signal);
      if(signal.aborted||run!==generation)throw new Error('圖片上傳已取消');
      task.status='completed';return true;
    })().catch(error=>{
      if(run===generation){const timedOut=signal.reason?.name==='TimeoutError';task.status=signal.aborted&&!timedOut?'cancelled':'failed';task.error=timedOut?'圖片上傳逾時，請確認網路後重試':error?.message||'圖片上傳失敗';}
      return false;
    }).finally(()=>{clearTimeout(timer);if(run===generation)onChange(task);});
    onChange(task);
  }
  function cancel(){if(task.status==='completed'||task.status==='cancelled')return;generation++;controller?.abort();task.status='cancelled';task.error='圖片上傳已取消';onChange(task);}
  async function ensure(){
    if(task.status==='failed')start();
    await task.promise;
    if(task.status!=='completed')throw new Error(task.error||'圖片尚未完成上傳');
    return job;
  }
  start();return task;
}
