// SSE reception and throttled HTTP state updates, with automatic reconnection.
export class Multiplayer {
 constructor({onStatus,onSpawn,onPlayers}){Object.assign(this,{onStatus,onSpawn,onPlayers});this.source=null;this.token=null;this.id=null;this.peers=new Map();this.generation=0;this.sending=false;this.lastSend=0;}
 connect(room){this.room=room;this.source?.close();this.generation++;this.token=null;this.peers.clear();this.onPlayers([]);this.onStatus('connecting',0);if(typeof EventSource==='undefined'){this.onStatus('offline',0);return;}
 const generation=this.generation,source=this.source=new EventSource(`/api/events?room=${encodeURIComponent(room)}`);
 source.addEventListener('welcome',event=>{if(generation!==this.generation)return;const data=JSON.parse(event.data);this.id=data.id;this.token=data.token;this.onSpawn(data.state);this.onStatus('online',1);});
 source.addEventListener('snapshot',event=>{if(generation!==this.generation)return;const {players}=JSON.parse(event.data);const ids=new Set();for(const p of players){if(p.id===this.id)continue;ids.add(p.id);const old=this.peers.get(p.id);this.peers.set(p.id,{...p,rx:old?.rx??p.x,ry:old?.ry??p.y,received:performance.now()});}for(const id of this.peers.keys())if(!ids.has(id))this.peers.delete(id);this.onPlayers([...this.peers.values()]);this.onStatus('online',players.length);});
 source.addEventListener('expired',()=>{if(generation===this.generation)this.connect(room);});
 source.onerror=()=>{if(generation!==this.generation)return;this.token=null;this.peers.clear();this.onPlayers([]);this.onStatus('offline',0);};
 }
 async send(state,now){if(!this.token||this.sending||now-this.lastSend<100)return;this.lastSend=now;this.sending=true;const generation=this.generation;
 try{const res=await fetch('/api/state',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:this.token,state}),signal:AbortSignal.timeout(4000)});if(res.status===401&&generation===this.generation)this.connect(this.room);}catch{if(generation===this.generation)this.onStatus('offline',0);}finally{this.sending=false;}
 }
}
