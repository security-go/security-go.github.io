import test from 'node:test';
import assert from 'node:assert/strict';
import {RoomHub} from '../multiplayer.js';
import {cameraPose} from '../camera.js';
const state={x:0,y:6,angle:Math.PI,mode:'walk',walking:true,praying:false};
test('rooms isolate snapshots, cap occupancy and never expose session tokens',()=>{
 const hub=new RoomHub({capacity:2});const a=[],b=[],c=[];
 const ta=hub.join('day',(e,d)=>a.push([e,d]));hub.join('day',(e,d)=>b.push([e,d]));hub.join('night',(e,d)=>c.push([e,d]));
 assert.equal(hub.join('day',()=>{}),null);assert.equal(hub.join('unknown',()=>{}),null);
 const pa=a.filter(x=>x[0]==='snapshot').at(-1)[1].players,pc=c.filter(x=>x[0]==='snapshot').at(-1)[1].players;
 assert.equal(pa.length,2);assert.equal(pc.length,1);assert.ok(pa.every(p=>!('token'in p)));assert.ok(!JSON.stringify(pa).includes(ta));
 hub.leave(ta);assert.equal(b.at(-1)[1].players.length,1);
});
test('updates validate input, throttle movement and synchronize praying',()=>{
 let now=10000;const hub=new RoomHub({now:()=>now});const token=hub.join('day',()=>{});const s=hub.sessions.get(token),before=s.state.x;
 assert.equal(hub.update('bad',state),401);assert.equal(hub.update(token,{...state,x:NaN}),400);
 assert.equal(hub.update(token,{...state,x:999,praying:true}),204);assert.ok(Math.abs(s.state.x-before)<.3);assert.equal(s.state.praying,true);
 now+=10;assert.equal(hub.update(token,state),429);now+=100;assert.equal(hub.update(token,{...state,praying:true}),204);assert.equal(s.state.praying,true);
 now+=61000;hub.expire();assert.equal(hub.sessions.size,0);assert.equal(hub.update(token,state),401);
});
test('first person uses eye height, faces forward and lowers when seated',()=>{
 const options={first:true,player:{x:3,y:4},floor:.6,yaw:0,pitch:0,follow:[0,0,0],distance:25};
 const p=cameraPose(options);assert.deepEqual(p.eye,[3,2.3,4]);assert.deepEqual(p.target,[3,2.3,3]);
 const seated=cameraPose({...options,sitting:true});assert.ok(seated.eye[1]<p.eye[1]);
 const third=cameraPose({...options,first:false});assert.deepEqual(third.eye,[0,0,25]);
 const turned=cameraPose({...options,yaw:Math.PI/2});assert.ok(Math.abs(turned.target[0]-2)<.0001);
});
