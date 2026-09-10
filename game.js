const c=document.querySelector("#c"),ctx=c.getContext("2d"),lobby=document.querySelector("#lobby"),hud=document.querySelector("#hud"),nameI=document.querySelector("#name"),roomI=document.querySelector("#room"),inside=document.querySelector("#inside"),ridE=document.querySelector("#rid"),plist=document.querySelector("#plist"),err=document.querySelector("#err"),msg=document.querySelector("#msg");
const ws=new WebSocket((location.protocol==="https:"?"wss://":"ws://")+location.host);let me="",room="",map=[],players=[],keys={},last=0,started=false;
ws.onmessage=e=>{let m=JSON.parse(e.data);if(m.type==="joined"){me=m.id;room=m.room;map=m.map;ridE.textContent=room;document.querySelector("#roomhud").textContent=room;inside.classList.remove("hide");}
if(m.type==="state"){players=m.players;plist.innerHTML=players.map(p=>`<div class=p>${p.name} ${p.alive?"🟢":"💀"}　${p.score}K</div>`).join("");let p=players.find(x=>x.id===me);if(p){document.querySelector("#hp").textContent=p.hp;document.querySelector("#bar").style.width=p.hp+"%";document.querySelector("#score").textContent=`${p.name}　🏆 ${p.score}`}}
if(m.type==="start"){started=true;lobby.classList.add("hide");hud.classList.remove("hide");msg.textContent=""}
if(m.type==="win"){started=false;msg.innerHTML=`🏆 ${m.winner} の勝利！<br><small>ロビーに戻って再戦できます</small>`}
if(m.type==="error")err.textContent=m.msg;if(m.type==="down")msg.textContent="💀 撃破された！";if(m.type==="pickup")msg.textContent="❤️ HP回復！";setTimeout(()=>{if(msg.textContent.includes("撃破")||msg.textContent.includes("回復"))msg.textContent=""},900)};
join.onclick=()=>ws.send(JSON.stringify({type:"join",name:nameI.value||"Player",room:roomI.value||"1234"}));
start.onclick=()=>ws.send(JSON.stringify({type:"start"}));
addEventListener("keydown",e=>{keys[e.key.toLowerCase()]=1;if(e.code==="Space"&&started){ws.send(JSON.stringify({type:"shoot"}));e.preventDefault()}});
addEventListener("keyup",e=>keys[e.key.toLowerCase()]=0);
function wall(x,y){let X=Math.floor(x),Y=Math.floor(y);return !map[Y]||map[Y][X]==="1"}
function resize(){c.width=innerWidth;c.height=innerHeight}addEventListener("resize",resize);resize();
function loop(t){let p=players.find(x=>x.id===me);if(p&&started&&p.alive&&t-last>25){let dx=(keys.d||keys.arrowright?1:0)-(keys.a||keys.arrowleft?1:0),dy=(keys.s||keys.arrowdown?1:0)-(keys.w||keys.arrowup?1:0);if(dx||dy){let sp=.09, nx=p.x+dx*sp,ny=p.y+dy*sp;if(!wall(nx,p.y))p.x=nx;if(!wall(p.x,ny))p.y=ny;ws.send(JSON.stringify({type:"move",x:p.x,y:p.y,a:p.a}))}last=t}draw(p);requestAnimationFrame(loop)}
function draw(meP){ctx.fillStyle="#87a6b6";ctx.fillRect(0,0,c.width,c.height/2);ctx.fillStyle="#26352e";ctx.fillRect(0,c.height/2,c.width,c.height/2);if(!meP){return}
const FOV=Math.PI/3,rays=Math.floor(c.width/3),step=FOV/rays;for(let i=0;i<rays;i++){let a=meP.a-FOV/2+i*step,dx=Math.cos(a),dy=Math.sin(a),d=0;while(d<20&&!wall(meP.x+dx*d,meP.y+dy*d))d+=.04;let cd=d*Math.cos(a-meP.a),h=Math.min(c.height, c.height/(cd||.1));ctx.fillStyle=`hsl(${190-Math.min(150,cd*7)},35%,${Math.max(12,55-cd*2)}%)`;ctx.fillRect(i*3,c.height/2-h/2,4,h)}
for(const p of players)if(p.id!==meP.id&&p.alive){let dx=p.x-meP.x,dy=p.y-meP.y,d=Math.hypot(dx,dy),ang=Math.atan2(dy,dx)-meP.a;ang=Math.atan2(Math.sin(ang),Math.cos(ang));if(Math.abs(ang)<FOV/2&&d<15){let sx=c.width/2+Math.tan(ang)/(Math.tan(FOV/2))*c.width/2,sz=Math.min(220,c.height/d*.55);ctx.fillStyle=p.color;ctx.fillRect(sx-sz/4,c.height/2-sz/2,sz/2,sz);ctx.fillStyle="#fff";ctx.font="bold 14px system-ui";ctx.textAlign="center";ctx.fillText(p.name,sx,c.height/2-sz/2-8)}}
}
requestAnimationFrame(loop);
