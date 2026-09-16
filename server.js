const http=require("http");
const fs=require("fs");
const path=require("path");
const WebSocket=require("ws");

const PORT=process.env.PORT||10000;
const rooms=new Map();

const MAPS={
 maze:{
  name:"迷路",
  map:[
   "1111111111111111111111111",
   "1000000000000000000000001",
   "1011111110111111111111101",
   "1000000010000000000000101",
   "1011111010111111111110101",
   "1010000010100000000010101",
   "1010111110101111111010101",
   "1010100000101000001010101",
   "1010101111101011101010101",
   "1010001000001010001010001",
   "1011101011111010111011101",
   "1000001000000000100000001",
   "1011111110111111111111101",
   "1000000000000000000000001",
   "1111111111111111111111111"
  ]
 },
 arena:{
  name:"アリーナ",
  map:[
   "1111111111111111111111111",
   "1000000000000000000000001",
   "1000111111111111111110001",
   "1000100000000000000010001",
   "1000101111111111111010001",
   "1000001000000000010010001",
   "1011101011111111010111101",
   "1000001010000001010000001",
   "1011111010111101011111101",
   "1000000010100001000000001",
   "1001111110101111111110001",
   "1000000000000000000000001",
   "1000001111111111111000001",
   "1000000000000000000000001",
   "1111111111111111111111111"
  ]
 },
 ruins:{
  name:"廃墟",
  map:[
   "1111111111111111111111111",
   "1000001000000000001000001",
   "1011101011110111111011101",
   "1000101000010100000010001",
   "1110101111010101111010111",
   "1000100000010001000010001",
   "1011110111111111011111101",
   "1000000100000000010000001",
   "1011111101111111011111101",
   "1000000001000000000000001",
   "1011111111011111111111101",
   "1000000000000000000000001",
   "1011110111110111110111101",
   "1000000000000000000000001",
   "1111111111111111111111111"
  ]
 }
};

const SPAWNS=[[1.5,1.5],[23.5,13.5],[15.5,1.5],[8.5,13.5]];
const COLORS=["#ff5b67","#4ea1ff","#ffd84d","#58df8c"];

const WEAPONS={
 pistol:{name:"ハンドガン",damage:34,range:12,cooldown:260,mag:12,reload:850,spread:.018,pellets:1},
 shotgun:{name:"ショットガン",damage:17,range:7,cooldown:700,mag:6,reload:1050,spread:.105,pellets:7},
 sniper:{name:"スナイパー",damage:100,range:24,cooldown:1150,mag:4,reload:1350,spread:.003,pellets:1}
};

