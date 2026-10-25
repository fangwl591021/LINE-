// Presence describes recent activity in this page, never LINE-wide availability.
export function createIslandPresence({client,getMembers,isCurrent,isVisible,onUpdate,onState=()=>{},heartbeatClock={at:-Infinity},doc=document,view=window,now=()=>Date.now()}={}) {
  const INTERVAL=70000;
  let destroyed=false,epoch=0,timer=null,running=null,queued=false,halted=false;
  const current=()=>!destroyed&&!halted&&isCurrent()&&client.current();
  const visible=()=>current()&&!doc.hidden&&isVisible();
  function rejectIdentity(){
    if(!destroyed&&isCurrent()&&client.current()){
      onUpdate(getMembers().map(row=>({handle:row.handle,online:false,onlineKnown:false})));
      onState('unavailable');
    }
    halted=true;
  }
  const clear=()=>{if(timer!==null)view.clearTimeout(timer);timer=null;};
  const schedule=delay=>{clear();if(visible())timer=view.setTimeout(()=>{timer=null;void pulse();},delay);};
  async function pulse(){
    if(!visible())return;
    if(running){queued=true;return running;}
    const ticket=epoch;
    const valid=()=>ticket===epoch&&visible();
    queued=false;
    running=(async()=>{
      let unavailable=false;
      if(now()-heartbeatClock.at>=INTERVAL){
        heartbeatClock.at=now();
        try{await client.request('/presence',{});}
        catch(error){
          unavailable=true;
          if([401,403].includes(error.status)){rejectIdentity();return;}
        }
      }
      if(!valid())return;
      const handles=[...new Set(getMembers().map(row=>row.handle).filter(handle=>typeof handle==='string'&&handle))];
      const statuses=new Map(handles.map(handle=>[handle,{handle,online:false,onlineKnown:false}]));
      for(let offset=0;offset<handles.length;offset+=100){
        if(!valid())return;
        const batch=handles.slice(offset,offset+100),allowed=new Set(batch);
        try{
          const result=await client.request('/presence?'+new URLSearchParams({handles:JSON.stringify(batch)}));
          if(!valid())return;
          if(result.presenceAvailable!==true){unavailable=true;continue;}
          for(const row of Array.isArray(result.items)?result.items:[]){
            if(allowed.has(row?.handle)&&row.onlineKnown===true&&typeof row.online==='boolean')statuses.set(row.handle,{handle:row.handle,online:row.online,onlineKnown:true});
          }
        }catch(error){
          unavailable=true;
          if([401,403].includes(error.status)){rejectIdentity();return;}
        }
      }
      if(!valid())return;
      onUpdate([...statuses.values()]);
      const known=[...statuses.values()].filter(row=>row.onlineKnown).length;
      onState(unavailable||known<handles.length?'unavailable':'ready');
    })().catch(()=>{if(valid())onState('unavailable');}).finally(()=>{
      running=null;
      if(!current()){clear();return;}
      if(queued&&visible()){queued=false;schedule(0);}else schedule(INTERVAL);
    });
    return running;
  }
  function refresh(){
    if(destroyed)return;
    epoch++;halted=false;clear();
    if(visible())void pulse();
  }
  const visibility=()=>{
    epoch++;clear();
    if(visible())void pulse();
  };
  doc.addEventListener('visibilitychange',visibility);
  return {
    refresh,
    destroy(){if(destroyed)return;destroyed=true;epoch++;queued=false;clear();doc.removeEventListener('visibilitychange',visibility);}
  };
}
