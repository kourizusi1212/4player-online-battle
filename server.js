const WebSocket=require("ws"),http=require("http"),fs=require("fs"),path=require("path");
const PORT=process.env.PORT||10000;
const rooms=new Map();
const colors=["#ff5964","#4d9fff","#ffd447","#58dc8a"];
const MAPS={
  maze:{name:"迷路",map:["11111111111111111111","10000000000000000001","10001110001110000001","10000010000010000001","10111011111011111001","10000000000000000001","10111101111101111101","10000000000000000001","10001111100011111001","10000000000000000001","11111111111111111111"]},
  arena:{name:"アリーナ",map:["11111111111111111111","10000000000000000001","10000111111111000001","10000010000001000001","10111010000001011101","10000010000001000001","10111011111111011101","10000000000000000001","10001111101111111001","10000000000000000001","11111111111111111111"]},
  ruins:{name:"廃墟",map:["11111111111111111111","10000010000000000001","10111010111101111101","10001010000101000001","11101011110101011101","10000000000000001001","10111101111101011001","10000001000001000001","10111111011111111001","10000000000000000001","11111111111111111111"]}
};
const spawns=[[2,2],[17,2],[2,8],[17,8]];
const weapons={
  pistol:{name:"ハンドガン",damage:34,range:9,cooldown:280,mag:12,reload:900,spread:.025,pellets:1},
  shotgun:{name:"ショットガン",damage:18,range:6,cooldown:750,mag:6,reload:1100,spread:.11,pellets:6},
  sniper:{name:"スナイパー",damage:100,range:20,cooldown:1200,mag:4,reload:1400,spread:.004,pellets:1}
};
function getMap(r){return MAPS[r.mapKey].map}
function wall(map,x,y){const X=Math.floor(x),Y=Math.floor(y);return !map[Y]||map[Y][X]==="1"}
function blocked(map,x,y,r=.20){return [[x-r,y-r],[x+r,y-r],[x-r,y+r],[x+r,y+r],[x,y]].some(([px,py])=>wall(map,px,py))}
const srv=http.createServer((req,res)=>{let u=req.url==="/"?"index.html":req.url.slice(1);u=u.split("?")[0];const f=path.join(__dirname,"public",u);fs.readFile(f,(e,d)=>{if(e){res.writeHead(404);return res.end("404 Not Found")}const ext=path.extname(f);const ct=ext===".html"?"text/html; charset=utf-8":ext===".js"?"text/javascript; charset=utf-8":"text/plain; charset=utf-8";res.writeHead(200,{"Content-Type":ct,"Cache-Control":"no-cache"});res.end(d)})});
const wss=new WebSocket.Server({server:srv});
function send(ws,o){if(ws.readyState===1)ws.send(JSON.stringify(o))}
function broadcast(r,o){for(const p of r.players.values())send(p.ws,o)}
function snapshot(r){return {type:"state",timeLeft:Math.max(0,r.endAt-Date.now()),mapKey:r.mapKey,players:[...r.players.values()].map(p=>({id:p.id,name:p.name,x:p.x,y:p.y,a:p.a,hp:p.hp,score:p.score,alive:p.alive,color:p.color,ready:r.ready.has(p.id),weapon:p.weapon,ammo:p.ammo,mag:weapons[p.weapon].mag,reloading:p.reloading,kills:p.kills,deaths:p.deaths}))}}
function getRoom(id,mapKey="maze"){if(!rooms.has(id))rooms.set(id,{players:new Map(),ready:new Set(),started:false,mapKey:MAPS[mapKey]?mapKey:"maze",lastBroadcast:0,endAt:0,host:null,items:[]});return rooms.get(id)}
function broadcastState(r,force=false){const now=Date.now();if(!force&&now-r.lastBroadcast<50)return;r.lastBroadcast=now;broadcast(r,snapshot(r))}
function makeItems(r){const m=getMap(r),items=[];for(let y=1;y<m.length-1;y++)for(let x=1;x<m[y].length-1;x++)if(m[y][x]==="0"&&((x*17+y*31)%29===0))items.push({id:Math.random().toString(36).slice(2,8),x:x+.5,y:y+.5,type:((x+y)%3===0?"ammo":((x+y)%3===1?"heal":"speed")),active:true});r.items=items}
function resetPlayer(p,i){const s=spawns[i%spawns.length];p.x=s[0]+.5;p.y=s[1]+.5;p.a=0;p.hp=100;p.alive=true;p.ammo=weapons[p.weapon].mag;p.reloading=false;p.reloadUntil=0;p.lastShot=0;p.speedBoostUntil=0}
function startRoom(r){r.started=true;r.endAt=Date.now()+5*60*1000;r.ready.clear();makeItems(r);let i=0;for(const p of r.players.values()){p.score=0;p.kills=0;p.deaths=0;p.weapon="pistol";resetPlayer(p,i++)}broadcast(r,{type:"start",mapKey:r.mapKey,items:r.items});broadcastState(r,true)}
function finishRoom(r){if(!r.started)return;r.started=false;const sorted=[...r.players.values()].sort((a,b)=>b.score-a.score);broadcast(r,{type:"win",winner:sorted[0]?.name||"",ranking:sorted.map(p=>({name:p.name,score:p.score,kills:p.kills,deaths:p.deaths}))});broadcastState(r,true)}
function hasLine(r,a,b){const map=getMap(r),dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy),steps=Math.ceil(d/.12);for(let i=1;i<steps;i++){const x=a.x+dx*i/steps,y=a.y+dy*i/steps;if(wall(map,x,y))return false}return true}
function tryReload(p){if(p.reloading||p.ammo>=weapons[p.weapon].mag)return; p.reloading=true;p.reloadUntil=Date.now()+weapons[p.weapon].reload;}
function tickReload(p){if(p.reloading&&Date.now()>=p.reloadUntil){p.reloading=false;p.ammo=weapons[p.weapon].mag}}
function shoot(r,p){const w=weapons[p.weapon],now=Date.now();tickReload(p);if(p.reloading||now-p.lastShot<w.cooldown)return;if(p.ammo<=0){tryReload(p);return}p.lastShot=now;p.ammo--;const targets=[...r.players.values()].filter(t=>t!==p&&t.alive);let hit=null,hitDist=999;for(let k=0;k<w.pellets;k++){let best=null,bd=999;const base=p.a+(Math.random()-.5)*w.spread;for(const t of targets){const dx=t.x-p.x,dy=t.y-p.y,d=Math.hypot(dx,dy);if(d>w.range||d>=bd||!hasLine(r,p,t))continue;const da=Math.abs(Math.atan2(Math.sin(Math.atan2(dy,dx)-base),Math.cos(Math.atan2(dy,dx)-base)));const radius=.32+(w.pellets>1?.18:0);if(da<radius/d){best=t;bd=d}}if(best){best.hp-=w.damage;if(!hit||bd<hitDist){hit=best;hitDist=bd}}}
  if(hit&&hit.hp<=0){hit.hp=0;hit.alive=false;hit.deaths++;p.score++;p.kills++;broadcast(r,{type:"down",attacker:p.name,target:hit.name,x:hit.x,y:hit.y,weapon:p.weapon});setTimeout(()=>{if(r.players.has(hit.id)&&r.started){const idx=[...r.players.keys()].indexOf(hit.id);resetPlayer(hit,idx);broadcastState(r,true)}},1800)}
  broadcast(r,{type:"shot",from:p.id,weapon:p.weapon,x:p.x,y:p.y,hit:hit?hit.id:null});if(p.ammo===0)tryReload(p);broadcastState(r,true);if(r.players.size>1&&[...r.players.values()].filter(x=>x.alive).length<=1)finishRoom(r)
}
setInterval(()=>{for(const r of rooms.values()){if(!r.started)continue;for(const p of r.players.values()){tickReload(p);for(const it of r.items){if(!it.active)continue;if(Math.hypot(it.x-p.x,it.y-p.y)<.55){it.active=false;if(it.type==="heal")p.hp=Math.min(100,p.hp+35);if(it.type==="ammo")p.ammo=weapons[p.weapon].mag;if(it.type==="speed")p.speedBoostUntil=Date.now()+8000;send(p.ws,{type:"pickup",item:it.type})}}}if(Date.now()>=r.endAt)finishRoom(r);broadcastState(r)}},100);