function validMap(k){return MAPS[k]?k:"maze";}
function wall(map,x,y){
 const X=Math.floor(x),Y=Math.floor(y);
 return !map[Y] || map[Y][X]==="1";
}
function blocked(map,x,y,r=.22){
 return [
  [x-r,y-r],[x+r,y-r],[x-r,y+r],[x+r,y+r],
  [x,y-r],[x,y+r],[x-r,y],[x+r,y]
 ].some(([px,py])=>wall(map,px,py));
}
function clampAngle(a){
 while(a>Math.PI)a-=Math.PI*2;
 while(a<-Math.PI)a+=Math.PI*2;
 return a;
}
function send(ws,obj){if(ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify(obj));}
function broadcast(room,obj){for(const p of room.players.values())send(p.ws,obj);}
function snapshot(room){
 return {
  type:"state",
  timeLeft:Math.max(0,room.endAt-Date.now()),
  players:[...room.players.values()].map(p=>({
   id:p.id,name:p.name,x:p.x,y:p.y,a:p.a,hp:p.hp,score:p.score,
   kills:p.kills,deaths:p.deaths,alive:p.alive,color:p.color,
   ready:room.ready.has(p.id),weapon:p.weapon,ammo:p.ammo,
   mag:WEAPONS[p.weapon].mag,reloading:p.reloading
  }))
 };
}
function state(room,force=false){
 const now=Date.now();
 if(!force && now-room.lastState<50)return;
 room.lastState=now;
 broadcast(room,snapshot(room));
}
function roomFor(id,mapKey){
 if(!rooms.has(id)){
  rooms.set(id,{
   id,players:new Map(),ready:new Set(),started:false,
   host:null,mapKey:validMap(mapKey),endAt:0,lastState:0,items:[]
  });
 }
 return rooms.get(id);
}
function makeItems(room){
 const m=MAPS[room.mapKey].map;
 const items=[];
 let n=0;
 for(let y=1;y<m.length-1;y++){
  for(let x=1;x<m[y].length-1;x++){
   if(m[y][x]!=="0")continue;
   if(((x*31+y*17)%37)===0){
    items.push({
     id:`i${++n}`,
     x:x+.5,y:y+.5,
     type:(n%3===0?"heal":n%3===1?"ammo":"speed"),
     active:true
    });
   }
  }
 }
 room.items=items;
}
function resetPlayer(p,index){
 const s=SPAWNS[index%SPAWNS.length];
 p.x=s[0];p.y=s[1];p.a=0;p.hp=100;p.alive=true;
 p.ammo=WEAPONS[p.weapon].mag;p.reloading=false;p.reloadUntil=0;
 p.lastShot=0;p.speedUntil=0;
}
function startRoom(room){
 room.started=true;
 room.endAt=Date.now()+5*60*1000;
 room.ready.clear();
 makeItems(room);
 let i=0;
 for(const p of room.players.values()){
  p.score=0;p.kills=0;p.deaths=0;p.weapon="pistol";
  resetPlayer(p,i++);
 }
 broadcast(room,{type:"start",mapKey:room.mapKey,items:room.items});
 state(room,true);
}
function finishRoom(room){
 if(!room.started)return;
 room.started=false;
 const ranking=[...room.players.values()]
  .sort((a,b)=>b.score-a.score)
  .map(p=>({name:p.name,score:p.score,kills:p.kills,deaths:p.deaths}));
 broadcast(room,{type:"win",winner:ranking[0]?.name||"",ranking});
 state(room,true);
}
function lineClear(room,a,b){
 const map=MAPS[room.mapKey].map;
 const dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy);
 const steps=Math.ceil(d/.10);
 for(let i=1;i<steps;i++){
  if(wall(map,a.x+dx*i/steps,a.y+dy*i/steps))return false;
 }
 return true;
}
function reload(p){
 const w=WEAPONS[p.weapon];
 if(!p.reloading && p.ammo<w.mag){
  p.reloading=true;p.reloadUntil=Date.now()+w.reload;
 }
}
function tickReload(p){
 if(p.reloading && Date.now()>=p.reloadUntil){
  p.reloading=false;p.ammo=WEAPONS[p.weapon].mag;
 }
}
function shoot(room,p){
 const w=WEAPONS[p.weapon],now=Date.now();
 tickReload(p);
 if(p.reloading || now-p.lastShot<w.cooldown)return;
 if(p.ammo<=0){reload(p);return;}
 p.lastShot=now;p.ammo--;

 const targets=[...room.players.values()].filter(t=>t!==p&&t.alive);
 let primary=null,primaryDist=Infinity;

 for(let k=0;k<w.pellets;k++){
  const angle=p.a+(Math.random()-.5)*w.spread;
  let best=null,bestD=Infinity;
  for(const t of targets){
   const dx=t.x-p.x,dy=t.y-p.y,d=Math.hypot(dx,dy);
   if(d>w.range || d>=bestD || !lineClear(room,p,t))continue;
   const da=Math.abs(clampAngle(Math.atan2(dy,dx)-angle));
   if(da < (.34+(w.pellets>1?.18:0))/Math.max(d,.2)){
    best=t;bestD=d;
   }
  }
  if(best){
   best.hp-=w.damage;
   if(!primary || bestD<primaryDist){primary=best;primaryDist=bestD;}
  }
 }

 if(primary && primary.hp<=0){
  primary.hp=0;primary.alive=false;primary.deaths++;p.kills++;p.score++;
  broadcast(room,{
   type:"down",attacker:p.name,target:primary.name,
   targetId:primary.id,x:primary.x,y:primary.y,weapon:p.weapon
  });
  setTimeout(()=>{
   if(room.started && room.players.has(primary.id)){
    const index=[...room.players.keys()].indexOf(primary.id);
    resetPlayer(primary,index);
    state(room,true);
   }
  },1600);
 }
 broadcast(room,{type:"shot",from:p.id,weapon:p.weapon,hit:primary?.id||null});
 if(p.ammo<=0)reload(p);
 state(room,true);

 if(room.players.size>=2 &&
    [...room.players.values()].filter(x=>x.alive).length<=1)finishRoom(room);
}

const server=http.createServer((req,res)=>{
 let u=(req.url||"/").split("?")[0];
 if(u==="/")u="/index.html";
 if(u.includes("..")){res.writeHead(400);return res.end("Bad request");}
 const file=path.join(__dirname,"public",u);
 fs.readFile(file,(err,data)=>{
  if(err){res.writeHead(404);return res.end("404 Not Found");}
  const ext=path.extname(file);
  const type=ext===".html"?"text/html; charset=utf-8":
             ext===".js"?"text/javascript; charset=utf-8":
             ext===".css"?"text/css; charset=utf-8":"application/octet-stream";
  res.writeHead(200,{"Content-Type":type,"Cache-Control":"no-store"});
  res.end(data);
 });
});

