import {COLS,ROWS,SHAPES,WARNING_ROWS,fits} from './block-supply-engine.mjs';
// Pure presentation: no mutation, random numbers or asset dependencies.
export function createBlockRenderer(canvas,preview){
 const ctx=canvas.getContext('2d'),next=preview.getContext('2d'),cell=30;
 canvas.width=COLS*cell;canvas.height=ROWS*cell;preview.width=120;preview.height=120;
 function crate(c,x,y,size,shape,special=false,ghost=false){
  const def=SHAPES[shape];c.save();c.globalAlpha=ghost?.22:1;
  c.fillStyle=def.color;c.fillRect(x+2,y+2,size-4,size-4);
  c.strokeStyle='#ffffff88';c.lineWidth=1;c.strokeRect(x+4.5,y+4.5,size-9,size-9);
  c.fillStyle='#092b30';c.font=`bold ${size*.55}px system-ui`;c.textAlign='center';c.textBaseline='middle';
  c.fillText(special?'⚡':def.symbol,x+size/2,y+size/2+1);
  // Corner rivets distinguish crates even when symbols render with a fallback font.
  c.fillRect(x+4,y+4,2,2);c.fillRect(x+size-6,y+size-6,2,2);c.restore();
 }
 return {draw(s){
  ctx.fillStyle='#071b22';ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.fillStyle='#bc746c14';ctx.fillRect(0,0,canvas.width,WARNING_ROWS*cell);
  ctx.strokeStyle='#8bcbc012';ctx.lineWidth=1;
  for(let x=0;x<=COLS;x++){ctx.beginPath();ctx.moveTo(x*cell,0);ctx.lineTo(x*cell,canvas.height);ctx.stroke();}
  for(let y=0;y<=ROWS;y++){ctx.beginPath();ctx.moveTo(0,y*cell);ctx.lineTo(canvas.width,y*cell);ctx.stroke();}
  ctx.save();ctx.strokeStyle='#ffb09c';ctx.setLineDash([5,5]);ctx.beginPath();ctx.moveTo(0,WARNING_ROWS*cell);ctx.lineTo(canvas.width,WARNING_ROWS*cell);ctx.stroke();ctx.restore();
  s.board.forEach((row,y)=>row.forEach((v,x)=>{if(v)crate(ctx,x*cell,y*cell,cell,v.shape,v.special);}));
  if(s.active){
   const ghost={...s.active};while(fits(s,ghost,0,1))ghost.y++;
   for(const c of ghost.cells)crate(ctx,(ghost.x+c.x)*cell,(ghost.y+c.y)*cell,cell,ghost.shape,c.special,true);
   for(const c of s.active.cells)crate(ctx,(s.active.x+c.x)*cell,(s.active.y+c.y)*cell,cell,s.active.shape,c.special);
  }
  next.clearRect(0,0,120,120);
  if(s.next){const p=s.next,w=Math.max(...p.cells.map(c=>c.x))+1,h=Math.max(...p.cells.map(c=>c.y))+1,unit=24;
   for(const c of p.cells)crate(next,(120-w*unit)/2+c.x*unit,(120-h*unit)/2+c.y*unit,unit,p.shape,c.special);
  }
 }};
}
