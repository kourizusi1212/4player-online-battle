const WebSocket=require("ws"),http=require("http"),fs=require("fs"),path=require("path");

const PORT=process.env.PORT||10000;
const rooms=new Map();
const colors=["#ff5964","#4d9fff","#ffd447","#58dc8a"];
const map=[
"11111111111111111111",
"10000000000000000001",
"10001110001110000001",
"10000010000010000001",
"10111011111011111001",
"10000000000000000001",
"10111101111101111101",
"10000000000000000001",
"10001111100011111001",
"10000000000000000001",
"11111111111111111111"
];
const spawns=[[2,2],[17,2],[2,8],[17,8]];
function wall(x,y){const X=Math.floor(x),Y=Math.floor(y);return !map[Y]||map[Y][X]==="1";}
function blocked(x,y,r=.20){return [[x-r,y-r],[x+r,y-r],[x-r,y+r],[x+r,y+r],[x,y]].some(([px,py])=>wall(px,py));}

const srv=http.createServer((req,res)=>{
  let u=req.url==="/"?"index.html":req.url.slice(1);
  u=u.split("?")[0];
  const f=path.join(__dirname,"public",u);
  fs.readFile(f,(e,d)=>{
    if(e){res.writeHead(404);return res.end("404 Not Found")}
    const ext=path.extname(f);
    const ct=ext===".html"?"text/html; charset=utf-8":ext===".js"?"text/javascript; charset=utf-8":"text/plain; charset=utf-8";
    res.writeHead(200,{"Content-Type":ct,"Cache-Control":"no-cache"});
    res.end(d);
  });
});
const wss=new WebSocket.Server({server:srv});

function send(ws,o){if(ws.readyState===1)ws.send(JSON.stringify(o))}
function broadcast(r,o){for(const p of r.players.values())send(p.ws,o)}
function snapshot(r){
  return {type:"state",players:[...r.players.values()].map(p=>({
    id:p.id,name:p.name,x:p.x,y:p.y,a:p.a,hp:p.hp,score:p.score,
    alive:p.alive,color:p.color,ready:r.ready.has(p.id)
  }))};
}
function getRoom(id){
  if(!rooms.has(id)) rooms.set(id,{players:new Map(),ready:new Set(),started:false,lastBroadcast:0});
  return rooms.get(id);
}
function broadcastState(r,force=false){
  const now=Date.now();
  if(!force && now-r.lastBroadcast<50)return;
  r.lastBroadcast=now;
  broadcast(r,snapshot(r));
}

wss.on("connection",ws=>{
  let r=null,p=null;

  ws.on("message",raw=>{
    let m; try{m=JSON.parse(raw)}catch{return}

    if((m.type==="create"||m.type==="join")&&!p){
      const id=String(m.room||"").replace(/\D/g,"");
      if(!/^\d{4}$/.test(id)) return send(ws,{type:"error",msg:"4桁の部屋番号を入力してください"});
      if(m.type==="create"&&rooms.has(id)) return send(ws,{type:"error",msg:"その部屋番号は使用中です"});
      r=getRoom(id);
      if(r.started) return send(ws,{type:"error",msg:"その部屋は対戦中です"});
      if(r.players.size>=4) return send(ws,{type:"error",msg:"部屋が満員です"});

      const i=r.players.size,s=spawns[i];
      p={
        id:Math.random().toString(36).slice(2,8),
        ws,
        name:String(m.name||"Player").slice(0,12),
        x:s[0]+.5,y:s[1]+.5,a:0,hp:100,score:0,alive:true,color:colors[i]
      };
      r.players.set(p.id,p);
      send(ws,{type:"joined",id:p.id,room:id,map});
      broadcastState(r,true);
      return;
    }

    if(!p||!r)return;

    if(m.type==="ready"){
      if(r.started)return;
      r.ready.has(p.id)?r.ready.delete(p.id):r.ready.add(p.id);
      broadcastState(r,true);
      return;
    }

    if(m.type==="start"){
      if(r.players.size<2)return send(ws,{type:"error",msg:"2人以上必要です"});
      if([...r.players.keys()].some(id=>!r.ready.has(id)))
        return send(ws,{type:"error",msg:"全員が準備完了してください"});
      r.started=true;r.ready.clear();
      for(const x of r.players.values()){x.hp=100;x.alive=true;x.score=0}
      broadcast(r,{type:"start"});
      broadcastState(r,true);
      return;
    }

    if(m.type==="move"&&r.started&&p.alive){
      const x=Number(m.x),y=Number(m.y),a=Number(m.a);
      if(Number.isFinite(x)&&Number.isFinite(y)){
        const nx=Math.max(1.25,Math.min(18.75,x));
        const ny=Math.max(1.25,Math.min(9.75,y));
        if(!blocked(nx,ny,.20)){p.x=nx;p.y=ny;}
      }
      if(Number.isFinite(a))p.a=a;
      broadcastState(r);
      return;
    }

    if(m.type==="shoot"&&r.started&&p.alive){
      let target=null,bd=99;
      for(const t of r.players.values()){
        if(t===p||!t.alive)continue;
        const dx=t.x-p.x,dy=t.y-p.y,d=Math.hypot(dx,dy);
        const a=Math.atan2(dy,dx);
        const df=Math.abs(Math.atan2(Math.sin(a-p.a),Math.cos(a-p.a)));
        if(d<7&&df<.22&&d<bd){target=t;bd=d}
      }
      if(target){
        target.hp=Math.max(0,target.hp-34);
        if(target.hp<=0){target.alive=false;p.score++}
        broadcastState(r,true);
        const alive=[...r.players.values()].filter(x=>x.alive);
        if(alive.length<=1){
          r.started=false;
          broadcast(r,{type:"win",winner:alive[0]?.name||""});
          broadcastState(r,true);
        }
      }
      return;
    }
  });

  ws.on("close",()=>{
    if(r&&p){
      r.players.delete(p.id);r.ready.delete(p.id);
      if(!r.players.size){
        for(const [id,x] of rooms)if(x===r){rooms.delete(id);break}
      }else{
        if(r.started){
          const alive=[...r.players.values()].filter(x=>x.alive);
          if(alive.length<=1){r.started=false;broadcast(r,{type:"win",winner:alive[0]?.name||""})}
        }
        broadcastState(r,true);
      }
    }
  });
});

srv.listen(PORT,()=>console.log("server on "+PORT));
