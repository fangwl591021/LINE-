export const gameUser=()=>window.currentUserProfile?.userId||'';
export const deviceType=()=>matchMedia('(pointer:coarse)').matches?'mobile':'desktop';
export async function gameAPI(action,payload={}){
 if(!gameUser()||typeof window.fetchAPI!=='function')throw Error('請重新進入 LINE LIFF 登入後挑戰');
 let timer;try{
  const response=await Promise.race([window.fetchAPI(action,payload,true),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('連線逾時，請重新確認獎勵；不會重複發點。')),20000);})]);
  if(!response||response.success===false||response.error)throw Error(response?.error||'無法取得遊戲資料，請重試');return response.data||response;
 }finally{clearTimeout(timer);}
}
export function gameEvent(eventType,session=null,gameId=''){
 // Best effort telemetry never blocks gameplay; server resolves member and timestamp.
 return gameAPI('gameEvent',{eventType,eventId:crypto.randomUUID(),deviceType:deviceType(),gameId,...(session?{sessionId:session.sessionId,nonce:session.nonce,gameId:session.gameId}:{})}).catch(()=>{});
}
export function pendingGame(value,member=gameUser()){
 const key=`game-center-pending:${member}`;
 try{if(arguments.length===0)return JSON.parse(sessionStorage.getItem(key)||'null');if(value)sessionStorage.setItem(key,JSON.stringify(value));else sessionStorage.removeItem(key);}catch{}return null;
}
export function refreshGamePoints(data){
 if(data.state!=='completed')return;window.pointWalletData=null;
 if(Number.isFinite(data.balance))window.renderPointBalanceState?.('ready',{balance:data.balance});
 void window.loadPointsWallet?.(true);void window.refreshDailyTankStatus?.();
}
