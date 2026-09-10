const http=require("http"),fs=require("fs"),path=require("path"),WebSocket=require("ws");
const PORT=process.env.PORT||8080, rooms=new Map();
const map=[
"11111111111111111111","10000000000000000001","10001110001110000001","10000010000010000001",
"10111011111011111001","10000000000000000001","10111101111101111101","10000000000000000001",
"10001111100011111001","10000000000000000001","11111111111111111111"];
const spawns=[[2,2],[17,2],[2,9],[17,9]];
function room(id){if(!rooms.has(id))rooms.set(id,{players:new Map(),started:false});return rooms.get(id)}
function send(ws,o){if(ws.readyState===1)ws.send(JSON.stringify(o))}
function broadcast(r,o){for(const p of r.players.values())send(p.ws,o)}
function state(r){return {type:"state",players:[...r.players.values()].map(p=>({id:p.id,name:p.name,x:p.x,y:p.y,a:p.a,hp:p.hp,score:p.score,alive:p.alive,color:p.color})),started:r.started}}
function reset(r){let i=0;for(const p of r.players.values()){let s=spawns[i++%4];Object.assign(p,{x:s[0]+.5,y:s[1]+.5,a:0,hp:100,score:0,alive:true})}r.started=false}
const srv=http.createServer((q,s)=>{let u=q.url==="/"?"index.html":q.url.slice(1),f=path.join(__dirname,"public",u);if(!f.startsWith(path.join(__dirname,"public")))return s.end();fs.readFile(f,(e,d)=>{if(e){s.writeHead(404);return s.end("404")}s.writeHead(200,{"Content-Type":path.extname(f)==".html"?"text/html":"text/javascript"});s.end(d)})});
const wss=new WebSocket.Server({server:srv});
wss.on("connection",ws=>{
 let rid=null,pid=Math.random().toString(36).slice(2,8),r=null,p=null;
 ws.on("message",raw=>{let m;try{m=JSON.parse(raw)}catch{return}
  if(m.type==="join"){rid=String(m.room||"1234").replace(/\D/g,"").slice(0,4).padStart(4,"0");r=room(rid);if(r.players.size>=4)return send(ws,{type:"error",msg:"この部屋は満員です"});let i=r.players.size,s=spawns[i];
   p={id:pid,ws,name:(m.name||"Player"+(i+1)).slice(0,12),x:s[0]+.5,y:s[1]+.5,a:0,hp:100,score:0,alive:true,color:["#ff5964","#4d9fff","#ffd447","#58dc8a"][i]};r.players.set(pid,p);send(ws,{type:"joined",id:pid,room:rid,map});broadcast(r,state(r));
  }
  if(!r||!p)return;
  if(m.type==="move"&&p.alive){p.x=Math.max(1.2,Math.min(18.8,+m.x||p.x));p.y=Math.max(1.2,Math.min(9.8,+m.y||p.y));p.a=+m.a||p.a;broadcast(r,state(r))}
  if(m.type==="start"&&r.players.size>=2){r.started=true;for(const x of r.players.values()){x.hp=100;x.alive=true;x.score=0}broadcast(r,{type:"start"});broadcast(r,state(r))}
  if(m.type==="shoot"&&r.started&&p.alive){let best=null,bd=99;for(const t of r.players.values())if(t!==p&&t.alive){let dx=t.x-p.x,dy=t.y-p.y,d=Math.hypot(dx,dy),ang=Math.atan2(dy,dx),diff=Math.abs(Math.atan2(Math.sin(ang-p.a),Math.cos(ang-p.a)));if(d<7&&diff<.22&&d<bd){best=t;bd=d}}
    if(best){best.hp-=34;if(best.hp<=0){best.hp=0;best.alive=false;p.score++;send(best.ws,{type:"down"});let alive=[...r.players.values()].filter(x=>x.alive);if(alive.length<=1){r.started=false;let win=alive[0];broadcast(r,{type:"win",winner:win?win.name:""});}}broadcast(r,state(r))}
  }
  if(m.type==="pickup"&&r.started){p.hp=Math.min(100,p.hp+25);send(ws,{type:"pickup"})}
  if(m.type==="restart"){reset(r);broadcast(r,state(r))}
 });
 ws.on("close",()=>{if(r&&p){r.players.delete(pid);if(r.players.size===0)rooms.delete(rid);else broadcast(r,state(r))}})
});
srv.listen(PORT,()=>console.log("server on "+PORT));