const wss=new WebSocket.Server({server});

wss.on("connection",ws=>{
 let room=null,player=null;

 ws.on("message",raw=>{
  let m;
  try{m=JSON.parse(raw.toString())}catch{return;}

  if(!player && (m.type==="create"||m.type==="join")){
   const id=String(m.room||"").replace(/\D/g,"");
   if(!/^\d{4}$/.test(id))return send(ws,{type:"error",msg:"4桁の部屋番号を入力してください。"});
   if(m.type==="create" && rooms.has(id))
    return send(ws,{type:"error",msg:"その部屋番号は使用中です。"});
   if(m.type==="join" && !rooms.has(id))
    return send(ws,{type:"error",msg:"その部屋は存在しません。"});
   room=m.type==="create"?roomFor(id,m.mapKey):rooms.get(id);
   if(room.started)return send(ws,{type:"error",msg:"その部屋は対戦中です。"});
   if(room.players.size>=4)return send(ws,{type:"error",msg:"部屋が満員です。"});
   const i=room.players.size;
   const s=SPAWNS[i];
   player={
    id:Math.random().toString(36).slice(2,10),
    ws,name:String(m.name||"Player").trim().slice(0,12)||"Player",
    x:s[0],y:s[1],a:0,hp:100,score:0,kills:0,deaths:0,alive:true,
    color:COLORS[i],weapon:"pistol",ammo:12,reloading:false,
    reloadUntil:0,lastShot:0,speedUntil:0
   };
   room.players.set(player.id,player);
   if(!room.host)room.host=player.id;
   send(ws,{type:"joined",id:player.id,room:id,map:MAPS[room.mapKey].map,
            mapKey:room.mapKey,host:room.host===player.id,items:room.items});
   state(room,true);
   return;
  }

  if(!player||!room)return;

  if(m.type==="ready"){
   if(!room.started){
    if(room.ready.has(player.id))room.ready.delete(player.id);
    else room.ready.add(player.id);
    state(room,true);
   }
   return;
  }

  if(m.type==="start"){
   if(player.id!==room.host)return send(ws,{type:"error",msg:"部屋主だけが開始できます。"});
   if(room.players.size<2)return send(ws,{type:"error",msg:"2人以上で開始してください。"});
   if([...room.players.keys()].some(id=>!room.ready.has(id)))
    return send(ws,{type:"error",msg:"全員がREADYになってください。"});
   startRoom(room);return;
  }

  if(m.type==="move"&&room.started&&player.alive){
   const x=Number(m.x),y=Number(m.y),a=Number(m.a);
   if(Number.isFinite(x)&&Number.isFinite(y)){
    const map=MAPS[room.mapKey].map;
    const nx=Math.max(1.23,Math.min(map[0].length-1.23,x));
    const ny=Math.max(1.23,Math.min(map.length-1.23,y));
    if(!blocked(map,nx,ny,.22)){
     player.x=nx;player.y=ny;
    }
   }
   if(Number.isFinite(a))player.a=clampAngle(a);
   return;
  }

  if(m.type==="shoot"&&room.started&&player.alive){shoot(room,player);return;}
  if(m.type==="reload"&&room.started&&player.alive){reload(player);return;}
  if(m.type==="weapon"&&room.started&&player.alive&&WEAPONS[m.weapon]){
   player.weapon=m.weapon;
   player.ammo=Math.min(player.ammo,WEAPONS[player.weapon].mag);
   player.reloading=false;
   return;
  }
 });

 ws.on("close",()=>{
  if(!room||!player)return;
  room.players.delete(player.id);
  room.ready.delete(player.id);
  if(room.host===player.id)room.host=room.players.keys().next().value||null;
  if(room.players.size===0)rooms.delete(room.id);
  else{
   if(room.started &&
      [...room.players.values()].filter(x=>x.alive).length<=1)finishRoom(room);
   state(room,true);
  }
 });
});

setInterval(()=>{
 for(const room of rooms.values()){
  if(!room.started)continue;
  for(const p of room.players.values()){
   tickReload(p);
   for(const it of room.items){
    if(!it.active)continue;
    if(Math.hypot(it.x-p.x,it.y-p.y)<.58){
     it.active=false;
     if(it.type==="heal")p.hp=Math.min(100,p.hp+35);
     if(it.type==="ammo")p.ammo=WEAPONS[p.weapon].mag;
     if(it.type==="speed")p.speedUntil=Date.now()+8000;
     send(p.ws,{type:"pickup",item:it.type});
    }
   }
  }
  if(Date.now()>=room.endAt)finishRoom(room);
  state(room);
 }
},50);

server.listen(PORT,()=>console.log(`server on ${PORT}`));
