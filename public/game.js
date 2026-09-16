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
