const $=s=>document.querySelector(s);
const canvas=$("#game"),ctx=canvas.getContext("2d",{alpha:false});
const lobby=$("#lobby"),hud=$("#hud"),err=$("#err"),nameInput=$("#name"),mapInput=$("#map");
const createBtn=$("#create"),showJoinBtn=$("#showjoin"),joinBox=$("#joinbox"),joinBtn=$("#join");
const roomInput=$("#roomInput"),inside=$("#inside"),rid=$("#rid"),copyBtn=$("#copy"),copymsg=$("#copymsg");
const plist=$("#plist"),readyBtn=$("#ready"),startBtn=$("#start"),msg=$("#msg");
const timer=$("#timer"),scoreHud=$("#scoreHud"),hp=$("#hp"),bar=$("#bar");
const ammo=$("#ammo"),mag=$("#mag"),weaponName=$("#weaponName"),killfeed=$("#killfeed");

let ws=null,myId="",room="",map=[],players=[],items=[];
let started=false,localX=2.5,localY=2.5,localA=0,viewPitch=0,aiming=false,syncedAfterStart=false;
let lastNetwork=0,lastFrame=0,sendAt=0;
const keys=new Set(),effects=[],feed=[];
const FOV=Math.PI/3, AIM_FOV=Math.PI/4.2, MOVE_SPEED=4.8, TURN_SPEED=2.25, PITCH_SPEED=1.7;
const WEAPONS={pistol:"ハンドガン",shotgun:"ショットガン",sniper:"スナイパー"};

function resize(){
 const dpr=Math.min(window.devicePixelRatio||1,1.75);
 canvas.width=Math.max(640,Math.floor(innerWidth*dpr));
 canvas.height=Math.max(360,Math.floor(innerHeight*dpr));
}
addEventListener("resize",resize);resize();

