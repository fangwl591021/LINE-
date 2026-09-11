async()=>{
if(location.origin!=='http://127.0.0.1:8794')throw Error('Local only');
const wait=async(fn)=>{for(let i=0;i<100;i++){if(fn())return;await new Promise(r=>setTimeout(r,30));}throw Error('Timed out');};
const check=(ok,msg)=>{if(!ok)throw Error(msg);};
await wait(()=>document.querySelector('.shop-category-tags button'));
const bar=document.querySelector('.shop-category-tags'),buttons=[...bar.querySelectorAll('button')],rects=buttons.map(b=>b.getBoundingClientRect());
const rows=[...new Set(rects.map(r=>Math.round(r.top)))];
check(buttons.length===8&&rows.length===2,'Expected 8 buttons in 2 rows');
check(rows.every(y=>rects.filter(r=>Math.round(r.top)===y).length===4),'Expected 4 per row');
check(rects.every(r=>r.height>=44&&r.height<=60),'Wrong compact height');
check(bar.scrollWidth<=bar.clientWidth&&document.documentElement.scrollWidth<=innerWidth,'Horizontal overflow');
buttons[1].click();await wait(()=>document.querySelector('[data-category="食"][aria-pressed="true"]'));
document.querySelector('[data-category=""]').click();await wait(()=>document.querySelector('[data-category=""][aria-pressed="true"]'));
return {width:innerWidth,rows:2,columns:4,height:rects[0].height,noHorizontalScroll:true,filter:true};
}
