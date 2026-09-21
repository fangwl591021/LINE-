// Original geometry-only game. Shared deterministic simulation for Canvas and reward verification.
export const WIDTH = 720, HEIGHT = 432, FPS = 30, MAX_TICKS = 10800;
export const INPUT = {up:1, right:2, down:4, left:8, fire:16};
const DIR = [[0,-1],[1,0],[0,1],[-1,0]];
const overlap = (a,b) => a.x < b.x+b.w && a.x+a.w > b.x && a.y < b.y+b.h && a.y+a.h > b.y;
function random(s) { s.seed = (Math.imul(s.seed,1664525)+1013904223)>>>0; return s.seed/4294967296; }
const tank = (x,y,enemy=false) => ({x,y,w:26,h:26,dir:enemy?2:0,enemy,cooldown:enemy?70:0,turn:90,shield:enemy?0:60});
export function createGame(seed,mapVersion=1) {
  const walls=[];
  // A closed eight-brick ring, including the entire bottom edge.
  for(let y=360;y<=408;y+=24) for(let x=324;x<=372;x+=24)
    if(x!==348 || y!==384) walls.push({x,y,w:24,h:24,hp:2,baseWall:true});
  if(mapVersion===2){
    // 48px corridors fit 26px tanks. All cover is destructible; spawn/base exits stay open.
    for(const x of [132,204,276,420,492,564])for(const y of [96,120,144,168,240,264,288])walls.push({x,y,w:24,h:24,hp:1});
    for(const x of [36,60,84,612,636,660])for(const y of [192,216,312,336])walls.push({x,y,w:24,h:24,hp:1});
    for(const x of [324,348,372])for(const y of [216,240])walls.push({x,y,w:24,h:24,hp:1});
  }else for(const x of [156,228,468,540]) for(const y of [144,168,240]) walls.push({x,y,w:24,h:24,hp:1});
  return {seed:seed>>>0,ticks:0,player:tank(276,384),base:{x:348,y:384,w:24,h:24,alive:true},
    walls,enemies:[],bullets:[],kills:0,spawned:0,spawnAt:1,lives:3,state:'playing',events:[]};
}
function blocked(s,t,x,y) {
  const next={...t,x,y};
  return x<0 || y<0 || x+t.w>WIDTH || y+t.h>HEIGHT || overlap(next,s.base) ||
    s.walls.some(w=>overlap(next,w)) || [s.player,...s.enemies].some(o=>o!==t && overlap(next,o));
}
function move(s,t,speed) {
  const [dx,dy]=DIR[t.dir],x=t.x+dx*speed,y=t.y+dy*speed;
  if(blocked(s,t,x,y)) return false;
  t.x=x;t.y=y;return true;
}
function shoot(s,t) {
  if(t.cooldown>0)return;
  const [dx,dy]=DIR[t.dir];
  s.bullets.push({x:t.x+11+dx*17,y:t.y+11+dy*17,w:4,h:4,dx,dy,enemy:t.enemy});
  t.cooldown=t.enemy?85+Math.floor(random(s)*55):12;
  s.events.push(t.enemy?'enemyFire':'fire');
}
export function stepGame(s,mask=0) {
  if(s.state!=='playing')return s;
  s.events=[];s.ticks++;
  const p=s.player;p.cooldown--;p.shield--;
  const d=[1,2,4,8].findIndex(n=>mask&n);
  if(d>=0){p.dir=d;move(s,p,2.6);}
  if(mask&INPUT.fire)shoot(s,p);
  if(s.spawned<5 && s.enemies.length<3 && s.ticks>=s.spawnAt) {
    const positions=[72,346,620],start=Math.floor(random(s)*3);
    for(let n=0;n<3;n++) {
      const e=tank(positions[(start+n)%3],24,true);
      if(!blocked(s,e,e.x,e.y)){s.enemies.push(e);s.spawned++;break;}
    }
    s.spawnAt=s.ticks+75;
  }
  for(const e of s.enemies) {
    e.cooldown--;e.turn--;
    const moved=move(s,e,0.85);
    // Hold headings >= 1.5s; blocked tanks wait rather than jitter every frame.
    if(e.turn<=0) {
      const options=moved?[2,2,2,1,3]:[2,1,3,0];
      const start=Math.floor(random(s)*options.length);
      for(let n=0;n<options.length;n++) {
        const dir=options[(start+n)%options.length], [dx,dy]=DIR[dir];
        if(!blocked(s,e,e.x+dx*2,e.y+dy*2)){e.dir=dir;break;}
      }
      e.turn=45+Math.floor(random(s)*55);
    }
    shoot(s,e);
  }
  const remaining=[];
  for(const b of s.bullets) {
    b.x+=b.dx*(b.enemy?3.2:6);b.y+=b.dy*(b.enemy?3.2:6);
    if(b.x<0||b.y<0||b.x>WIDTH||b.y>HEIGHT)continue;
    const wall=s.walls.find(w=>overlap(b,w));
    if(wall){wall.hp--;if(wall.hp<=0)s.walls=s.walls.filter(w=>w!==wall);s.events.push('hit');continue;}
    if(b.enemy && overlap(b,s.base)){s.base.alive=false;s.state='lost';s.events.push('lose');break;}
    if(b.enemy && overlap(b,p)) {
      if(p.shield<=0){s.lives--;s.events.push('hit');p.shield=75;
        if(s.lives<=0){s.state='lost';s.events.push('lose');break;}
      }
      continue;
    }
    const enemy=!b.enemy && s.enemies.find(e=>overlap(b,e));
    if(enemy){s.enemies=s.enemies.filter(e=>e!==enemy);s.kills++;s.events.push('hit');
      if(s.kills===5){s.state='won';s.events.push('win');break;}continue;
    }
    remaining.push(b);
  }
  s.bullets=remaining;
  if(s.state==='playing' && s.ticks>=MAX_TICKS){s.state='lost';s.events.push('lose');}
  return s;
}
export function recordInput(replay,mask) {
  const last=replay[replay.length-1];
  if(last && last[1]===mask)last[0]++;else replay.push([1,mask]);
}
export function verifyReplay(seed,replay,elapsedMs,mapVersion=1) {
  return verifyTankResult(seed,replay,elapsedMs,mapVersion)?.state==='won';
}
export function verifyTankResult(seed,replay,elapsedMs,mapVersion=1) {
  if(!Number.isInteger(seed)||seed<0||seed>0xffffffff||!Number.isFinite(elapsedMs)||elapsedMs<0)return false;
  if(!Array.isArray(replay)||!replay.length||replay.length>MAX_TICKS)return false;
  let total=0;
  for(const pair of replay) {
    if(!Array.isArray(pair)||pair.length!==2||!Number.isInteger(pair[0])||pair[0]<1||
      !Number.isInteger(pair[1])||pair[1]<0||pair[1]>31)return false;
    total+=pair[0];if(total>MAX_TICKS)return false;
  }
  if(total/FPS*1000>elapsedMs+1500)return false;
  const s=createGame(seed,mapVersion);
  for(const [count,mask] of replay)for(let i=0;i<count;i++){
    if(s.state!=='playing')return false;
    stepGame(s,mask);
  }
  if(s.state!=='won'&&s.state!=='lost')return false;
  return {gameId:'tank_defense',state:s.state,score:s.kills*100,energy:0,clearedLines:0,kills:s.kills,lives:s.lives,durationMs:s.ticks/FPS*1000};
}