function connect(){
 const proto=location.protocol==="https:"?"wss":"ws";
 ws=new WebSocket(`${proto}://${location.host}`);
 ws.onopen=()=>err.textContent="";
 ws.onerror=()=>err.textContent="サーバーに接続できません。";
 ws.onclose=()=>{if(started){started=false;msg.textContent="通信が切断されました";}};
 ws.onmessage=e=>handle(JSON.parse(e.data));
}
function send(o){
 if(ws?.readyState===WebSocket.OPEN){ws.send(JSON.stringify(o));return true}
 err.textContent="サーバーに接続中です。";return false;
}
function esc(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function handle(m){
 if(m.type==="joined"){
  myId=m.id;room=m.room;map=m.map||[];rid.textContent=room;$("#roomHud").textContent=room;
  inside.classList.remove("hide");err.textContent="";
  startBtn.style.display=m.host?"block":"none";
  plist.innerHTML="";
 }
 if(m.type==="state"){
  players=m.players||[];
  const me=players.find(p=>p.id===myId);
  if(me){
   if(!started || !syncedAfterStart){localX=me.x;localY=me.y;localA=me.a;syncedAfterStart=true;}
   hp.textContent=me.hp;bar.style.width=Math.max(0,me.hp)+"%";
   ammo.textContent=me.ammo;mag.textContent=me.mag;
   weaponName.textContent=me.reloading?"🔄 リロード中…":(WEAPONS[me.weapon]||me.weapon);
   scoreHud.textContent=`${esc(me.name)}　🏆 ${me.score}　☠ ${me.kills}/${me.deaths}`;
  }
  plist.innerHTML=players.map(p=>`<div class="p">${esc(p.name)} ${p.alive?"🟢":"💀"}　${p.score}K ${p.ready?"✓ READY":""}</div>`).join("");
  const sec=Math.max(0,Math.ceil((m.timeLeft||0)/1000));
  timer.textContent=`${String(Math.floor(sec/60)).padStart(2,"0")}:${String(sec%60).padStart(2,"0")}`;
 }
 if(m.type==="start"){
  started=true;syncedAfterStart=false;items=m.items||[];lobby.classList.add("hide");hud.classList.remove("hide");msg.textContent="";
  const me=players.find(p=>p.id===myId);if(me){localX=me.x;localY=me.y;localA=me.a}
 }
 if(m.type==="shot"){
  const p=players.find(x=>x.id===m.from);
  effects.push({kind:"muzzle",x:p?.x??localX,y:p?.y??localY,t:performance.now()});
  if(m.hit)effects.push({kind:"hit",t:performance.now()});
 }
 if(m.type==="down"){
  addFeed(`${m.attacker} → ${m.target}`);
  if(m.attacker===players.find(p=>p.id===myId)?.name)temp("🎯 撃破！");
  effects.push({kind:"boom",x:m.x,y:m.y,t:performance.now()});
 }
 if(m.type==="pickup"){
  temp(m.item==="heal"?"❤️ HP回復":m.item==="ammo"?"📦 弾薬補給":"⚡ スピードUP");
 }
 if(m.type==="win"){
  started=false;const rows=(m.ranking||[]).map((p,i)=>`<div class="rank"><span>${i+1}位　${esc(p.name)}</span><b>${p.score} K</b></div>`).join("");
  msg.innerHTML=`🏆 ${esc(m.winner||"引き分け")} の勝利！<div class="result">${rows}</div><small>ページを再読み込みするとロビーへ戻れます。</small>`;
 }
 if(m.type==="error")err.textContent=m.msg||"エラー";
}
createBtn.onclick=()=>{
 const r=String(Math.floor(1000+Math.random()*9000));
 send({type:"create",room:r,name:nameInput.value||"Player",mapKey:mapInput.value});
};
showJoinBtn.onclick=()=>joinBox.classList.toggle("hide");
joinBtn.onclick=()=>send({type:"join",room:roomInput.value.trim(),name:nameInput.value||"Player"});
copyBtn.onclick=async()=>{
 try{await navigator.clipboard.writeText(room);copymsg.textContent="コピーしました！";}
 catch{copymsg.textContent="コピーできませんでした。";}
};
readyBtn.onclick=()=>send({type:"ready"});
startBtn.onclick=()=>send({type:"start"});

addEventListener("keydown",e=>{
 const k=e.key.toLowerCase(); keys.add(k);
 if(["arrowup","arrowdown","arrowleft","arrowright"," "].includes(k))e.preventDefault();
 if(!started)return;
 if(k==="r")send({type:"reload"});
 if(["1","2","3"].includes(k))send({type:"weapon",weapon:{1:"pistol",2:"shotgun",3:"sniper"}[k]});
});
addEventListener("keyup",e=>keys.delete(e.key.toLowerCase()));
canvas.addEventListener("contextmenu",e=>e.preventDefault());
canvas.addEventListener("mousedown",e=>{
 if(!started)return;
 if(e.button===2){ aiming=true; canvas.requestPointerLock?.(); document.querySelector("#crosshair").classList.add("aim"); e.preventDefault(); }
 else if(e.button===0){ if(document.pointerLockElement!==canvas)canvas.requestPointerLock?.(); send({type:"shoot"}); }
});
addEventListener("mouseup",e=>{if(e.button===2){aiming=false;document.querySelector("#crosshair").classList.remove("aim");}});
canvas.addEventListener("mousemove",e=>{
 if(!started || document.pointerLockElement!==canvas)return;
 const sensitivity=0.0024*(aiming?0.62:1);
 localA=norm(localA+e.movementX*sensitivity);
 viewPitch=Math.max(-0.32,Math.min(0.32,viewPitch+e.movementY*sensitivity*0.72));
});
document.addEventListener("pointerlockchange",()=>{if(!started)return;if(document.pointerLockElement!==canvas){aiming=false;document.querySelector("#crosshair").classList.remove("aim");}});

function wall(x,y){const X=Math.floor(x),Y=Math.floor(y);return !map[Y]||map[Y][X]==="1";}
function blocked(x,y,r=.22){return [[x-r,y-r],[x+r,y-r],[x-r,y+r],[x+r,y+r],[x,y-r],[x,y+r],[x-r,y],[x+r,y]].some(([px,py])=>wall(px,py));}
function norm(a){while(a>Math.PI)a-=Math.PI*2;while(a<-Math.PI)a+=Math.PI*2;return a;}
function update(dt){
 if(!started)return;
 if(keys.has("arrowleft"))localA-=TURN_SPEED*dt;if(keys.has("arrowright"))localA+=TURN_SPEED*dt;
 if(keys.has("arrowup"))viewPitch=Math.max(-.32,viewPitch-PITCH_SPEED*dt);if(keys.has("arrowdown"))viewPitch=Math.min(.32,viewPitch+PITCH_SPEED*dt);localA=norm(localA);
 let f=(keys.has("w")?1:0)-(keys.has("s")?1:0),str=(keys.has("d")?1:0)-(keys.has("a")?1:0);
 if(f||str){const len=Math.hypot(f,str);f/=len;str/=len;let speed=MOVE_SPEED;const me=players.find(p=>p.id===myId);if(me&&me.speedUntil>Date.now())speed*=1.65;const dist=speed*dt;const dx=(Math.cos(localA)*f-Math.sin(localA)*str)*dist,dy=(Math.sin(localA)*f+Math.cos(localA)*str)*dist;if(!blocked(localX+dx,localY))localX+=dx;if(!blocked(localX,localY+dy))localY+=dy;}
 const now=performance.now();if(now-sendAt>40){send({type:"move",x:localX,y:localY,a:localA});sendAt=now;}
}
function castRay(px,py,a){const dx=Math.cos(a),dy=Math.sin(a);let mx=Math.floor(px),my=Math.floor(py);const ddx=Math.abs(1/(Math.abs(dx)<1e-9?1e-9:dx)),ddy=Math.abs(1/(Math.abs(dy)<1e-9?1e-9:dy));let sx,sy,sdx,sdy;if(dx<0){sx=-1;sdx=(px-mx)*ddx}else{sx=1;sdx=(mx+1-px)*ddx}if(dy<0){sy=-1;sdy=(py-my)*ddy}else{sy=1;sdy=(my+1-py)*ddy}for(let i=0;i<160;i++){let d;if(sdx<sdy){d=sdx;sdx+=ddx;mx+=sx}else{d=sdy;sdy+=ddy;my+=sy}if(!map[my]||map[my][mx]==="1")return Math.max(.03,d)}return 30;}
function project(x,y){const dx=x-localX,dy=y-localY,d=Math.hypot(dx,dy),fov=aiming?AIM_FOV:FOV,a=norm(Math.atan2(dy,dx)-localA);if(Math.abs(a)>fov/2||d>28)return null;return {d,a,sx:canvas.width/2+Math.tan(a)/Math.tan(fov/2)*(canvas.width/2),horizon:canvas.height/2+viewPitch*canvas.height};}
function draw(){const w=canvas.width,h=canvas.height;ctx.fillStyle="#7fa3bd";ctx.fillRect(0,0,w,h/2);ctx.fillStyle="#293b32";ctx.fillRect(0,h/2,w,h/2);if(!started)return;const fov=aiming?AIM_FOV:FOV,rays=Math.min(1100,Math.max(560,Math.floor(w/1.7))),strip=w/rays,horizon=h/2+viewPitch*h;for(let i=0;i<rays;i++){const a=localA-fov/2+(i+.5)*fov/rays,raw=castRay(localX,localY,a),d=raw*Math.cos(a-localA),wh=Math.min(h*1.9,h/Math.max(.05,d)),light=Math.max(18,78-d*2.1);ctx.fillStyle=`hsl(195,32%,${light}%)`;ctx.fillRect(i*strip,horizon-wh/2,strip+1,wh)}
 for(const it of items){if(!it.active)continue;const q=project(it.x,it.y);if(!q)continue;const ang=Math.atan2(it.y-localY,it.x-localX);if(castRay(localX,localY,ang)<q.d-.12)continue;const size=Math.max(10,Math.min(70,h/(q.d*7)));ctx.font=`${size}px system-ui`;ctx.textAlign="center";ctx.fillText(it.type==="heal"?"❤️":it.type==="ammo"?"📦":"⚡",q.sx,q.horizon+size/2)}
 for(const p of players){if(p.id===myId||!p.alive)continue;const q=project(p.x,p.y);if(!q)continue;if(castRay(localX,localY,Math.atan2(p.y-localY,p.x-localX))<q.d-.18)continue;const size=Math.min(h,h/(q.d*.72)),x=q.sx,y=q.horizon;ctx.fillStyle=p.color;ctx.fillRect(x-size*.20,y-size*.32,size*.40,size*.55);ctx.beginPath();ctx.arc(x,y-size*.43,size*.13,0,Math.PI*2);ctx.fill();ctx.fillRect(x+size*.13,y-size*.20,size*.28,size*.06);ctx.fillStyle="#fff";ctx.textAlign="center";ctx.font="bold 14px system-ui";ctx.fillText(`${p.name} ${p.hp}`,x,y-size*.58)}
 const now=performance.now();for(let i=effects.length-1;i>=0;i--){const e=effects[i],age=now-e.t;if(age>550){effects.splice(i,1);continue}if(e.kind==="muzzle"){ctx.fillStyle="#ffd34d";ctx.beginPath();ctx.arc(w/2,h/2,9+Math.random()*12,0,Math.PI*2);ctx.fill()}else if(e.kind==="hit"){ctx.fillStyle="#fff";ctx.font="bold 34px system-ui";ctx.textAlign="center";ctx.fillText("✦",w/2,h/2-30)}else if(e.kind==="boom"){ctx.strokeStyle="#ffd34d";ctx.lineWidth=5;ctx.beginPath();ctx.arc(w/2,h/2,30+age*.22,0,Math.PI*2);ctx.stroke()}}}
function addFeed(t){
 feed.unshift(t);if(feed.length>5)feed.pop();
 killfeed.innerHTML=feed.map(esc).join("<br>");
}
function temp(t){
 msg.textContent=t;setTimeout(()=>{if(msg.textContent===t)msg.textContent=""},800);
}
function loop(t){
 const dt=Math.min(.04,(t-lastFrame||16.67)/1000);lastFrame=t;
 update(dt);draw();requestAnimationFrame(loop);
}
connect();
requestAnimationFrame(loop);
