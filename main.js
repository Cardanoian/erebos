'use strict';
/* EREBOS — 잊힌 성소 : 1스테이지 메트로베니아 (바닐라 Canvas)
 * 조작: 이동 ←→/AD, 점프 Z/K/Space, 대시 X/L/Shift, 공격 J, 조사 E/↑, Esc 일시정지, M 음소거
 * itch.io 에셋 교체 지점: drawTile/drawPlayer/drawEnemy/drawBoss + AudioSys (주석 참고)
 */
(function(){
var VW=480, VH=270, TILE=16;
var canvas=document.getElementById('game');
var ctx=canvas.getContext('2d');
ctx.imageSmoothingEnabled=false;
var overlay=document.getElementById('overlay');
var fpsEl=document.getElementById('fps');
var DEBUG=(location.search.indexOf('debug=1')>=0);

// ---------- assets (itch.io; 실패 시 절차적 폴백) ----------
var IMG={}; // name -> Image (ok 플래그)
var assetsTotal=0, assetsDone=0, assetsLoaded=false;
function loadImg(name,src){
  assetsTotal++;
  if(typeof Image==='undefined'){ assetsDone++; if(assetsDone>=assetsTotal)assetsLoaded=true; return; }
  var im=new Image();
  im.ok=false;
  im.onload=function(){ im.ok=true; assetsDone++; if(assetsDone>=assetsTotal)assetsLoaded=true; };
  im.onerror=function(){ assetsDone++; if(assetsDone>=assetsTotal)assetsLoaded=true; };
  im.src=src; IMG[name]=im;
}
[['k1_idle','assets/sprites/knight1/idle.png'],
 ['k1_run','assets/sprites/knight1/run.png'],
 ['k1_attack','assets/sprites/knight1/attack.png'],
 ['k1_attack2','assets/sprites/knight1/attack2.png'],
 ['k1_jump','assets/sprites/knight1/jump.png'],
 ['k1_fall','assets/sprites/knight1/fall.png'],
 ['k1_hit','assets/sprites/knight1/hit.png'],
 ['k1_death','assets/sprites/knight1/death.png'],
 ['k1_dash','assets/sprites/knight1/dash.png'],
 ['k1_wall','assets/sprites/knight1/wallslide.png'],
 ['k2_idle','assets/sprites/knight2/idle.png'],
 ['k2_run','assets/sprites/knight2/run.png'],
 ['k2_attack','assets/sprites/knight2/attack.png'],
 ['k2_attack2','assets/sprites/knight2/attack2.png'],
 ['k2_jump','assets/sprites/knight2/jump.png'],
 ['k2_dash','assets/sprites/knight2/dash.png'],
 ['k2_death','assets/sprites/knight2/death.png'],
 ['angel_idle','assets/sprites/foes/angel_idle.png'],
 ['angel_attack','assets/sprites/foes/angel_attack.png'],
 ['ghoul_run','assets/sprites/foes/ghoul_run.png'],
 ['wiz_idle','assets/sprites/foes/wizard_idle.png'],
 ['wiz_fire','assets/sprites/foes/wizard_fire.png'],
 ['fireball','assets/sprites/foes/fireball.png'],
 ['enemydeath','assets/sprites/foes/enemydeath.png'],
 ['torch','assets/sprites/torch.png'],
 ['titlebg','assets/tiles/title-screen.png'],
 ['column','assets/tiles/column.png'],
 ['bg_far','assets/bg/far.png'],
 ['bg_back','assets/bg/back.png'],
 ['bg_mid','assets/bg/middle.png'],
 ['bg_near','assets/bg/near.png']
].forEach(function(p){ loadImg(p[0],p[1]); });
setTimeout(function(){ assetsLoaded=true; },8000); // 안전 타임아웃
function img(n){ var im=IMG[n]; return (im&&im.ok)?im:null; }
// 시트(가로 스트립) 그리기. ax=발밑 기준 셀 내 x앵커. flip=좌우반전. 성공 시 true
function drawSheet(im,fw,fh,frame,cx,feetY,scale,flip,ax){
  if(!im) return false;
  var n=Math.max(1,Math.round(im.width/fw));
  var f=((frame|0)%n+n)%n;
  var dw=fw*scale, dh=fh*scale;
  var dx=cx-ax*scale, dy=feetY-dh;
  ctx.save();
  if(flip){ ctx.translate(Math.round(cx*2),0); ctx.scale(-1,1); }
  ctx.drawImage(im,f*fw,0,fw,fh,Math.round(dx),Math.round(dy),dw,dh);
  ctx.restore();
  return true;
}
// 스프라이트 이펙트 애니메이션 (적 처치 등)
var anims=[];
function spawnAnim(name,fw,fh,n,x,y,scale,dur){
  var im=img(name); if(!im) return;
  anims.push({im:im,fw:fw,fh:fh,n:n,x:x,y:y,scale:scale||1,t:0,dur:dur||0.5});
}
function updateAnims(dt){ for(var i=anims.length-1;i>=0;i--){ anims[i].t+=dt; if(anims[i].t>=anims[i].dur) anims.splice(i,1); } }
function drawAnims(){
  anims.forEach(function(a){
    var f=Math.floor(a.t/a.dur*a.n);
    drawSheet(a.im,a.fw,a.fh,Math.min(f,a.n-1),a.x-G.cam.x,a.y-G.cam.y,a.scale,false,a.fw/2);
  });
}

// ---------- utils ----------
function clamp(v,a,b){return v<a?a:(v>b?b:v);}
function lerp(a,b,t){return a+(b-a)*t;}
function overlap(a,b){return a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;}
function dist2(ax,ay,bx,by){var dx=ax-bx,dy=ay-by;return dx*dx+dy*dy;}
function hash(x,y){var h=x*374761393+y*668265263;h=(h^(h>>13))*1274126177;return ((h^(h>>16))>>>0)/4294967295;}

// ---------- input ----------
var keys={}, pressed={};
addEventListener('keydown',function(e){
  var k=e.key.toLowerCase();
  if([' ','arrowup','arrowdown','arrowleft','arrowright'].indexOf(k)>=0||e.key===' ') e.preventDefault();
  if(!keys[k]) pressed[k]=true;
  keys[k]=true;
  AudioSys.unlock();
});
addEventListener('keyup',function(e){ keys[e.key.toLowerCase()]=false; });
function down(){ return keys['arrowleft']||keys['a']||keys['q']; }
function up(){ return false; }
function right(){ return keys['arrowright']||keys['d']; }
function left(){ return keys['arrowleft']||keys['a']; }
function jumpHeld(){ return keys['z']||keys['k']||keys[' ']; }
function jumpPressed(){ return pressed['z']||pressed['k']||pressed[' ']; }
function dashPressed(){ return pressed['x']||pressed['l']||pressed['shift']; }
function atkPressed(){ return pressed['j']||pressed['f']; }
function interactPressed(){ return pressed['e']||pressed['arrowup']||pressed['w']; }
function confirmPressed(){ return pressed['enter']||pressed[' ']||pressed['z']; }
function clearPressed(){ pressed={}; }

// ---------- audio (itch.io 파일 + 신스 폴백) ----------
var BGM_SRC={title:'assets/bgm/title.mp3',stage:'assets/bgm/stage.mp3',boss:'assets/bgm/boss.mp3'};
var SFX_SRC={dash:'assets/sfx/dash.wav',atk1:'assets/sfx/atk1.wav',atk2:'assets/sfx/atk2.wav',
  shoot:'assets/sfx/shoot.wav',hit:'assets/sfx/hit.wav',enemyDie:'assets/sfx/enemydie.wav',
  roar:'assets/sfx/roar.wav',door:'assets/sfx/door.wav',altar:'assets/sfx/clear.wav',
  clear:'assets/sfx/clear.wav',lever:'assets/sfx/ui.wav',chest:'assets/sfx/chest.wav'};
// 파일이 없고 신스로 대체되는 효과음: jump, wall, hurt, bell, break
var AudioSys={
  ctx:null, muted:false, bgmMode:'none', bgmEl:null, sfxPool:{},
  unlock:function(){
    if(!this.ctx){ try{ this.ctx=new (window.AudioContext||window.webkitAudioContext)(); }catch(e){} }
    if(this.ctx&&this.ctx.state==='suspended') this.ctx.resume();
    if(this.bgmEl&&this.bgmEl.paused&&this.bgmMode!=='none'){ var p=this.bgmEl.play(); if(p&&p.catch)p.catch(function(){}); }
  },
  toggleMute:function(){ this.muted=!this.muted; if(this.bgmEl)this.bgmEl.muted=this.muted; },
  tone:function(freq,dur,type,vol,slide){
    if(!this.ctx||this.muted) return;
    var t=this.ctx.currentTime, o=this.ctx.createOscillator(), g=this.ctx.createGain();
    o.type=type||'square'; o.frequency.setValueAtTime(freq,t);
    if(slide) o.frequency.exponentialRampToValueAtTime(Math.max(20,freq+slide),t+dur);
    g.gain.setValueAtTime(vol||0.08,t); g.gain.exponentialRampToValueAtTime(0.0001,t+dur);
    o.connect(g); g.connect(this.ctx.destination); o.start(t); o.stop(t+dur+0.02);
  },
  noise:function(dur,vol){
    if(!this.ctx||this.muted) return;
    var t=this.ctx.currentTime, len=Math.floor(this.ctx.sampleRate*dur);
    var buf=this.ctx.createBuffer(1,len,this.ctx.sampleRate), d=buf.getChannelData(0);
    for(var i=0;i<len;i++) d[i]=(Math.random()*2-1)*(1-i/len);
    var s=this.ctx.createBufferSource(); s.buffer=buf;
    var g=this.ctx.createGain(); g.gain.value=vol||0.1;
    s.connect(g); g.connect(this.ctx.destination); s.start(t);
  },
  synth:function(name){
    switch(name){
      case 'jump': this.tone(300,0.12,'square',0.06,220); break;
      case 'wall': this.noise(0.06,0.05); break;
      case 'hurt': this.tone(110,0.25,'sawtooth',0.12,-40); break;
      case 'bell': this.tone(660,0.8,'sine',0.1); this.tone(990,0.6,'sine',0.06); break;
      case 'break': this.noise(0.3,0.14); this.tone(150,0.2,'square',0.08,-80); break;
      default: this.tone(440,0.08,'square',0.05); break;
    }
  },
  playFile:function(src,vol){
    if(this.muted) return;
    try{
      var pool=this.sfxPool[src]||(this.sfxPool[src]=[]);
      var a=null;
      for(var i=0;i<pool.length;i++) if(pool[i].paused){ a=pool[i]; break; }
      if(!a){ if(pool.length>=4) return; a=new Audio(src); a.preload='auto'; pool.push(a); }
      a.volume=(vol==null?0.5:vol); a.currentTime=0;
      var p=a.play(); if(p&&p.catch)p.catch(function(){});
    }catch(e){}
  },
  sfx:function(name){
    if(this.muted) return;
    if(SFX_SRC[name]){ this.playFile(SFX_SRC[name], name==='roar'||name==='door'?0.6:0.5); return; }
    this.synth(name);
  },
  setBGM:function(m){
    if(this.bgmMode===m) return;
    this.bgmMode=m;
    if(m==='none'){ if(this.bgmEl)this.bgmEl.pause(); return; }
    try{
      if(!this.bgmEl){ this.bgmEl=new Audio(); this.bgmEl.loop=true; this.bgmEl.preload='auto'; }
      if(this.bgmEl.getAttribute('src')!==BGM_SRC[m]) this.bgmEl.src=BGM_SRC[m];
      this.bgmEl.volume=0.4; this.bgmEl.muted=this.muted;
      var p=this.bgmEl.play(); if(p&&p.catch)p.catch(function(){});
    }catch(e){}
  },
  update:function(dt){ /* <audio> 루프 사용, 신스 시퀀서 불필요 */ }
};

// ---------- level ----------
// tile: 0 empty, 1 solid, 2 oneway, 3 spikes, 4 breakable
var LV={w:172,h:36,tiles:[],props:[],signs:[],bells:[],foes:[]};
var dashAltar, gloveAltar, lever, door, bossTrigger;
function tileAt(tx,ty){
  if(tx<0||ty<0||tx>=LV.w||ty>=LV.h) return 1;
  return LV.tiles[ty*LV.w+tx];
}
function setTile(tx,ty,v){ if(tx>=0&&ty>=0&&tx<LV.w&&ty<LV.h) LV.tiles[ty*LV.w+tx]=v; }
function fillRect(x0,y0,x1,y1,v){ for(var y=y0;y<=y1;y++) for(var x=x0;x<=x1;x++) setTile(x,y,v); }
function buildLevel(){
  LV.tiles=new Array(LV.w*LV.h).fill(0);
  LV.props=[]; LV.signs=[]; LV.bells=[]; LV.foes=[];
  var GY=28; // ground row
  // 외곽 + 바닥 기본
  fillRect(0,0,1,LV.h-1,1);
  fillRect(LV.w-3,0,LV.w-1,LV.h-1,1);
  fillRect(0,LV.h-2,LV.w-1,LV.h-1,1);
  fillRect(0,GY,40,GY,1); fillRect(0,GY+1,40,LV.h-3,1);
  // A: 입구 회랑 바닥/천장
  fillRect(0,18,40,18,1);
  fillRect(0,19,0,27,1); fillRect(40,19,40,27,0);
  fillRect(10,24,15,24,2); fillRect(24,22,29,22,2);
  // A->B 연결 (바닥 유지)
  fillRect(40,GY,80,GY,1); fillRect(40,GY+1,80,LV.h-3,1);
  fillRect(40,18,80,18,1);
  // B: 붕괴벽 (대시로 파괴) x=58, y=24..27
  fillRect(58,24,58,27,4);
  // B: 점프+대시로 넘는 가시 구덩이 x=63..67 (바닥을 뚫고 가시)
  fillRect(63,GY,67,GY,0);
  for(var x=63;x<=67;x++) setTile(x,GY+1,3);
  fillRect(63,GY+2,67,LV.h-3,1);
  // B->C 연결
  fillRect(80,GY,122,GY,1); fillRect(80,GY+1,122,LV.h-3,1);
  fillRect(80,18,122,18,1);
  // C: 벽점프 수직 갱도 — 좌벽 x=95(상부만), 우벽 x=100, y=14..27
  // 하부(x=95, y=23..27)를 비워 왼쪽에서 걸어 들어오게 하고, 위로 벽점프 탈출
  fillRect(95,14,95,22,1);
  fillRect(95,23,95,27,0);
  fillRect(100,14,100,27,1);
  fillRect(95,14,100,14,0); // 위로 뚫림(탈출구)
  // 갱도 바닥은 막힘 → 아래서 진입 불가, 왼쪽 계단으로 진입 후 위로 오르게:
  // 진입용 일방통행 계단
  fillRect(86,25,88,25,2); fillRect(89,23,91,23,2); fillRect(92,21,94,21,2);
  // 갱도 위 탈출 발판 (오른쪽으로)
  fillRect(101,16,104,16,2); fillRect(105,14,108,14,2);
  // C->D: 레버문 (문 x=124, y=24..27 solid, 레버 x=116)
  fillRect(122,GY,172-3,GY,1); fillRect(122,GY+1,172-3,LV.h-3,1);
  fillRect(122,18,172-3,18,1);
  door={x:124*TILE,y:24*TILE,w:TILE,h:4*TILE,open:false};
  lever={x:116*TILE+2,y:GY*TILE-14,w:12,h:14,used:false};
  // D 보스 아레나 평탄화 (가시/장애물 없음)
  // 오브젝트
  dashAltar={x:44*TILE,y:GY*TILE-20,w:20,h:20,taken:false,type:'dash',label:'망자의 돌진'};
  gloveAltar={x:82*TILE,y:GY*TILE-20,w:20,h:20,taken:false,type:'wall',label:'가고일 손톱'};
  LV.bells=[
    {x:8*TILE,y:GY*TILE-20,w:16,h:20,lit:false},
    {x:50*TILE,y:GY*TILE-20,w:16,h:20,lit:false},
    {x:126*TILE,y:GY*TILE-20,w:16,h:20,lit:false}
  ];
  LV.signs=[
    {x:5*TILE,y:GY*TILE-26,w:14,h:22,text:'[벽화] 순례자들이 종을 향해 걸어간다.'},
    {x:12*TILE,y:GY*TILE-26,w:14,h:22,text:'조작: ←→ 이동, Z 점프, J 공격, E 조사'},
    {x:36*TILE,y:GY*TILE-26,w:14,h:22,text:'앞은 무너진 갱도. 무언가 제단이 보인다…'},
    {x:60*TILE,y:GY*TILE-40,w:14,h:22,text:'[균열벽] X 대시로 부술 수 있을 것 같다.'},
    {x:78*TILE,y:GY*TILE-26,w:14,h:22,text:'침수 회랑. 벽을 오르는 힘이 필요하다.'},
    {x:114*TILE,y:GY*TILE-26,w:14,h:22,text:'[레버] 종탑으로 가는 문이 잠겨 있다.'}
  ];
  // 적 스폰
  LV.foes=[
    {t:'skel',x:22*TILE,y:GY*TILE-24},
    {t:'skel',x:32*TILE,y:GY*TILE-24},
    {t:'bat',x:48*TILE,y:20*TILE},
    {t:'bat',x:66*TILE,y:18*TILE},
    {t:'skel',x:72*TILE,y:GY*TILE-24},
    {t:'bat',x:90*TILE,y:18*TILE},
    {t:'statue',x:106*TILE,y:GY*TILE-28},
    {t:'statue',x:112*TILE,y:GY*TILE-28},
    {t:'skel',x:118*TILE,y:GY*TILE-24}
  ];
  bossTrigger={x:132*TILE,w:8*TILE};
  // 횃불/장식 props
  for(var i=0;i<24;i++){
    var px=(4+i*7)*TILE;
    if(px<LV.w*TILE-64) LV.props.push({x:px,y:(GY-1)*TILE-8,kind:(i%3===0?'torch':(i%3===1?'chain':'moss'))});
  }
}

// ---------- game state ----------
var G={
  scene:'title', // title,intro,play,dead,ending
  paused:false, time:0, playTime:0, deaths:0,
  cam:{x:0,y:0},
  shake:0, hitstop:0, fade:1, fadeDir:-1,
  dialog:null, dialogQueue:[], toast:'', toastT:0,
  zone:'', best:null, started:false
};
try{ G.best=JSON.parse(localStorage.getItem('erebos.v1')||'null'); }catch(e){}

// ---------- entities ----------
var player, foes=[], shots=[], parts=[], floats=[];
function resetPlayer(x,y){
  player={x:x,y:y,w:12,h:22,vx:0,vy:0,face:1,onGround:false,
    coyote:0,jbuf:0,dashCD:0,dashT:0,dashDir:1,airDash:true,
    hasDash:false,hasWall:false,wallDir:0,wallT:0,
    hp:5,maxhp:5,inv:0,atkT:0,atkCombo:0,atkCD:0,state:'idle',anim:0,
    respawnX:x,respawnY:y,deadT:0};
}
function spawnFoes(){
  foes=[]; shots=[];
  LV.foes.forEach(function(s){
    if(s.t==='skel') foes.push({t:'skel',x:s.x,y:s.y,w:14,h:20,vx:0,vy:0,hp:3,dir:-1,face:-1,atkT:0,cool:0,dead:false,anim:Math.random()*9});
    if(s.t==='bat') foes.push({t:'bat',x:s.x,y:s.y,w:14,h:12,vx:0,vy:0,hp:2,cool:1+Math.random(),dash:0,dx:0,dy:0,dead:false,anim:Math.random()*9,baseY:s.y});
    if(s.t==='statue') foes.push({t:'statue',x:s.x,y:s.y,w:14,h:28,vx:0,vy:0,hp:4,cool:1.5,face:-1,dead:false,anim:0});
  });
}
var boss=null;
function spawnBoss(){
  boss={x:146*TILE,y:28*TILE-40,w:36,h:40,vx:0,vy:0,hp:24,maxhp:24,
    state:'intro',t:2.0,face:-1,cool:1.2,phase:1,dead:false,flash:0,atkBox:null};
  AudioSys.sfx('roar'); AudioSys.setBGM('boss');
  G.dialog='타락한 종지기 — 침입자, 종은 울리지 않는다.';
}

// ---------- physics ----------
function solidAtPixel(px,py){
  if(door&&!door.open&&px>=door.x&&px<door.x+door.w&&py>=door.y&&py<door.y+door.h) return true;
  var t=tileAt(Math.floor(px/TILE),Math.floor(py/TILE));
  return t===1||t===4;
}
function moveEntity(e,isPlayer){
  // X
  e.x+=e.vx/60;
  var box={x:e.x,y:e.y,w:e.w,h:e.h};
  if(isPlayer&&e.dashT>0){ /* dash: still collide */ }
  // collide X
  var x0=Math.floor(e.x/TILE),x1=Math.floor((e.x+e.w)/TILE);
  var y0=Math.floor(e.y/TILE),y1=Math.floor((e.y+e.h-1)/TILE);
  for(var ty=y0;ty<=y1;ty++)for(var tx=x0;tx<=x1;tx++){
    var solid=(tileAt(tx,ty)===1||tileAt(tx,ty)===4);
    if(!solid&&door&&!door.open){
      if(tx*TILE<door.x+door.w&&(tx+1)*TILE>door.x&&ty*TILE<door.y+door.h&&(ty+1)*TILE>door.y) solid=true;
    }
    if(!solid) continue;
    if(e.vx>0){ e.x=tx*TILE-e.w-0.01; e.vx=0; if(e===boss) e.face=-1; }
    else if(e.vx<0){ e.x=(tx+1)*TILE+0.01; e.vx=0; if(e===boss) e.face=1; }
  }
  // Y
  var prevBottom=e.y+e.h;
  e.y+=e.vy/60;
  e.onGround=false;
  x0=Math.floor((e.x+1)/TILE); x1=Math.floor((e.x+e.w-1)/TILE);
  y0=Math.floor(e.y/TILE); y1=Math.floor((e.y+e.h)/TILE);
  for(var ty2=y0;ty2<=y1;ty2++)for(var tx2=x0;tx2<=x1;tx2++){
    var tt=tileAt(tx2,ty2), s2=(tt===1||tt===4);
    if(!s2&&door&&!door.open){
      if(tx2*TILE<door.x+door.w&&(tx2+1)*TILE>door.x&&ty2*TILE<door.y+door.h&&(ty2+1)*TILE>door.y) s2=true;
    }
    if(tt===2&&!(isPlayer)){ /* enemies ignore oneway */ }
    else if(tt===2&&isPlayer){
      if(e.vy>=0&&prevBottom<=ty2*TILE+6&&!(keys['arrowdown']||keys['s'])){ e.y=ty2*TILE-e.h; e.vy=0; e.onGround=true; }
      continue;
    }
    if(!s2) continue;
    if(e.vy>0){ e.y=ty2*TILE-e.h; e.vy=0; e.onGround=true; }
    else if(e.vy<0){ e.y=(ty2+1)*TILE+0.01; e.vy=0; }
  }
}
function touchSpike(e){
  var x0=Math.floor((e.x+1)/TILE),x1=Math.floor((e.x+e.w-1)/TILE);
  var y0=Math.floor((e.y+1)/TILE),y1=Math.floor((e.y+e.h-1)/TILE);
  for(var ty=y0;ty<=y1;ty++)for(var tx=x0;tx<=x1;tx++) if(tileAt(tx,ty)===3) return true;
  return false;
}

// ---------- particles/floats ----------
function burst(x,y,n,col,spd){ for(var i=0;i<n;i++){ var a=Math.random()*6.28,s=(0.4+Math.random()*0.6)*(spd||90); parts.push({x:x,y:y,vx:Math.cos(a)*s,vy:Math.sin(a)*s-40,t:0.4+Math.random()*0.3,c:col}); } if(parts.length>300) parts.splice(0,parts.length-300); }
function floatText(x,y,txt,c){ floats.push({x:x,y:y,txt:txt,t:1.0,c:c||'#fff'}); }

// ---------- combat ----------
function hurtPlayer(dmg,srcX){
  if(player.inv>0||player.dashT>0||G.scene!=='play') return;
  player.hp-=dmg; player.inv=1.0; player.vy=-220;
  player.vx=(player.x+player.w/2<srcX?-160:160);
  AudioSys.sfx('hurt'); G.shake=5; burst(player.x+6,player.y+10,10,'#c33',120);
  floatText(player.x,player.y-8,'-'+dmg,'#ff6677');
  if(player.hp<=0){
    player.deadT=1.2; G.scene='dead'; G.deaths++;
    burst(player.x+6,player.y+12,24,'#9fb2ff',160);
    AudioSys.sfx('enemyDie');
  }
}
function damageFoe(f,dmg,kx){
  if(f.dead) return;
  f.hp-=dmg; f.flash=0.12;
  burst(f.x+f.w/2,f.y+f.h/2,8,'#ffd166',110);
  AudioSys.sfx('hit'); G.hitstop=0.06; G.shake=Math.max(G.shake,2);
  if(f.t==='skel'||f.t==='bat'){ f.vx+=kx||0; }
  if(f.hp<=0){ f.dead=true; AudioSys.sfx('enemyDie'); burst(f.x+f.w/2,f.y+f.h/2,16,'#aaa',140); spawnAnim('enemydeath',81,66,9,f.x+f.w/2,f.y+f.h/2,0.7,0.5); floatText(f.x,f.y-6,'처치!','#ffe'); }
}
function damageBoss(dmg){
  if(!boss||boss.dead||boss.state==='intro') return;
  boss.hp-=dmg; boss.flash=0.12; G.hitstop=0.05; G.shake=3;
  burst(boss.x+boss.w/2,boss.y+boss.h/2,8,'#ffd166',130);
  AudioSys.sfx('hit');
  if(boss.hp<=Math.floor(boss.maxhp/2)&&boss.phase===1){ boss.phase=2; boss.state='roar'; boss.t=1.2; AudioSys.sfx('roar'); G.shake=7; floatText(boss.x,boss.y-10,'2페이즈!','#f66'); }
  if(boss.hp<=0){
    boss.hp=0; boss.dead=true; boss.state='die'; boss.t=2.0;
    AudioSys.sfx('enemyDie'); AudioSys.sfx('clear');
    burst(boss.x+18,boss.y+20,40,'#ffe9a3',200);
    spawnAnim('enemydeath',81,66,9,boss.x+boss.w/2,boss.y+boss.h/2,1.6,0.8);
    G.shake=8;
  }
}

// ---------- player update ----------
function updatePlayer(dt){
  var p=player;
  p.anim+=dt*(p.onGround&&Math.abs(p.vx)>20?10:4);
  if(p.inv>0)p.inv-=dt;
  if(p.dashCD>0)p.dashCD-=dt;
  if(p.atkCD>0)p.atkCD-=dt;
  if(p.coyote>0)p.coyote-=dt;
  if(p.jbuf>0)p.jbuf-=dt;
  var L=left(),R=right();
  // 벽 감지 (hasWall 전용)
  p.wallDir=0;
  if(p.hasWall&&!p.onGround){
    if(solidAtPixel(p.x-2,p.y+6)||solidAtPixel(p.x-2,p.y+p.h-4)) p.wallDir=-1;
    else if(solidAtPixel(p.x+p.w+2,p.y+6)||solidAtPixel(p.x+p.w+2,p.y+p.h-4)) p.wallDir=1;
  }
  var dashing=p.dashT>0;
  if(!dashing){
    var acc=p.onGround?1200:800, max=140;
    if(L&&!R){ p.vx=Math.max(p.vx-acc*dt,-max); p.face=-1; }
    else if(R&&!L){ p.vx=Math.min(p.vx+acc*dt,max); p.face=1; }
    else{ var f=(p.onGround?1400:400)*dt; p.vx-=clamp(p.vx,-f,f); }
    p.vy+= (p.vy<0?900:1300)*dt;
    if(p.vy>520)p.vy=520;
    // 벽 슬라이딩
    if(p.wallDir!==0&&p.vy>0&&((L&&p.wallDir===-1)||(R&&p.wallDir===1))){
      p.vy=Math.min(p.vy,60); p.state='wall';
      if(Math.random()<dt*8){ burst(p.x+(p.wallDir>0?p.w:0),p.y+10,1,'#889',40); }
    }
  }
  // 점프 입력
  if(jumpPressed()){
    if(p.wallDir!==0&&p.hasWall&&!p.onGround){ p.vy=-300; p.vx=-p.wallDir*180; p.face=-p.wallDir; p.coyote=0; AudioSys.sfx('jump'); burst(p.x+6,p.y+18,6,'#9fb2ff',80); }
    else p.jbuf=0.12;
  }
  if(!jumpHeld()&&p.vy<-140) p.vy=lerp(p.vy,-140,dt*12); // 점프 컷
  if(p.jbuf>0&&(p.onGround||p.coyote>0)){ p.vy=-320; p.jbuf=0; p.coyote=0; p.onGround=false; AudioSys.sfx('jump'); burst(p.x+6,p.y+p.h,6,'#667',70); }
  // 대시
  if(dashPressed()&&p.hasDash&&p.dashCD<=0&&(p.onGround||p.airDash)&&p.atkT<=0){
    p.dashT=0.16; p.dashCD=0.8; p.dashDir=p.face;
    if(L&&!R)p.dashDir=-1; if(R&&!L)p.dashDir=1;
    if(!p.onGround)p.airDash=false;
    AudioSys.sfx('dash'); burst(p.x+6,p.y+12,10,'#7df9ff',120);
  }
  if(p.dashT>0){
    p.dashT-=dt; p.vx=p.dashDir*340; p.vy=0; p.state='dash';
    parts.push({x:p.x+6,y:p.y+12,vx:-p.dashDir*40,vy:0,t:0.25,c:'#7df9ff'});
    // 붕괴벽 파괴 체크
    var bx=Math.floor((p.x+p.w/2)/TILE),by0=Math.floor(p.y/TILE),by1=Math.floor((p.y+p.h)/TILE);
    for(var by=by0;by<=by1;by++) if(tileAt(bx,by)===4||tileAt(bx+p.dashDir,by)===4){
      for(var yy=22;yy<=28;yy++)for(var xx=57;xx<=59;xx++) if(tileAt(xx,yy)===4) setTile(xx,yy,0);
      AudioSys.sfx('break'); G.shake=6; burst((bx)*TILE, p.y+10, 26,'#a98',170);
      floatText(p.x-10,p.y-14,'벽이 무너졌다!','#fd6');
    }
  }
  // 공격
  if(atkPressed()&&p.atkCD<=0&&p.dashT<=0){
    p.atkT=0.22; p.atkCD=0.34; p.atkCombo=(p.atkCombo+1)%3;
    AudioSys.sfx(p.atkCombo===2?'atk2':'atk1');
    var hb={x:p.face>0?p.x+p.w-2:p.x-26,y:p.y+2,w:28,h:18};
    var hit=false;
    foes.forEach(function(f){ if(!f.dead&&overlap(hb,f)){ damageFoe(f,p.atkCombo===2?2:1,p.face*120); hit=true; } });
    if(boss&&!boss.dead&&overlap(hb,boss)){ damageBoss(p.atkCombo===2?2:1); hit=true; }
    if(hit){ p.vx*=0.3; }
  }
  if(p.atkT>0)p.atkT-=dt;
  // 물리
  var wasGround=p.onGround;
  moveEntity(p,true);
  if(p.onGround){ p.coyote=0.1; p.airDash=true; if(!wasGround&&p.vy===0){} }
  if(wasGround&&!p.onGround&&p.vy>=0&&p.dashT<=0){ /* coyote 유지 */ }
  // 가시
  if(touchSpike(p)) hurtPlayer(1,p.x+6+(p.face*20));
  // 낙하 안전망
  if(p.y>LV.h*TILE){ hurtPlayer(1,p.x); p.x=p.respawnX; p.y=p.respawnY; p.vx=0; p.vy=0; }
  // 상태
  if(p.dashT<=0){
    if(p.atkT>0)p.state='attack';
    else if(!p.onGround)p.state=(p.wallDir!==0?'wall':(p.vy<0?'jump':'fall'));
    else if(Math.abs(p.vx)>20)p.state='run'; else p.state='idle';
  }
  // 상호작용
  checkInteract();
  // 보스 트리거
  if(!boss&&p.x>bossTrigger.x&&door.open){ spawnBoss(); G.toast='타락한 종지기'; G.toastT=2; }
  // 존 이름
  var zx=p.x/TILE;
  G.zone= zx<40?'입구 회랑':(zx<80?'붕괴된 수직갱':(zx<122?'침수 회랑':'종탑 하층'));
}

// ---------- interact ----------
var nearTarget=null;
function checkInteract(){
  nearTarget=null;
  var p=player, pb={x:p.x-8,y:p.y-8,w:p.w+16,h:p.h+16};
  LV.signs.forEach(function(s){ if(overlap(pb,s)) nearTarget={kind:'sign',o:s}; });
  if(!dashAltar.taken&&overlap(pb,dashAltar)) nearTarget={kind:'dash',o:dashAltar};
  if(!gloveAltar.taken&&overlap(pb,gloveAltar)) nearTarget={kind:'wall',o:gloveAltar};
  if(lever&&!lever.used&&overlap(pb,lever)) nearTarget={kind:'lever',o:lever};
  LV.bells.forEach(function(b){ if(overlap(pb,b)) nearTarget={kind:'bell',o:b}; });
  if(interactPressed()&&nearTarget){
    var o=nearTarget.o;
    if(nearTarget.kind==='sign'){ G.dialog=o.text; AudioSys.sfx('lever'); }
    else if(nearTarget.kind==='dash'){ o.taken=true; player.hasDash=true; AudioSys.sfx('altar'); G.dialog='망자의 돌진 획득! [X/Shift] 대시 — 균열벽을 부술 수 있다.'; burst(o.x+10,o.y+10,20,'#7df9ff',120); }
    else if(nearTarget.kind==='wall'){ o.taken=true; player.hasWall=true; AudioSys.sfx('altar'); G.dialog='가고일 손톱 획득! 벽에 붙어 [점프]로 벽점프.'; burst(o.x+10,o.y+10,20,'#9fb2ff',120); }
    else if(nearTarget.kind==='lever'){ o.used=true; door.open=true; AudioSys.sfx('door'); G.dialog='문이 열렸다. 종탑 하층으로.'; burst(door.x+8,door.y+40,16,'#fd6',100); }
    else if(nearTarget.kind==='bell'){ player.hp=player.maxhp; player.respawnX=o.x-4; player.respawnY=o.y-2; o.lit=true; AudioSys.sfx('bell'); G.dialog='종이 울린다. 체력 회복 + 리스폰 저장.'; burst(o.x+8,o.y,12,'#ffe9a3',90); }
  }
}

// ---------- foes update ----------
function updateFoes(dt){
  var p=player;
  foes.forEach(function(f){
    if(f.dead) return;
    f.anim+=dt*8; if(f.flash>0)f.flash-=dt;
    var cx=f.x+f.w/2, px=p.x+p.w/2;
    if(f.t==='skel'){
      f.vy+=1100*dt; f.dir=(px<cx?-1:1);
      var sees=Math.abs(px-cx)<170&&Math.abs(p.y-f.y)<40;
      if(f.cool>0)f.cool-=dt;
      if(f.atkT>0){ f.atkT-=dt; if(f.atkT<0.12&&!f.didHit){ f.didHit=true; if(overlap({x:f.x+(f.face>0?f.w-4:-14),y:f.y+4,w:18,h:14},p)) hurtPlayer(1,cx); } }
      else if(sees&&Math.abs(px-cx)<30&&f.cool<=0){ f.atkT=0.35; f.didHit=false; f.face=f.dir; }
      else if(sees){ f.vx=f.dir*55; f.face=f.dir; } else { f.vx+=((f.pat||(f.pat=-40))-f.vx)*dt*2; if(Math.random()<dt*0.3)f.pat=-f.pat; }
      moveEntity(f,false);
      if(touchSpike(f)){ f.hp=0; f.dead=true; }
    }else if(f.t==='bat'){
      f.cool-=dt;
      if(f.dash>0){ f.dash-=dt; f.x+=f.dx*dt; f.y+=f.dy*dt; f.vx=0; f.vy=0;
        if(overlap(f,p)) hurtPlayer(1,cx);
      }else{
        var d2=dist2(cx,f.y,px,p.y);
        if(d2<240*240&&f.cool<=0){ var dx=px-cx,dy=(p.y)-f.y,L2=Math.sqrt(dx*dx+dy*dy)||1; f.dx=dx/L2*170; f.dy=dy/L2*170; f.dash=0.55; f.cool=1.8; AudioSys.sfx('shoot'); }
        else{ f.x+=Math.sin(G.time*2+f.anim)*20*dt; f.y+=Math.cos(G.time*3+f.anim)*30*dt+(f.baseY-f.y)*dt*0.5; }
      }
      if(overlap(f,p)) hurtPlayer(1,cx);
    }else if(f.t==='statue'){
      f.face=(px<cx?-1:1); f.cool-=dt;
      if(f.cool<=0&&Math.abs(px-cx)<300&&Math.abs(p.y-f.y)<60){
        f.cool=2.2; AudioSys.sfx('shoot');
        shots.push({x:cx,y:f.y+10,w:6,h:6,vx:f.face*160,vy:0,t:3});
        shots.push({x:cx,y:f.y+10,w:6,h:6,vx:f.face*160,vy:-40,t:3,delay:0.15});
      }
    }
  });
  // 투사체
  for(var i=shots.length-1;i>=0;i--){
    var s=shots[i];
    if(s.delay&&s.delay>0){ s.delay-=dt; continue; }
    s.x+=s.vx*dt; s.y+=s.vy*dt; s.t-=dt;
    if(solidAtPixel(s.x+3,s.y+3)||s.t<=0){ shots.splice(i,1); burst(s.x,s.y,4,'#c9f',60); continue; }
    if(overlap(s,player)){ hurtPlayer(1,s.x); shots.splice(i,1); }
  }
}

// ---------- boss update ----------
function updateBoss(dt){
  if(!boss||boss.dead&&boss.t<=0) return;
  var b=boss, p=player;
  if(b.flash>0)b.flash-=dt;
  var cx=b.x+b.w/2, px=p.x+p.w/2;
  b.face=(px<cx?-1:1);
  if(b.state==='intro'){ b.t-=dt; if(b.t<=0){ b.state='chase'; b.cool=0.8; } return; }
  if(b.state==='die'){ b.t-=dt; if(Math.random()<dt*20)burst(b.x+Math.random()*b.w,b.y+Math.random()*b.h,4,'#fd6',120);
    if(b.t<=0){ onBossDead(); } return; }
  if(b.state==='roar'){ b.t-=dt; if(b.t<=0){ b.state='chase'; b.cool=0.5; } return; }
  b.vy+=1100*dt; if(b.vy>600)b.vy=600;
  if(b.state==='chase'){
    b.cool-=dt;
    b.vx+=(b.face*70-b.vx)*dt*3;
    moveEntity(b,false);
    if(overlap({x:b.x-4,y:b.y-4,w:b.w+8,h:b.h+8},p)) hurtPlayer(1,cx);
    if(b.cool<=0){
      var r=Math.random();
      if(b.phase===2&&r<0.25){ b.state='summon'; b.t=0.8; }
      else if(r<0.5){ b.state='slam'; b.t=0.6; b.didHit=false; AudioSys.sfx('roar'); }
      else if(r<0.75){ b.state='charge'; b.t=0.9; b.vx=b.face*260; AudioSys.sfx('dash'); }
      else{ b.state='jump'; b.t=0; b.airT=0; b.vy=-460; b.vx=b.face*140; AudioSys.sfx('jump'); }
    }
  }else if(b.state==='slam'){
    b.vx=0; b.t-=dt;
    if(b.t<0.3&&!b.didHit){ b.didHit=true; G.shake=7; AudioSys.sfx('break');
      burst(b.x+(b.face>0?b.w:0),b.y+b.h,18,'#a98',160);
      shots.push({x:b.x+(b.face>0?b.w:-8),y:b.y+b.h-10,w:8,h:8,vx:b.face*200,vy:-60,t:1.2,shock:true});
      shots.push({x:b.x+(b.face>0?b.w:-8),y:b.y+b.h-10,w:8,h:8,vx:-b.face*200,vy:-60,t:1.2,shock:true});
      if(Math.abs(px-cx)<70&&Math.abs(p.y-b.y)<50) hurtPlayer(1,cx);
    }
    moveEntity(b,false);
    if(b.t<=0){ b.state='chase'; b.cool=b.phase===2?0.5:1.0; }
  }else if(b.state==='charge'){
    b.t-=dt; b.vy=0;
    var nx=b.x+b.vx*dt; b.x=nx;
    // 벽 충돌 간이
    if(solidAtPixel(b.x+(b.face>0?b.w+2:-2),b.y+b.h/2)){ b.t=0; G.shake=6; AudioSys.sfx('break'); burst(cx,b.y+b.h-10,14,'#a98',140); }
    if(overlap(b,p)) hurtPlayer(1,cx);
    if(b.t<=0){ b.vx=0; b.state='chase'; b.cool=0.8; }
  }else if(b.state==='jump'){
    b.airT=(b.airT||0)+dt;
    moveEntity(b,false);
    if(b.onGround&&b.airT>0.3){ // 착지
      if(b.phase===2){ G.shake=8; AudioSys.sfx('break'); burst(cx,b.y+b.h,24,'#f96',180);
        for(var k=-1;k<=1;k++) shots.push({x:cx,y:b.y+b.h-12,w:8,h:8,vx:k*180,vy:-160,t:1.0,shock:true});
        if(Math.abs(px-cx)<90) hurtPlayer(1,cx);
      }
      b.state='chase'; b.cool=0.9; b.t=99;
    }
  }else if(b.state==='summon'){
    b.vx=0; b.t-=dt; moveEntity(b,false);
    if(b.t<=0){ b.state='chase'; b.cool=1.2;
      var n=0; foes.forEach(function(f){ if(!f.dead&&f.t==='skel')n++; });
      if(n<2){ foes.push({t:'skel',x:b.x-30,y:b.y-10,w:14,h:20,vx:0,vy:0,hp:2,dir:-1,face:-1,atkT:0,cool:0.5,dead:false,anim:0}); foes.push({t:'skel',x:b.x+b.w+20,y:b.y-10,w:14,h:20,vx:0,vy:0,hp:2,dir:1,face:1,atkT:0,cool:0.5,dead:false,anim:0}); floatText(cx,b.y-12,'해골 소환!','#c9f'); AudioSys.sfx('shoot'); }
    }
  }
  if(touchSpike(b)){ /* 보스는 가시 무시 */ }
}
function onBossDead(){
  boss=null;
  AudioSys.setBGM('stage'); AudioSys.sfx('bell');
  G.scene='ending'; G.endT=0;
  var t=Math.floor(G.playTime);
  var rec={time:t,deaths:G.deaths,date:Date.now()};
  try{
    var prev=null; try{prev=JSON.parse(localStorage.getItem('erebos.v1')); }catch(e){}
    if(!prev||t<prev.time) localStorage.setItem('erebos.v1',JSON.stringify(rec));
    G.best=rec;
  }catch(e){}
}

// ---------- render helpers ----------
// itch.io 교체: 아래 draw* 함수만 스프라이트 blit으로 바꾸면 됨.
function drawLayer(im,parallax,bottomY){
  if(!im) return;
  var w=im.width, h=im.height;
  var off=-(G.cam.x*parallax%w); if(off>0)off-=w;
  var y=Math.round(bottomY-h);
  for(var x=off;x<VW;x+=w) ctx.drawImage(im,Math.round(x),y);
}
function drawBackground(){
  var g=ctx.createLinearGradient(0,0,0,VH);
  g.addColorStop(0,'#0b0b1c'); g.addColorStop(0.6,'#12122a'); g.addColorStop(1,'#0a0a14');
  ctx.fillStyle=g; ctx.fillRect(0,0,VW,VH);
  var ok=false;
  if(assetsLoaded){
    drawLayer(img('bg_far'),0.1,VH+8);
    drawLayer(img('bg_back'),0.2,VH+8);
    drawLayer(img('bg_mid'),0.35,VH+8);
    drawLayer(img('bg_near'),0.55,VH+10);
    ok=img('bg_far')||img('bg_near');
  }
  if(!ok){
    // 폴백: 절차적 실루엣
    var cx=G.cam.x;
    ctx.fillStyle='#181832';
    for(var i=0;i<14;i++){ var wx=i*90-(cx*0.2%90); ctx.fillRect(wx,120+hash(i,7)*30,50,150); ctx.fillRect(wx+15,100+hash(i,3)*30,20,60); }
    ctx.fillStyle='#202040';
    for(var j=0;j<18;j++){ var wx2=j*70-(cx*0.4%70); ctx.fillRect(wx2,150+hash(j,9)*20,40,120); }
  }
  // 안개
  ctx.fillStyle='rgba(120,120,180,0.05)';
  for(var k=0;k<3;k++) ctx.fillRect(0,200+k*18+Math.sin(G.time*0.5+k)*4,VW,14);
}
function drawTile(tx,ty,t){
  var x=tx*TILE-G.cam.x, y=ty*TILE-G.cam.y;
  if(x<-20||y<-20||x>VW+20||y>VH+20) return;
  if(t===1){
    var v=hash(tx,ty);
    ctx.fillStyle=v<0.5?'#2a2a3e':'#252538'; ctx.fillRect(x,y,16,16);
    ctx.fillStyle='#34344e'; ctx.fillRect(x,y,16,2); ctx.fillRect(x,y,2,16);
    ctx.fillStyle='#171724'; ctx.fillRect(x,y+14,16,2); ctx.fillRect(x+14,y,2,16);
    if(hash(tx*2,ty*3)<0.2){ ctx.fillStyle='#3d3d5c'; ctx.fillRect(x+5,y+6,6,4); }
  }else if(t===2){ ctx.fillStyle='#5a3d26'; ctx.fillRect(x,y+4,16,6); ctx.fillStyle='#7a5a36'; ctx.fillRect(x,y+4,16,2); }
  else if(t===3){ ctx.fillStyle='#888'; for(var i=0;i<4;i++){ var sx=x+i*4; ctx.beginPath(); ctx.moveTo(sx,y+16); ctx.lineTo(sx+2,y+6); ctx.lineTo(sx+4,y+16); ctx.fill(); } ctx.fillStyle='#c00'; ctx.fillRect(x,y+14,16,2); }
  else if(t===4){ ctx.fillStyle='#4a3a5e'; ctx.fillRect(x,y,16,16); ctx.strokeStyle='#8a6ab0'; ctx.lineWidth=1; ctx.beginPath(); ctx.moveTo(x+2,y+2); ctx.lineTo(x+14,y+14); ctx.moveTo(x+14,y+2); ctx.lineTo(x+2,y+14); ctx.stroke(); ctx.fillStyle='#c9a'; ctx.fillRect(x+6,y+6,4,4); }
}
function drawProps(){
  LV.props.forEach(function(pr){
    var x=pr.x-G.cam.x, y=pr.y-G.cam.y+Math.sin(G.time*3+pr.x)*1;
    if(x<-20||x>VW+20) return;
    if(pr.kind==='torch'){
      ctx.fillStyle='#5a3d26'; ctx.fillRect(x,y+6,4,10);
      var tim=img('torch');
      if(tim){ drawSheet(tim,32,32,Math.floor(G.time*8+pr.x)%4,x+2,y-8,0.75,false,16); }
      else { var fl=2+Math.sin(G.time*10+pr.x)*1; ctx.fillStyle='#ff9d2e'; ctx.fillRect(x-1,y-fl,6,7); ctx.fillStyle='#ffe9a3'; ctx.fillRect(x+1,y-fl+2,2,3); }
      var gr=ctx.createRadialGradient(x+2,y,2,x+2,y,34); gr.addColorStop(0,'rgba(255,180,80,0.25)'); gr.addColorStop(1,'rgba(255,180,80,0)'); ctx.fillStyle=gr; ctx.fillRect(x-32,y-32,68,68); }
    else if(pr.kind==='chain'){ ctx.fillStyle='#333'; ctx.fillRect(x,y-20,3,24); }
    else{ ctx.fillStyle='#1d3a24'; ctx.fillRect(x,y+8,8,5); }
  });
}
function drawAltar(o,col){
  var x=o.x-G.cam.x, y=o.y-G.cam.y;
  ctx.fillStyle='#222'; ctx.fillRect(x-2,y+12,24,8);
  ctx.fillStyle=col; var b=Math.sin(G.time*3)*2; ctx.fillRect(x+5,y+2+b,10,10);
  ctx.fillStyle='#fff'; ctx.fillRect(x+7,y+4+b,6,2);
  if(!o.taken&&DEBUG){} 
}
function drawBell(b){
  var x=b.x-G.cam.x, y=b.y-G.cam.y;
  ctx.fillStyle='#3a3a4a'; ctx.fillRect(x+5,y-8,6,8);
  ctx.fillStyle=b.lit?'#ffd700':'#6a6a7a'; ctx.fillRect(x,y,16,14);
  ctx.fillStyle='#000'; ctx.fillRect(x+7,y+8,2,4);
  if(b.lit){ ctx.fillStyle='rgba(255,215,0,'+(0.15+0.1*Math.sin(G.time*4))+')'; ctx.fillRect(x-6,y-6,28,28); }
}
function drawPlayer(){
  var p=player, x=Math.round(p.x-G.cam.x), y=Math.round(p.y-G.cam.y);
  if(p.inv>0&&Math.floor(G.time*14)%2===0&&G.scene==='play') ctx.globalAlpha=0.4;
  var cx=x+p.w/2, feet=y+p.h, flip=p.face<0, done=false;
  var fr=Math.floor(p.anim);
  if(G.scene==='dead'){ done=drawSheet(img('k1_death'),120,80,Math.min(9,Math.floor((1.2-p.deadT)/1.2*10)),cx,feet,0.5,flip,56); }
  else if(p.inv>0.9&&p.hp>0){ done=drawSheet(img('k1_hit'),120,80,0,cx,feet,0.5,flip,56); }
  else if(p.state==='attack'){
    var atkN=p.atkCombo===2?6:4, prog=1-p.atkT/0.22;
    done=drawSheet(img(p.atkCombo===2?'k1_attack2':'k1_attack'),120,80,Math.min(atkN-1,Math.floor(prog*atkN)),cx,feet,0.5,flip,56);
  }
  else if(p.state==='dash') done=drawSheet(img('k1_dash'),120,80,fr%2,cx,feet,0.5,flip,56);
  else if(p.state==='wall') done=drawSheet(img('k1_wall'),120,80,fr%3,cx,feet,0.5,flip,56);
  else if(p.state==='jump') done=drawSheet(img('k1_jump'),120,80,p.vy<-100?0:(p.vy<100?1:2),cx,feet,0.5,flip,56);
  else if(p.state==='fall') done=drawSheet(img('k1_fall'),120,80,Math.min(2,fr%3),cx,feet,0.5,flip,56);
  else if(p.state==='run') done=drawSheet(img('k1_run'),120,80,fr%10,cx,feet,0.5,flip,56);
  else done=drawSheet(img('k1_idle'),120,80,fr%10,cx,feet,0.5,flip,56);
  if(!done){ // 폴백: 절차적 기사
    var run=Math.sin(p.anim)*(p.state==='run'?2:0);
    ctx.fillStyle='rgba(0,0,0,0.35)'; ctx.fillRect(x+1,y+p.h-2,p.w-2,3);
    ctx.fillStyle='#8b93ad'; ctx.fillRect(x+2,y+8,8,10);
    ctx.fillStyle='#5a6080'; ctx.fillRect(x+2,y+14+run,3,6-run); ctx.fillRect(x+7,y+14-run,3,6+run);
    ctx.fillStyle='#c9cede'; ctx.fillRect(x+1,y+2,10,7);
    ctx.fillStyle='#222'; ctx.fillRect(x+(p.face>0?7:3),y+4,3,2);
    ctx.fillStyle='#a33'; ctx.fillRect(x+3,y,6,2);
    if(p.hasDash){ ctx.fillStyle='#7df9ff'; ctx.fillRect(x+2,y+10,2,2); }
    if(p.hasWall){ ctx.fillStyle='#9fb2ff'; ctx.fillRect(x+8,y+10,2,2); }
    if(p.state==='attack'){ ctx.fillStyle='#e8ecff'; var sx=p.face>0?x+p.w:x-12; ctx.fillRect(sx,y+6,12,3); ctx.fillStyle='#ffd166'; ctx.fillRect(p.face>0?sx-2:sx+10,y+5,3,5); }
    else{ ctx.fillStyle='#9aa'; ctx.fillRect(p.face>0?x+10:x-1,y+10,3,8); }
    if(p.state==='dash'){ ctx.fillStyle='rgba(125,249,255,0.4)'; ctx.fillRect(x-p.face*10,y+6,12,10); }
  } else if(p.state==='dash'){ ctx.fillStyle='rgba(125,249,255,0.35)'; ctx.fillRect(x-p.face*10,y+6,12,10); }
  ctx.globalAlpha=1;
  if(DEBUG){ ctx.strokeStyle='#0f0'; ctx.strokeRect(x,y,p.w,p.h); }
}
function drawFoe(f){
  var x=Math.round(f.x-G.cam.x), y=Math.round(f.y-G.cam.y);
  if(x<-60||x>VW+60) return;
  if(f.flash>0){ ctx.fillStyle='#fff'; ctx.fillRect(x-2,y-2,f.w+4,f.h+4); }
  var cx=x+f.w/2, feet=y+f.h, fr=Math.floor(f.anim), done=false;
  if(f.t==='skel'){
    done=drawSheet(img('ghoul_run'),76,60,fr%6,cx,feet,0.55,f.face>0,38);
    if(f.atkT>0){ ctx.fillStyle='#f66'; ctx.fillRect(f.face>0?x+f.w:x-8,y+6,8,2); }
  }else if(f.t==='bat'){
    var bim=(f.dash>0)?img('angel_attack'):img('angel_idle');
    done=drawSheet(bim,122,117,f.dash>0?Math.min(2,fr%3):fr%8,cx,y+f.h/2+14,0.35,f.vx<0,61);
  }else if(f.t==='statue'){
    if(f.cool<0.5){ var pr=1-f.cool/0.5; done=drawSheet(img('wiz_fire'),81,66,Math.min(9,Math.floor(pr*10)),cx,feet,0.6,f.face<0,40); }
    else done=drawSheet(img('wiz_idle'),81,66,Math.floor(f.anim*0.5)%5,cx,feet,0.6,f.face<0,40);
  }
  if(!done){ // 폴백
    ctx.fillStyle='rgba(0,0,0,0.3)'; ctx.fillRect(x+1,y+f.h-2,f.w-2,3);
    if(f.t==='skel'){
      var w=Math.sin(f.anim)*1.5;
      ctx.fillStyle='#d8d8d8'; ctx.fillRect(x+2,y+4,10,8); ctx.fillRect(x+3,y+12+w,3,8); ctx.fillRect(x+8,y+12-w,3,8);
      ctx.fillStyle='#000'; ctx.fillRect(x+(f.face>0?8:4),y+6,2,2); ctx.fillRect(x+(f.face>0?11:7),y+6,1,2);
      if(f.atkT>0){ ctx.fillStyle='#bbb'; ctx.fillRect(f.face>0?x+f.w:x-10,y+8,10,2); }
    }else if(f.t==='bat'){
      var w2=Math.sin(f.anim*2)*4;
      ctx.fillStyle='#6a4a8a'; ctx.fillRect(x-4,y+4+w2,6,3); ctx.fillRect(x+f.w-2,y+4-w2,6,3);
      ctx.fillStyle='#8a6ab0'; ctx.fillRect(x+3,y+2,8,7); ctx.fillStyle='#f00'; ctx.fillRect(x+5,y+4,2,2); ctx.fillRect(x+8,y+4,1,2);
    }else if(f.t==='statue'){
      ctx.fillStyle='#4a4a5a'; ctx.fillRect(x,y,14,28); ctx.fillStyle='#5a5a6e'; ctx.fillRect(x+2,y+2,10,8);
      ctx.fillStyle=f.cool<0.5?'#f00':'#7a5'; ctx.fillRect(x+5,y+5,4,3);
    }
  }
  // hp pip
  if(f.hp<4){ ctx.fillStyle='#300'; ctx.fillRect(x,y-5,f.w,3); ctx.fillStyle='#f44'; ctx.fillRect(x,y-5,f.w*Math.max(0,f.hp)/4,3); }
}
function drawBoss(){
  if(!boss) return; var b=boss, x=Math.round(b.x-G.cam.x), y=Math.round(b.y-G.cam.y);
  if(b.flash>0){ ctx.fillStyle='#fff'; ctx.fillRect(x-3,y-3,b.w+6,b.h+6); }
  var cx=x+b.w/2, feet=y+b.h, flip=b.face<0, sc=1.35, done=false;
  var fr=Math.floor(G.time*10);
  if(b.state==='die'){ var pr=1-clamp(b.t/2,0,1); done=drawSheet(img('k2_death'),120,80,Math.min(9,Math.floor(pr*10)),cx,feet,sc,flip,56); }
  else if(b.state==='intro') done=drawSheet(img('k2_idle'),120,80,fr%10,cx,feet,sc,flip,56);
  else if(b.state==='slam'){ done=drawSheet(img('k2_attack2'),120,80,Math.min(5,(b.didHit?4:Math.floor((0.6-b.t)/0.6*4))),cx,feet,sc,flip,56); }
  else if(b.state==='charge') done=drawSheet(img('k2_dash'),120,80,fr%2,cx,feet,sc,flip,56);
  else if(b.state==='jump') done=drawSheet(img('k2_jump'),120,80,b.vy<0?0:2,cx,feet,sc,flip,56);
  else if(b.state==='summon'||b.state==='roar') done=drawSheet(img('k2_attack'),120,80,fr%4,cx,feet,sc,flip,56);
  else done=drawSheet(img('k2_run'),120,80,fr%10,cx,feet,sc,flip,56);
  if(!done){ // 폴백: 골렘
    ctx.fillStyle='rgba(0,0,0,0.4)'; ctx.fillRect(x,y+b.h-2,b.w,4);
    var squash=(b.state==='slam'?4:0);
    ctx.fillStyle='#5a4a6a'; ctx.fillRect(x,y+8-squash,b.w,b.h-8+squash);
    ctx.fillStyle='#6e5a80'; ctx.fillRect(x+4,y+12,10,10); ctx.fillRect(x+22,y+12,10,10);
    ctx.fillStyle='#2a1f33'; ctx.fillRect(x+8,y,20,12);
    ctx.fillStyle=b.phase===2?'#f33':'#fd6'; ctx.fillRect(x+12,y+4,4,4); ctx.fillRect(x+20,y+4,4,4);
    ctx.fillStyle='#3a2f4a';
    var arm=b.state==='slam'?10:Math.sin(G.time*4)*3;
    ctx.fillRect(x-6,y+14+arm,8,16); ctx.fillRect(x+b.w-2,y+14-arm,8,16);
    ctx.fillStyle='#ffd700'; ctx.fillRect(x+13,y-6,10,10);
  }
}
function drawHUD(){
  // 체력
  for(var i=0;i<player.maxhp;i++){ ctx.fillStyle=i<player.hp?'#e33':'#332'; ctx.fillRect(10+i*16,10,12,12); ctx.fillStyle=i<player.hp?'#f88':'#221'; ctx.fillRect(11+i*16,11,6,4); }
  // 대시 쿨
  ctx.fillStyle='#222'; ctx.fillRect(10,26,40,6);
  if(player.hasDash){ ctx.fillStyle=player.dashCD<=0?'#7df9ff':'#446'; ctx.fillRect(10,26,40*clamp(1-player.dashCD/0.8,0,1),6); }
  else{ ctx.fillStyle='#333'; ctx.fillRect(10,26,40,6); }
  if(!player.hasWall){ ctx.fillStyle='#333'; ctx.font='8px monospace'; ctx.fillStyle='#888'; ctx.fillText('벽점프 X',56,32); }
  // 구역명 + 토스트
  ctx.fillStyle='#cfd2e0'; ctx.font='10px monospace'; ctx.fillText(G.zone,10,48);
  ctx.fillStyle='#8b8fa8'; ctx.font='9px monospace';
  ctx.fillText('TIME '+Math.floor(G.playTime)+'s  DEATH '+G.deaths,10,VH-10);
  if(G.toastT>0){ ctx.fillStyle='rgba(0,0,0,0.6)'; ctx.fillRect(VW/2-110,40,220,22); ctx.fillStyle='#ffe9a3'; ctx.font='11px monospace'; ctx.textAlign='center'; ctx.fillText(G.toast,VW/2,55); ctx.textAlign='left'; }
  // 보스바
  if(boss&&!boss.dead){ ctx.fillStyle='rgba(0,0,0,0.6)'; ctx.fillRect(VW/2-100,12,200,12); ctx.fillStyle='#5a0f1f'; ctx.fillRect(VW/2-98,14,196,8); ctx.fillStyle='#e33'; ctx.fillRect(VW/2-98,14,196*clamp(boss.hp/boss.maxhp,0,1),8); ctx.fillStyle='#fff'; ctx.font='9px monospace'; ctx.textAlign='center'; ctx.fillText('타락한 종지기',VW/2,22); ctx.textAlign='left'; }
  // 상호작용 힌트
  if(nearTarget&&G.scene==='play'&&!G.dialog){ ctx.fillStyle='#ffe9a3'; ctx.font='10px monospace'; ctx.textAlign='center'; ctx.fillText('[E] 조사',VW/2,VH-30); ctx.textAlign='left'; }
}

// ---------- scenes ----------
function startGame(){
  buildLevel();
  resetPlayer(5*TILE,28*TILE-30);
  spawnFoes(); boss=null; shots=[]; parts=[]; floats=[];
  G.scene='intro'; G.introStep=0; G.playTime=0; G.deaths=0;
  G.cam.x=0; G.cam.y=LV.h*TILE-VH;
  AudioSys.setBGM('title');
}
var INTRO=['순례자는 기억 없이 눈을 떴다.','종이 세 번 울리면, 성소는 다시 가라앉는다.','첫 번째 종탑으로 가라. (Enter)'];
function update(dt){
  G.time+=dt;
  AudioSys.update(dt);
  if(G.toastT>0)G.toastT-=dt;
  // 파티클/플로트 항상
  for(var i=parts.length-1;i>=0;i--){ var q=parts[i]; q.t-=dt; q.x+=q.vx*dt; q.y+=q.vy*dt; q.vy+=300*dt; if(q.t<=0)parts.splice(i,1); }
  for(var j=floats.length-1;j>=0;j--){ var fl=floats[j]; fl.t-=dt; fl.y-=20*dt; if(fl.t<=0)floats.splice(j,1); }
  updateAnims(dt);
  if(keys['m']&&pressed['m']){ AudioSys.toggleMute(); }
  if((keys['escape']&&pressed['escape'])&&(G.scene==='play')){ G.paused=!G.paused; }
  if(G.paused){ clearPressed(); return; }

  if(G.scene==='title'){
    AudioSys.setBGM('title');
    if(assetsLoaded&&confirmPressed()){ startGame(); }
  }else if(G.scene==='intro'){
    if(confirmPressed()){ G.introStep++; if(G.introStep>=INTRO.length){ G.scene='play'; AudioSys.setBGM('stage'); G.dialog='←→ 이동, Z 점프, J 공격. E로 조사.'; } }
  }else if(G.scene==='play'){
    G.playTime+=dt;
    if(G.hitstop>0){ G.hitstop-=dt; clearPressed(); return; }
    updatePlayer(dt);
    updateFoes(dt);
    updateBoss(dt);
    // 카메라
    var tx=clamp(player.x+player.w/2-VW/2,0,LV.w*TILE-VW);
    var ty=clamp(player.y+player.h/2-VH/2,0,LV.h*TILE-VH);
    G.cam.x=lerp(G.cam.x,tx,1-Math.pow(0.001,dt));
    G.cam.y=lerp(G.cam.y,ty,1-Math.pow(0.001,dt));
    if(G.shake>0)G.shake-=dt*20;
    if(G.dialog&&confirmPressed()) G.dialog=null;
  }else if(G.scene==='dead'){
    player.deadT-=dt;
    updateFoes(dt*0.2);
    if(player.deadT<=0){
      // 리스폰
      player.x=player.respawnX; player.y=player.respawnY; player.vx=0; player.vy=0;
      player.hp=player.maxhp; player.inv=1.5;
      if(boss){ // 보스전 사망 시 보스 리셋
        boss=null; spawnFoes(); AudioSys.setBGM('stage');
      }
      G.scene='play';
    }
  }else if(G.scene==='ending'){
    G.endT=(G.endT||0)+dt;
    if(G.endT>1&&confirmPressed()){ G.scene='title'; }
  }
  clearPressed();
}
function render(){
  ctx.save();
  ctx.scale(1,1);
  drawBackground();
  if(G.scene==='title'){
    ctx.fillStyle='#000'; ctx.fillRect(0,0,VW,VH);
    var tb=img('titlebg');
    if(tb){ ctx.drawImage(tb,0,0,tb.width,tb.height,0,0,VW,VH); ctx.fillStyle='rgba(0,0,10,0.55)'; ctx.fillRect(0,0,VW,VH); }
    ctx.fillStyle='#8a6ab0'; ctx.font='28px monospace'; ctx.textAlign='center';
    ctx.fillText('EREBOS',VW/2,100);
    ctx.fillStyle='#cfd2e0'; ctx.font='11px monospace';
    ctx.fillText('— 잊힌 성소 · 1스테이지 메트로베니아 —',VW/2,122);
    if(!assetsLoaded){
      ctx.fillStyle='#888'; ctx.font='12px monospace';
      ctx.fillText('LOADING...',VW/2,170);
    } else {
      ctx.fillStyle=Math.floor(G.time*2)%2?'#ffe9a3':'#665'; ctx.font='12px monospace';
      ctx.fillText('PRESS ENTER',VW/2,170);
    }
    ctx.fillStyle='#8b8fa8'; ctx.font='9px monospace';
    ctx.fillText('이동 ←→ · 점프 Z · 대시 X · 공격 J · 조사 E',VW/2,200);
    ctx.fillText('대시 + 벽점프 해금 · 정식보스 포함 (10~15분)',VW/2,214);
    if(G.best) ctx.fillText('BEST '+G.best.time+'s / DEATH '+G.best.deaths,VW/2,230);
    ctx.textAlign='left';
    ctx.restore();
    return;
  }
  // 월드
  var shx=G.shake>0?(Math.random()-0.5)*G.shake:0;
  var shy=G.shake>0?(Math.random()-0.5)*G.shake:0;
  ctx.save(); ctx.translate(Math.round(-G.cam.x+shx),Math.round(-G.cam.y+shy));
  // 타일
  var x0=Math.max(0,Math.floor(G.cam.x/TILE)-1),x1=Math.min(LV.w-1,Math.ceil((G.cam.x+VW)/TILE)+1);
  var y0=Math.max(0,Math.floor(G.cam.y/TILE)-1),y1=Math.min(LV.h-1,Math.ceil((G.cam.y+VH)/TILE)+1);
  // drawTile은 카메라를 빼므로 임시로 조정: 직접 그리기
  for(var ty=y0;ty<=y1;ty++)for(var tx=x0;tx<=x1;tx++){
    var t=tileAt(tx,ty); if(!t)continue;
    var sx=tx*TILE, sy=ty*TILE;
    if(t===1){ var v=hash(tx,ty); ctx.fillStyle=v<0.5?'#2a2a3e':'#252538'; ctx.fillRect(sx,sy,16,16);
      ctx.fillStyle='#34344e'; ctx.fillRect(sx,sy,16,2); ctx.fillStyle='#171724'; ctx.fillRect(sx,sy+14,16,2); }
    else if(t===2){ ctx.fillStyle='#5a3d26'; ctx.fillRect(sx,sy+4,16,6); ctx.fillStyle='#7a5a36'; ctx.fillRect(sx,sy+4,16,2); }
    else if(t===3){ ctx.fillStyle='#888'; for(var s=0;s<4;s++){ ctx.beginPath(); ctx.moveTo(sx+s*4,sy+16); ctx.lineTo(sx+s*4+2,sy+6); ctx.lineTo(sx+s*4+4,sy+16); ctx.fill(); } ctx.fillStyle='#c00'; ctx.fillRect(sx,sy+14,16,2); }
    else if(t===4){ ctx.fillStyle='#4a3a5e'; ctx.fillRect(sx,sy,16,16); ctx.strokeStyle='#8a6ab0'; ctx.strokeRect(sx+2.5,sy+2.5,11,11); ctx.fillStyle='#c9a'; ctx.fillRect(sx+6,sy+6,4,4); }
  }
  ctx.restore();
  // 카메라 적용된 오브젝트 그리기는 draw*가 cam을 빼므로 그대로 호출
  // (위 타일은 직접 그렸으므로 drawTile 미사용 — itch.io 교체 시 drawTile로 통합)
  ctx.save(); ctx.translate(shx,shy);
  drawProps();
  // 기둥 장식 (월드 고정)
  var colIm=img('column');
  if(colIm){ [16,48,88,118,128].forEach(function(ctxl){
    var dx=ctxl*TILE-G.cam.x, gy=28*TILE, dy=gy-190-G.cam.y;
    if(dx>-120&&dx<VW+20) ctx.drawImage(colIm,Math.round(dx),Math.round(dy));
  }); }
  // 문/레버/제단/종/표지판
  if(door&&!door.open){ var dx=door.x-G.cam.x,dy=door.y-G.cam.y; ctx.fillStyle='#3a2f4a'; ctx.fillRect(dx,dy,door.w,door.h); ctx.fillStyle='#8a6ab0'; for(var dd=0;dd<4;dd++)ctx.fillRect(dx+2,dy+6+dd*14,door.w-4,4); }
  if(lever){ var lx=lever.x-G.cam.x,ly=lever.y-G.cam.y; ctx.fillStyle='#444'; ctx.fillRect(lx,ly+6,12,8); ctx.fillStyle=lever.used?'#4f4':'#f44'; ctx.fillRect(lx+4,ly+(lever.used?8:0),4,8); }
  if(!dashAltar.taken) drawAltar(dashAltar,'#7df9ff'); else { ctx.fillStyle='#333'; var ax=dashAltar.x-G.cam.x,ay=dashAltar.y-G.cam.y; ctx.fillRect(ax-2,ay+12,24,8); }
  if(!gloveAltar.taken) drawAltar(gloveAltar,'#9fb2ff'); else { ctx.fillStyle='#333'; var gx=gloveAltar.x-G.cam.x,gy=gloveAltar.y-G.cam.y; ctx.fillRect(gx-2,gy+12,24,8); }
  LV.bells.forEach(drawBell);
  LV.signs.forEach(function(s){ var x=s.x-G.cam.x,y=s.y-G.cam.y; ctx.fillStyle='#4a3a2a'; ctx.fillRect(x,y+8,14,14); ctx.fillStyle='#c9a86a'; ctx.fillRect(x+2,y+10,10,8); });
  foes.forEach(function(f){ if(!f.dead) drawFoe(f); });
  var fbIm=img('fireball');
  shots.forEach(function(s){
    var x=s.x-G.cam.x,y=s.y-G.cam.y;
    if(fbIm&&!s.shock){ drawSheet(fbIm,26,26,Math.floor(G.time*10)%3,x+3,y+3,0.8,false,13); }
    else{ ctx.fillStyle=s.shock?'#f96':'#c9f'; ctx.fillRect(x-3,y-6,6,3); ctx.fillRect(x,y,6,6); }
  });
  drawBoss();
  drawPlayer();
  drawAnims();
  // 파티클
  parts.forEach(function(pt){ ctx.globalAlpha=clamp(pt.t*2,0,1); ctx.fillStyle=pt.c; ctx.fillRect(pt.x-G.cam.x,pt.y-G.cam.y,3,3); }); ctx.globalAlpha=1;
  floats.forEach(function(f){ ctx.globalAlpha=clamp(f.t,0,1); ctx.fillStyle=f.c; ctx.font='9px monospace'; ctx.fillText(f.txt,f.x-G.cam.x,f.y-G.cam.y); }); ctx.globalAlpha=1;
  ctx.restore();

  // HUD (카메라 무관)
  drawHUD();
  // 대화창
  var dlg=G.dialog||(G.scene==='intro'?INTRO[Math.min(G.introStep,INTRO.length-1)]:null);
  if(dlg){ ctx.fillStyle='rgba(0,0,0,0.8)'; ctx.fillRect(20,VH-64,VW-40,48); ctx.strokeStyle='#8a6ab0'; ctx.strokeRect(20.5,VH-63.5,VW-40,48); ctx.fillStyle='#e8ecff'; ctx.font='10px monospace'; wrapText(dlg,32,VH-44,VW-64,14); ctx.fillStyle='#888'; ctx.font='9px monospace'; ctx.fillText('[Enter] 닫기',VW-90,VH-22); }
  if(G.scene==='dead'){ ctx.fillStyle='rgba(0,0,0,0.6)'; ctx.fillRect(0,0,VW,VH); ctx.fillStyle='#e33'; ctx.font='20px monospace'; ctx.textAlign='center'; ctx.fillText('YOU DIED',VW/2,VH/2); ctx.textAlign='left'; }
  if(G.scene==='ending'){
    ctx.fillStyle='rgba(0,0,0,'+clamp((G.endT||0),0,0.85)+')'; ctx.fillRect(0,0,VW,VH);
    if((G.endT||0)>0.8){ ctx.fillStyle='#ffe9a3'; ctx.font='16px monospace'; ctx.textAlign='center'; ctx.fillText('첫 번째 종이 울렸다',VW/2,110); ctx.fillStyle='#cfd2e0'; ctx.font='11px monospace'; ctx.fillText('(계속…)',VW/2,132);
      ctx.fillText('TIME '+Math.floor(G.playTime)+'s · DEATH '+G.deaths,VW/2,156);
      if(G.best) ctx.fillText('BEST '+G.best.time+'s',VW/2,172);
      ctx.fillStyle=Math.floor(G.time*2)%2?'#fff':'#666'; ctx.fillText('ENTER — 타이틀로',VW/2,200); ctx.textAlign='left'; }
  }
  if(G.paused){ ctx.fillStyle='rgba(0,0,0,0.6)'; ctx.fillRect(0,0,VW,VH); ctx.fillStyle='#fff'; ctx.font='16px monospace'; ctx.textAlign='center'; ctx.fillText('PAUSED (Esc)',VW/2,VH/2); ctx.textAlign='left'; }
  if(DEBUG){ ctx.fillStyle='#0f0'; ctx.font='9px monospace'; ctx.fillText('x:'+Math.floor(player.x)+' y:'+Math.floor(player.y)+' '+player.state+' dash:'+player.hasDash+' wall:'+player.hasWall,10,58); }
  ctx.restore();
}
function wrapText(text,x,y,maxW,lh){
  var words=text.split(' '),line='',yy=y;
  // 한글은 공백이 적으므로 글자 단위 폴백
  if(words.length<3){ var chars=text.split(''),cl='';
    for(var i=0;i<chars.length;i++){ if(ctx.measureText(cl+chars[i]).width>maxW){ ctx.fillText(cl,x,yy); yy+=lh; cl=chars[i]; } else cl+=chars[i]; }
    ctx.fillText(cl,x,yy); return;
  }
  for(var k=0;k<words.length;k++){ var t=line+words[k]+' ';
    if(ctx.measureText(t).width>maxW){ ctx.fillText(line,x,yy); yy+=lh; line=words[k]+' '; } else line=t; }
  ctx.fillText(line,x,yy);
}

// ---------- main loop (고정스텝) ----------
var last=0,acc=0,STEP=1/60,fpsN=0,fpsT=0;
function frame(ts){
  requestAnimationFrame(frame);
  var now=ts/1000; if(!last)last=now;
  var dt=Math.min(0.1,now-last); last=now; acc+=dt;
  fpsN++; fpsT+=dt; if(fpsT>=0.5){ if(fpsEl)fpsEl.textContent=Math.round(fpsN/fpsT)+'fps · '+G.zone; fpsN=0; fpsT=0; }
  var n=0;
  while(acc>=STEP&&n<5){ update(STEP); acc-=STEP; n++; }
  if(n===5)acc=0;
  render();
}
// boot
buildLevel();
resetPlayer(5*TILE,28*TILE-30);
spawnFoes();
G.cam.x=0; G.cam.y=LV.h*TILE-VH;
requestAnimationFrame(frame);
})();
