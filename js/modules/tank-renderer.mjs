// Presentation only: never consumes simulation RNG or changes replay state.
const W=720,H=432;
const circle=(c,x,y,r,color)=>{c.fillStyle=color;c.beginPath();c.arc(x,y,r,0,Math.PI*2);c.fill();};
function tank(c,t,ticks,flash){
 c.save();c.translate(t.x+13,t.y+13);c.rotate(t.dir*Math.PI/2);
 c.shadowColor='#000a';c.shadowBlur=5;c.shadowOffsetY=3;
 c.fillStyle='#121c25';c.fillRect(-14,-13,7,26);c.fillRect(7,-13,7,26);c.shadowBlur=0;c.shadowOffsetY=0;
 for(let y=-12;y<13;y+=5){c.fillStyle='#71818a';c.fillRect(-13,y,5,2);c.fillRect(8,y,5,2);}
 const armor=c.createLinearGradient(-10,-10,10,12);
 armor.addColorStop(0,t.enemy?'#ffc080':'#c2fff1');armor.addColorStop(.4,t.enemy?'#b85639':'#27b69b');armor.addColorStop(1,t.enemy?'#512d34':'#125b64');
 c.fillStyle=armor;c.fillRect(-9,-12,18,24);c.strokeStyle=t.enemy?'#f6aa74':'#99f5e6';c.strokeRect(-9,-12,18,24);
 c.fillStyle='#202e3a';for(let y=5;y<11;y+=2)c.fillRect(-6,y,12,1);
 c.fillStyle='#bccbd1';c.fillRect(-2,-20,4,17);c.fillStyle='#364754';c.fillRect(-3,-21,6,4);
 circle(c,0,-1,8,t.enemy?'#e48150':'#6debd0');circle(c,0,-1,5,t.enemy?'#783e37':'#1b7b80');
 c.fillStyle='#d9faff';c.fillRect(-3,-4,4,2);
 for(const x of [-7,5]){c.fillStyle=t.enemy?'#ff764e':'#e7ffc1';c.fillRect(x,-11,2,3);}
 if(flash){c.shadowColor='#ffb82e';c.shadowBlur=12;circle(c,0,-24,4,'#fff3b2');}
 c.restore();
 if(!t.enemy&&t.shield>0){c.strokeStyle='#87fff6';c.lineWidth=1.5;c.beginPath();c.arc(t.x+13,t.y+13,20+Math.sin(ticks*.2),0,Math.PI*2);c.stroke();}
}
export function createTankRenderer(canvas){
 const c=canvas.getContext('2d'),ground=document.createElement('canvas');ground.width=W;ground.height=H;
 const g=ground.getContext('2d');let previous=null,particles=[],flashes=new WeakMap();
 const wash=g.createLinearGradient(0,0,W,H);wash.addColorStop(0,'#334b4c');wash.addColorStop(.5,'#202f36');wash.addColorStop(1,'#394238');g.fillStyle=wash;g.fillRect(0,0,W,H);
 // Fixed visual texture (not gameplay RNG), cached once for mobile performance.
 for(let i=0;i<1800;i++){const x=(i*197)%W,y=(i*97)%H;g.fillStyle=i%2?'#abc4ad0b':'#00000018';g.fillRect(x,y,2+i%4,1+i%3);}
 // Moss, old track imprints and shallow craters are painted onto traversable ground.
 for(let i=0;i<22;i++){
  const x=36+(i*179)%648,y=35+(i*113)%290,r=12+i%19;
  const moss=g.createRadialGradient(x,y,1,x,y,r);moss.addColorStop(0,'#71855a44');moss.addColorStop(1,'#344b4200');g.fillStyle=moss;g.fillRect(x-r,y-r,r*2,r*2);
  for(let j=0;j<8;j++){g.strokeStyle='#88a06b20';g.beginPath();g.moveTo(x+j*2-r/2,y+j%4);g.lineTo(x+j*2-r/2+2,y-4+j%4);g.stroke();}
 }
 for(const [x,y] of [[110,200],[308,100],[595,287]]){
  const pit=g.createRadialGradient(x,y,3,x,y,16);pit.addColorStop(0,'#0a151b80');pit.addColorStop(.7,'#0a151b40');pit.addColorStop(1,'#8b947326');g.fillStyle=pit;g.beginPath();g.ellipse(x,y,17,11,-.3,0,Math.PI*2);g.fill();
 }
 for(const x of [72,346,620]){g.fillStyle='#10242a55';g.fillRect(x-16,0,58,H);g.setLineDash([9,16]);g.strokeStyle='#b7c09a22';g.beginPath();g.moveTo(x+13,0);g.lineTo(x+13,H);g.stroke();}g.setLineDash([]);
 // Low-profile vegetation and gravel stay at the border; they are not obstacles.
 for(let i=0;i<90;i++){const x=i%2?8+(i*73)%30:W-38+(i*31)%30,y=(i*59)%H;circle(g,x,y,3+i%5,i%3?'#42605280':'#73856555');}
 for(const x of [156,228,468,540]){g.fillStyle='#b3af8712';g.fillRect(x-5,135,34,124);g.strokeStyle='#d9d0a321';g.strokeRect(x-5,135,34,124);}
 g.strokeStyle='#5bddbb33';g.lineWidth=2;g.strokeRect(318,354,84,77);
 g.strokeStyle='#bacbaf10';for(let x=0;x<W;x+=48){g.beginPath();g.moveTo(x,0);g.lineTo(x,H);g.stroke();}
 const edge=g.createRadialGradient(W/2,H/2,100,W/2,H/2,440);edge.addColorStop(0,'#0000');edge.addColorStop(1,'#020e18b0');g.fillStyle=edge;g.fillRect(0,0,W,H);
 const burst=(x,y)=>{for(let i=0;i<14;i++)particles.push({x,y,dx:Math.cos(i*2.4)*(1+i%3),dy:Math.sin(i*2.4)*(1+i%3),age:0});particles=particles.slice(-112);};
 return {reset(){previous=null;particles=[];flashes=new WeakMap();},draw(s){
  if(!c)return;
  const dt=previous?Math.max(0,Math.min(3,s.ticks-previous.ticks)):0;
  if(previous&&dt){
   for(const e of previous.enemies)if(!s.enemies.includes(e.ref))burst(e.x+13,e.y+13);
   for(const w of previous.walls)if(!s.walls.includes(w))burst(w.x+12,w.y+12);
   if(s.lives<previous.lives)burst(s.player.x+13,s.player.y+13);
  }
  c.drawImage(ground,0,0);c.font='bold 9px system-ui';c.textAlign='center';
  for(const x of [85,359,633]){c.fillStyle='#d38c6b';c.fillText('▼',x,15);}
  for(const w of s.walls){
   c.fillStyle='#050e1680';c.fillRect(w.x+3,w.y+4,22,21);
   c.fillStyle=w.baseWall?'#cfad6e':'#946751';c.fillRect(w.x+1,w.y+1,22,22);
   c.fillStyle=w.baseWall?'#f5d99c':'#c7956e';c.fillRect(w.x+1,w.y+1,22,3);
   c.strokeStyle='#342921';c.lineWidth=1;c.strokeRect(w.x+.5,w.y+.5,23,23);
   c.beginPath();c.moveTo(w.x+1,w.y+12);c.lineTo(w.x+23,w.y+12);c.moveTo(w.x+9,w.y+1);c.lineTo(w.x+9,w.y+12);c.moveTo(w.x+16,w.y+12);c.lineTo(w.x+16,w.y+23);c.stroke();
   if(w.baseWall&&w.hp===1){c.beginPath();c.moveTo(w.x+5,w.y);c.lineTo(w.x+15,w.y+8);c.lineTo(w.x+8,w.y+18);c.stroke();}
  }
  const b=s.base;c.save();c.shadowColor=b.alive?'#73ffd0':'#ff713e';c.shadowBlur=13;
  circle(c,b.x+12,b.y+12,10,b.alive?'#9fffd4':'#924f37');c.shadowBlur=0;c.fillStyle='#125b56';c.fillRect(b.x+5,b.y+7,14,11);c.fillStyle='#ecffcd';c.fillRect(b.x+10,b.y+9,4,8);c.restore();
  for(const t of [s.player,...s.enemies]){
   const old=flashes.get(t),fired=old&&t.cooldown>old.cooldown,until=fired?s.ticks+3:old?.until||0;
   tank(c,t,s.ticks,s.ticks<until);flashes.set(t,{cooldown:t.cooldown,until});
  }
  for(const b of s.bullets){c.save();c.shadowBlur=9;c.shadowColor=b.enemy?'#ff7236':'#63f5ed';c.strokeStyle=b.enemy?'#ff994a':'#9dfff4';c.lineWidth=3;c.beginPath();c.moveTo(b.x+2-b.dx*9,b.y+2-b.dy*9);c.lineTo(b.x+2,b.y+2);c.stroke();circle(c,b.x+2,b.y+2,2,'#fffbdc');c.restore();}
  for(const p of particles){p.age+=dt;p.x+=p.dx*dt;p.y+=p.dy*dt;c.globalAlpha=Math.max(0,1-p.age/20);circle(c,p.x,p.y,Math.max(1,4-p.age*.14),p.age<7?'#fff0ab':'#ff8a45');}c.globalAlpha=1;particles=particles.filter(p=>p.age<20);
  previous={ticks:s.ticks,enemies:s.enemies.map(e=>({ref:e,x:e.x,y:e.y})),walls:[...s.walls],lives:s.lives};
 }};
}
