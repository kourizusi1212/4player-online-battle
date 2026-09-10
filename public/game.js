const c=document.querySelector("#c"),ctx=c.getContext("2d",{alpha:false}),
lobby=document.querySelector("#lobby"),hud=document.querySelector("#hud"),
nameI=document.querySelector("#name"),roomI=document.querySelector("#room"),
inside=document.querySelector("#inside"),ridE=document.querySelector("#rid"),
plist=document.querySelector("#plist"),err=document.querySelector("#err"),
msg=document.querySelector("#msg");

let ws,me="",room="",map=[],players=[],keys={},started=false;
let localX=2.5,localY=2.5,localA=0,lastSend=0,lastFrame=0;
const MOVE_SPEED=3.8, FOV=Math.PI/3, INTERNAL_W=480;
let viewW=480,viewH=270,scaleX=1,scaleY=1;

function connect(){
  ws=new WebSocket((location.protocol==="https:"?"wss://":"ws://")+location.host);
  ws.onopen=()=>err.textContent="";
  ws.onclose=()=>{if(started)msg.textContent="通信が切断されました"};
  ws.onmessage=e=>{
    const m=JSON.parse(e.data);
    if(m.type==="joined"){
      me=m.id;room=m.room;map=m.map;ridE.textContent=room;
      document.querySelector("#roomhud").textContent=room;
      inside.classList.remove("hide");
    }
    if(m.type==="state"){
      players=m.players;
      plist.innerHTML=players.map(p=>`<div class="p">${escapeHtml(p.name)} ${p.alive?"🟢":"💀"}　${p.score}K ${p.ready?"✓":""}</div>`).join("");
      const p=players.find(x=>x.id===me);
      if(p){
        if(!started){localX=p.x;localY=p.y;localA=p.a}
        else{
          // サーバーの値へ急激にワープさせず、少しだけ補正
          localX+=(p.x-localX)*0.18;
          localY+=(p.y-localY)*0.18;
          localA=p.a;
        }
        document.querySelector("#hp").textContent=p.hp;
        document.querySelector("#bar").style.width=p.hp+"%";
        document.querySelector("#score").textContent=`${p.name}　🏆 ${p.score}`;
      }
    }
    if(m.type==="start"){
      started=true;lobby.classList.add("hide");hud.classList.remove("hide");msg.textContent="";
      const p=players.find(x=>x.id===me);if(p){localX=p.x;localY=p.y;localA=p.a}
    }
    if(m.type==="win"){
      started=false;
      msg.innerHTML=`🏆 ${escapeHtml(m.winner||"引き分け")} の勝利！<br><small>再戦するにはページを再読み込み</small>`;
    }
    if(m.type==="error")err.textContent=m.msg;
    if(m.type==="down")showTemp("💀 撃破された！");
    if(m.type==="pickup")showTemp("❤️ HP回復！");
  };
}
connect();

function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function showTemp(t){msg.textContent=t;setTimeout(()=>{if(msg.textContent===t)msg.textContent=""},800)}

create.onclick=()=>{
  const r=String(Math.floor(1000+Math.random()*9000));
  ws.send(JSON.stringify({type:"create",name:nameI.value||"Player",room:r}));
};
showjoin.onclick=()=>document.querySelector("#joinbox").classList.remove("hide");
join.onclick=()=>ws.send(JSON.stringify({type:"join",name:nameI.value||"Player",room:roomI.value||"1234"}));
copy.onclick=async()=>{
  try{await navigator.clipboard.writeText(room);copymsg.textContent="コピーしました！"}catch{copymsg.textContent="コピーできませんでした"}
};
ready.onclick=()=>ws.send(JSON.stringify({type:"ready"}));
start.onclick=()=>ws.send(JSON.stringify({type:"start"}));

addEventListener("keydown",e=>{
  keys[e.key.toLowerCase()]=true;
  if(e.code==="Space"&&started){
    ws.send(JSON.stringify({type:"shoot"}));e.preventDefault();
  }
  if(["arrowup","arrowdown","arrowleft","arrowright"].includes(e.key.toLowerCase()))e.preventDefault();
});
addEventListener("keyup",e=>keys[e.key.toLowerCase()]=false);

function wall(x,y){
  const X=Math.floor(x),Y=Math.floor(y);
  return !map[Y]||map[Y][X]==="1";
}
function blocked(x,y,r=.20){
  return [
    [x-r,y-r],[x+r,y-r],
    [x-r,y+r],[x+r,y+r],[x,y]
  ].some(([px,py])=>wall(px,py));
}

function resize(){
  viewW=innerWidth;viewH=innerHeight;
  const ar=16/9;
  if(viewW/viewH>ar){viewH=Math.floor(viewW/ar)}else{viewW=Math.floor(viewH*ar)}
  viewW=Math.max(320,Math.min(960,viewW));
  viewH=Math.floor(viewW*9/16);
  c.width=viewW;c.height=viewH;
  c.style.width="100vw";c.style.height="100vh";
}
addEventListener("resize",resize);resize();

