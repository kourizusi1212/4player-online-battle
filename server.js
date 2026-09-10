const WebSocket=require("ws"),http=require("http"),fs=require("fs"),path=require("path");
const PORT=process.env.PORT||10000,rooms=new Map(),colors=["#ff5964","#4d9fff","#ffd447","#58dc8a"];
const map=["11111111111111111111","10000000000000000001","10001110001110000001","10000010000010000001","10111011111011111001","10000000000000000001","10111101111101111101","10000000000000000001","10001111100011111001","10000000000000000001","11111111111111111111"],spawns=[[2,2],[17,2],[2,9],[17,9]];
const srv=http.createServer((req,res)=>{let u=req.url==="/"?"index.html":req.url.slice(1),f=path.join(__dirname,"public",u);fs.readFile(f,(e,d)=>{if(e){res.writeHead(404);return res.end("404 Not Found")}res.writeHead(200,{"Content-Type":path.extname(f)==".html"?"text/html; charset=utf-8":"text/javascript; charset=utf-8"});res.end(d)})});
const wss=new WebSocket.Server({server:srv});
function send(ws,o){if(ws.readyState===1)ws.send(JSON.stringify(o))} function broadcast(r,o){for(const p of r.players.values())send(p.ws,o)}
function state(r){return {type:"state",players:[...r.players.values()].map(p=>({id:p.id,name:p.name,x:p.x,y:p.y,a:p.a,hp:p.hp,score:p.score,alive:p.alive,color:p.color,ready:r.ready.has(p.id)}))}}
function getRoom(id){if(!rooms.has(id))rooms.set(id,{players:new Map(),ready:new Set(),started:false});return rooms.get(id)}
wss.on("connection",ws=>{let r=null,p=null;
ws.on("message",raw=>{let m;try{m=JSON.parse(raw)}catch{return}
 if((m.type==="create"||m.type==="join")&&!p){let id=String(m.room||"").replace(/\D/g,"");if(!/^\d{4}$/.test(id))return send(ws,{type:"error",msg:"4桁の部屋番号を入力してください"});if(m.type==="create"&&rooms.has(id))return send(ws,{type:"error",msg:"その部屋番号は使用中です"});r=getRoom(id);if(r.started)return send(ws,{type:"error",msg:"その部屋は対戦中です"});if(r.players.size>=4)return send(ws,{type:"error",msg:"部屋が満員です"});let i=r.players.size,s=spawns[i];p={id:Math.random().toString(36).slice(2,8),ws,name:String(m.name||"Player").slice(0,12),x:s[0]+.5,y:s[1]+.5,a:0,hp:100,score:0,alive:true,color:colors[i]};r.players.set(p.id,p);send(ws,{type:"joined",id:p.id,room:id,map});broadcast(r,state(r));return}
 if(!p||!r)return;
 if(m.type==="ready"){r.ready.has(p.id)?r.ready.delete(p.id):r.ready.add(p.id);broadcast(r,state(r))}
 if(m.type==="start"){if(r.players.size<2)return send(ws,{type:"error",msg:"2人以上必要です"});if([...r.players.keys()].some(id=>!r.ready.has(id)))return send(ws,{type:"error",msg:"全員が準備完了してください"});r.started=true;r.ready.clear();for(const x of r.players.values()){x.hp=100;x.alive=true;x.score=0}broadcast(r,{type:"start"});broadcast(r,state(r))}
 if(m.type==="move"&&r.started&&p.alive){p.x=Math.max(1.2,Math.min(18.8,Number(m.x)||p.x));p.y=Math.max(1.2,Math.min(9.8,Number(m.y)||p.y));p.a=Number(m.a)||p.a;broadcast(r,state(r))}
 if(m.type==="shoot"&&r.started&&p.alive){let target=null,bd=99;for(const t of r.players.values())if(t!==p&&t.alive){let dx=t.x-p.x,dy=t.y-p.y,d=Math.hypot(dx,dy),a=Math.atan2(dy,dx),df=Math.abs(Math.atan2(Math.sin(a-p.a),Math.cos(a-p.a)));if(d<7&&df<.22&&d<bd){target=t;bd=d}}if(target){target.hp-=34;if(target.hp<=0){target.hp=0;target.alive=false;p.score++;}broadcast(r,state(r));let alive=[...r.players.values()].filter(x=>x.alive);if(alive.length<=1){r.started=false;broadcast(r,{type:"win",winner:alive[0]?.name||""})}}}
});
ws.on("close",()=>{if(r&&p){r.players.delete(p.id);r.ready.delete(p.id);if(!r.players.size)rooms.delete([...rooms.entries()].find(([id,x])=>x===r)?.[0]);else broadcast(r,state(r))}});
});
srv.listen(PORT,()=>console.log("server on "+PORT));