wss.on("connection",ws=>{let r=null,p=null;ws.on("message",raw=>{let m;try{m=JSON.parse(raw)}catch{return}
 if((m.type==="create"||m.type==="join")&&!p){const id=String(m.room||"").replace(/\D/g,"");if(!/^\d{4}$/.test(id))return send(ws,{type:"error",msg:"4桁の部屋番号を入力してください"});if(m.type==="create"&&rooms.has(id))return send(ws,{type:"error",msg:"その部屋番号は使用中です"});r=getRoom(id,m.mapKey);if(r.started)return send(ws,{type:"error",msg:"その部屋は対戦中です"});if(r.players.size>=4)return send(ws,{type:"error",msg:"部屋が満員です"});if(m.type==="join"&&MAPS[m.mapKey]&&r.players.size===0)r.mapKey=m.mapKey;const i=r.players.size,s=spawns[i];p={id:Math.random().toString(36).slice(2,8),ws,name:String(m.name||"Player").slice(0,12),x:s[0]+.5,y:s[1]+.5,a:0,hp:100,score:0,kills:0,deaths:0,alive:true,color:colors[i],weapon:"pistol",ammo:12,reloading:false,lastShot:0,speedBoostUntil:0};r.players.set(p.id,p);if(!r.host)r.host=p.id;send(ws,{type:"joined",id:p.id,room:id,map:getMap(r),mapKey:r.mapKey,host:r.host===p.id,items:r.items});broadcastState(r,true);return}
 if(!p||!r)return;
 if(m.type==="ready"){if(r.started)return;r.ready.has(p.id)?r.ready.delete(p.id):r.ready.add(p.id);broadcastState(r,true);return}
 if(m.type==="start"){if(p.id!==r.host)return send(ws,{type:"error",msg:"部屋主だけが開始できます"});if(r.players.size<2)return send(ws,{type:"error",msg:"2人以上必要です"});if([...r.players.keys()].some(id=>!r.ready.has(id)))return send(ws,{type:"error",msg:"全員が準備完了してください"});startRoom(r);return}
 if(m.type==="weapon"&&r.started&&p.alive&&weapons[m.weapon]){p.weapon=m.weapon;p.ammo=Math.min(p.ammo,weapons[p.weapon].mag);p.reloading=false;return}
 if(m.type==="reload"&&r.started&&p.alive){tryReload(p);return}
 if(m.type==="move"&&r.started&&p.alive){const x=Number(m.x),y=Number(m.y),a=Number(m.a);const map=getMap(r);if(Number.isFinite(x)&&Number.isFinite(y)){const nx=Math.max(1.25,Math.min(18.75,x)),ny=Math.max(1.25,Math.min(map.length-.25,y));if(!blocked(map,nx,ny,.20)){p.x=nx;p.y=ny}}if(Number.isFinite(a))p.a=a;return}
 if(m.type==="shoot"&&r.started&&p.alive){shoot(r,p);return}
 });
 ws.on("close",()=>{if(r&&p){r.players.delete(p.id);r.ready.delete(p.id);if(r.host===p.id){r.host=r.players.keys().next().value||null}if(!r.players.size){rooms.delete([...rooms.entries()].find(([id,x])=>x===r)?.[0])}else{if(r.started&&[...r.players.values()].filter(x=>x.alive).length<=1)finishRoom(r);broadcastState(r,true)}}});
});
srv.listen(PORT,()=>console.log("server on "+PORT));