function update(dt){
  if(!started)return;
  // W=前進 / S=後退 / A=左 / D=右
  // WASD = 移動 / 矢印キー = 視点
  const now=performance.now();
  const dt=Math.min(0.033, Math.max(0, (now-lastFrameTime)/1000));

  const turnSpeed=2.4;
  if(keys.arrowleft) localA-=turnSpeed*dt;
  if(keys.arrowright) localA+=turnSpeed*dt;

  if(keys.arrowup) pitch=Math.max(-0.45,pitch-1.6*dt);
  if(keys.arrowdown) pitch=Math.min(0.45,pitch+1.6*dt);

  let f=(keys.w?1:0)-(keys.s?1:0);
  let s=(keys.d?1:0)-(keys.a?1:0);

  if(f||s){
    const len=Math.hypot(f,s)||1;
    f/=len; s/=len;
    const speed=3.0;
    const dx=(Math.sin(localA)*f+Math.cos(localA)*s)*speed*dt;
    const dy=(-Math.cos(localA)*f+Math.sin(localA)*s)*speed*dt;
    if(!blocked(localX+dx,localY,.20)) localX+=dx;
    if(!blocked(localX,localY+dy,.20)) localY+=dy;
  }

  if(now-lastMoveSend>66){
    ws.send(JSON.stringify({t:"move",x:localX,y:localY,a:localA}));
    lastMoveSend=now;
  }

  if(performance.now()-lastSend>60){
    ws.send(JSON.stringify({type:"move",x:localX,y:localY,a:localA}));
    lastSend=performance.now();
  }
}

// 高速なDDAレイキャスト。1フレームあたりの計算量を大幅削減
function castRay(px,py,angle){
  const dx=Math.cos(angle),dy=Math.sin(angle);
  let mx=Math.floor(px),my=Math.floor(py);
  const ddx=Math.abs(1/(Math.abs(dx)<1e-9?1e-9:dx));
  const ddy=Math.abs(1/(Math.abs(dy)<1e-9?1e-9:dy));
  let sx,sy,sdx,sdy;
  if(dx<0){sx=-1;sdx=(px-mx)*ddx}else{sx=1;sdx=(mx+1-px)*ddx}
  if(dy<0){sy=-1;sdy=(py-my)*ddy}else{sy=1;sdy=(my+1-py)*ddy}
  for(let i=0;i<80;i++){
    let dist;
    if(sdx<sdy){dist=sdx;sdx+=ddx;mx+=sx}
    else{dist=sdy;sdy+=ddy;my+=sy}
    if(!map[my]||map[my][mx]==="1") return Math.max(.05,dist);
  }
  return 20;
}

function draw(meP){
  ctx.fillStyle="#7894a4";ctx.fillRect(0,0,c.width,c.height/2);
  ctx.fillStyle="#26352e";ctx.fillRect(0,c.height/2,c.width,c.height/2);
  if(!meP)return;

  const rays=240,strip=c.width/rays;
  for(let i=0;i<rays;i++){
    const a=localA-FOV/2+(i+.5)*FOV/rays;
    const d=castRay(localX,localY,a);
    const cd=d*Math.cos(a-localA);
    const h=Math.min(c.height*1.5,c.height/(cd||.1));
    const light=Math.max(15,55-cd*2.2);
    ctx.fillStyle=`hsl(${190-Math.min(150,cd*7)},35%,${light}%)`;
    ctx.fillRect(i*strip,c.height/2-h/2,strip+1,h);
  }

  for(const p of players)if(p.id!==meP.id&&p.alive){
    const dx=p.x-localX,dy=p.y-localY,d=Math.hypot(dx,dy);
    let ang=Math.atan2(dy,dx)-localA;
    ang=Math.atan2(Math.sin(ang),Math.cos(ang));
    if(Math.abs(ang)<FOV/2&&d<15){
      // 壁越し表示を防ぐ
      const wallD=castRay(localX,localY,Math.atan2(dy,dx));
      if(wallD<d-.15)continue;
      const sx=c.width/2+Math.tan(ang)/(Math.tan(FOV/2))*c.width/2;
      const sz=Math.min(220,c.height/d*.55);
      ctx.fillStyle=p.color;ctx.fillRect(sx-sz/4,c.height/2-sz/2,sz/2,sz);
      ctx.fillStyle="#fff";ctx.font="bold 14px system-ui";ctx.textAlign="center";
      ctx.fillText(p.name,sx,c.height/2-sz/2-8);
    }
  }
}

function loop(t){
  const dt=Math.min(.05,(t-lastFrame||16.7)/1000);lastFrame=t;
  update(dt);
  const meP=players.find(x=>x.id===me);
  draw(meP);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
