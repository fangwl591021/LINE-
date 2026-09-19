// Stable per-visit shuffle: keyset pagination, bounded reads, no SQL random()/OFFSET.
const modulus=2147483647;
export class CatalogOrderError extends Error {constructor(){super('商城排序或分頁資料不正確，請重新開啟店家列表');this.status=400;}}
export function catalogOrder(seed='',after='') {
  const invalid=()=>{throw new CatalogOrderError();};
  if(!seed){
    if(after.length>80||after.startsWith('r1.'))invalid();
    return {select:()=>'',where:id=>`${id}>?`,args:[after],by:id=>id,compare:(a,b)=>a.id<b.id?-1:a.id>b.id?1:0,cursor:row=>row.id};
  }
  if(!/^[0-9a-f]{16}$/.test(seed))invalid();
  let state=2166136261;
  for(const char of seed)state=Math.imul(state^char.charCodeAt(0),16777619)>>>0;
  const weights=Array.from({length:36},()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return (state>>>0)||1;});
  const rank=id=>weights.reduce((sum,w,i)=>sum+(id.toLowerCase().charCodeAt(i)||0)*w,0)%modulus;
  // Only fixed caller-owned column names and generated integers enter SQL.
  const expression=id=>{if(!['s.id','id'].includes(id))throw Error('Invalid catalog column');return '('+weights.map((w,i)=>`COALESCE(unicode(substr(lower(${id}),${i+1},1)),0)*${w}`).join('+')+`)%${modulus}`;};
  let lastRank=-1,lastId='';
  if(after){
    const parts=after.match(/^r1\.([0-9a-f]{16})\.([0-9a-z]{1,7})\.([A-Za-z0-9-]{1,80})$/);
    if(!parts||parts[1]!==seed)invalid();
    lastRank=parseInt(parts[2],36);lastId=parts[3];
    if(lastRank!==rank(lastId))invalid();
  }
  return {
    select:id=>`,${expression(id)} AS catalog_rank`,
    where:id=>`(${expression(id)}>? OR (${expression(id)}=? AND ${id}>?))`,
    args:[lastRank,lastRank,lastId],by:id=>`catalog_rank,${id}`,
    compare:(a,b)=>a.catalog_rank-b.catalog_rank||(a.id<b.id?-1:a.id>b.id?1:0),
    cursor:row=>`r1.${seed}.${rank(row.id).toString(36)}.${row.id}`
  };
}
