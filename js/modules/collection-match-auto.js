// Protected: never force-recompute completed percentages or block list rendering.
(() => {
  let running=false,lastOwner='',lastAttempt=0;
  const user=()=>String(window.currentUserProfile?.userId||'');
  window.ensureCollectedMatchScores=async function(){
    const owner=user(),cards=window.harvestCards;
    if(running||!owner||typeof window.fetchAPI!=='function'||!Array.isArray(cards)||!cards.some(c=>c.aiMatch?.autoEligible===true&&c.aiMatch.score===null))return;
    if(owner===lastOwner&&Date.now()-lastAttempt<300000)return;
    running=true;lastOwner=owner;lastAttempt=Date.now();
    try{
      for(let batch=0;batch<40;batch++){
        if(user()!==owner||document.hidden)break;
        const response=await window.fetchAPI('refreshCardHarvestMatches',{},true);
        if(user()!==owner)break;
        // core.fetchAPI unwraps successful data; also accept explicit envelopes.
        const result=response?.data||response;
        if(response?.success===false||!Array.isArray(result?.cards))break;
        const updates=new Map(result.cards.map(c=>[String(c.rowId),c.aiMatch]));
        const merge=list=>Array.isArray(list)?list.map(c=>updates.has(String(c.rowId))?{...c,aiMatch:updates.get(String(c.rowId))}:c):list;
        window.harvestCards=merge(window.harvestCards);window.allCards=merge(window.allCards);window.cardListRenderSource=merge(window.cardListRenderSource);
        const list=document.getElementById('card-list');
        if(list&&list.getClientRects().length)window.renderCardList?.(window.cardListRenderSource||window.harvestCards,{keepPage:true});
        if(result.message)window.showToast?.(result.message);
        if(!result.processed||!window.harvestCards.some(c=>c.aiMatch?.autoEligible===true&&c.aiMatch.score===null))break;
      }
    }catch{/* Existing cards and scores remain visible; next visit can retry. */}
    finally{running=false;}
  };
})();
