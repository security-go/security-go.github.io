import test from 'node:test';
import assert from 'node:assert/strict';
import {Renderer,transform,multiply,perspective,lookAt,vec} from '../engine.js';
import {createWorld} from '../world.js';
const near=(a,b)=>assert.ok(Math.abs(a-b)<.001,`${a} ≈ ${b}`);
test('model transforms compose without moving the origin incorrectly',()=>{
 const identity=transform();multiply(identity,identity).forEach((n,i)=>near(n,identity[i]));
 const m=multiply(transform(1,2,3),transform(4,5,6));assert.deepEqual([...m.slice(12,15)],[5,7,9]);
 assert.deepEqual(vec.norm([0,3,0]),[0,1,0]);
 const r=transform(0,0,0,Math.PI/2);near(r[0],0);near(r[2],-1);
});
test('ground picking and projection agree at the camera target',()=>{
 const r=Object.create(Renderer.prototype);r.canvas={width:1000,height:700,clientWidth:1000,clientHeight:700,getBoundingClientRect(){return {left:0,top:0,width:1000,height:700}}};r.fov=Math.PI/4;r.eye=[0,10,10];r.target=[0,0,0];
 const p=r.groundPoint(500,350);near(p.x,0);near(p.y,0);
 r.vp=multiply(perspective(Math.PI/4,1000/700,.1,100),lookAt(r.eye,r.target));
 const s=r.project([0,0,0]);near(s.x,500);near(s.y,350);assert.ok(s.visible);
 const corner=r.groundPoint(700,450);assert.ok(corner.x>0&&corner.y>0);
});
test('world meshes have complete, finite triangles and valid animated poses',()=>{
 let vertices=0,draws=0;
 const renderer={mesh(g){assert.equal(g.data.length%27,0);assert.ok(g.data.every(Number.isFinite));vertices+=g.data.length/9;return {};},draw(mesh,model){assert.ok(model.every(Number.isFinite));draws++;}};
 const world=createWorld(renderer);assert.equal(world.seats.length,24);assert.ok(world.colliders.length>50);assert.ok(vertices>10000);
 world.drawVisitor(0,0,0,1,true,false,0);world.drawVisitor(0,0,Math.PI,1,false,true,1,.6);assert.ok(draws>=10);
});

test('all pew seats are reachable from the central entrance without crossing a backrest',async()=>{
 const {seatPath,isWalkable}=await import('../world.js');
 const renderer={mesh(){return {}},draw(){}};const world=createWorld(renderer);
 for(const seat of world.seats){let p={x:0,y:7.4};for(const target of seatPath(p,seat)){const start={...p},distance=Math.hypot(target.x-p.x,target.y-p.y),steps=Math.ceil(distance/.04)||1;for(let i=1;i<=steps;i++){p={x:start.x+(target.x-start.x)*i/steps,y:start.y+(target.y-start.y)*i/steps};assert.ok(isWalkable(p.x,p.y,world.colliders),`Blocked route to ${JSON.stringify(seat)} at ${JSON.stringify(p)}`);}}}
});
