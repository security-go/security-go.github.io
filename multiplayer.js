import {randomUUID} from 'node:crypto';
export const ROOMS=['day','night','rain'];
// In-memory room authority for one Node process. Tokens are never broadcast.
export class RoomHub {
 constructor({now=Date.now,capacity=32}={}){this.now=now;this.capacity=capacity;this.sessions=new Map();}
 join(room,send){if(!ROOMS.includes(room))return null;if([...this.sessions.values()].filter(s=>s.room===room).length>=this.capacity)return null;const id=randomUUID(),token=randomUUID(),n=this.sessions.size;const state={id,name:`고요한 마음 ${id.slice(0,4)}`,x:(n%5-2)*.8,y:6+Math.floor(n%15/5)*.7,angle:Math.PI,mode:'walk',walking:false,praying:false};const session={room,send,token,state,last:this.now(),lastUpdate:0};this.sessions.set(token,session);send('welcome',{id,token,state});this.broadcast();return token;}
 leave(token){this.sessions.delete(token);this.broadcast();}
 update(token,p){const s=this.sessions.get(token);if(!s)return 401;const now=this.now();if(s.lastUpdate&&now-s.lastUpdate<60)return 429;
 if(!p||!['x','y','angle'].every(k=>typeof p[k]==='number'&&Number.isFinite(p[k]))||!['walk','sit'].includes(p.mode)||typeof p.walking!=='boolean'||typeof p.praying!=='boolean')return 400;
 const x=Math.max(-12,Math.min(12,p.x)),y=Math.max(-10,Math.min(13,p.y)),dx=x-s.state.x,dy=y-s.state.y,dist=Math.hypot(dx,dy),maxStep=Math.min(1,Math.max(.05,(now-s.last)/1000))*3.2+.08;
 const scale=dist>maxStep?maxStep/dist:1;s.state.x+=dx*scale;s.state.y+=dy*scale;s.state.angle=((p.angle%(Math.PI*2))+Math.PI*2)%(Math.PI*2);s.state.mode=p.mode;s.state.walking=p.walking;
 s.state.praying=p.praying;s.last=now;s.lastUpdate=now;return 204;
 }
 broadcast(){for(const room of ROOMS){const players=[...this.sessions.values()].filter(s=>s.room===room).map(s=>({...s.state}));for(const s of this.sessions.values())if(s.room===room)s.send('snapshot',{players});}}
 expire(){for(const [token,s] of this.sessions)if(this.now()-s.last>60000){s.send('expired',{});this.sessions.delete(token);}this.broadcast();}
}
