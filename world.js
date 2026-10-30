import {Geometry,transform,multiply as mul} from './engine.js';
export function createWorld(renderer){
 const g=new Geometry(),roof=new Geometry(),colliders=[],seats=[];let seed=716;
 const rand=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
 const box=(...a)=>g.box(...a),cyl=(...a)=>g.cylinder(...a),sphere=(...a)=>g.sphere(...a);
 const wall=(x,z,w,d)=>colliders.push({x,z,w,d});
 cyl(0,-.5,0,58,58,.8,'#9aa68d',64);box(0,.015,0,14,.16,19,'#d7d2c9');
 for(let i=0;i<22;i++){const a=i/22*Math.PI*2,r=38+rand()*9;cyl(Math.cos(a)*r,3,Math.sin(a)*r,9+rand()*9,0,10+rand()*12,i%2?'#8d9c91':'#a5b0a2',6);}
 function tree(x,z,s=1){g.shadow(x,z,s*.7);cyl(x,1.4*s,z,.15*s,.1*s,2.8*s,'#827369',7);for(let j=0;j<3;j++)cyl(x,(2+j*.8)*s,z,(1.15-j*.2)*s,0,2.3*s,['#657f76','#7d9283','#94a28b'][j],7);colliders.push({x,z,r:.45*s});}
 for(let i=0;i<46;i++){const a=i/46*Math.PI*2,r=17+rand()*9;tree(Math.cos(a)*r,Math.sin(a)*r,.7+rand()*.7);}
 // Marble nave, central aisle, raised sanctuary and warm brass trim.
 for(let x=-6;x<=6;x+=1.2)for(let z=-8;z<=8;z+=1.2)box(x,.105,z,1.17,.035,1.17,(Math.round((x+z)/1.2)%2)?'#e4e0d8':'#cecac2');
 box(0,.14,2,1.75,.035,13.5,'#845b65');box(0,.165,2,1.5,.014,13.5,'#966c76');
 for(const x of [-.83,.83])box(x,.17,2,.035,.015,13.5,'#c9b080');
 box(0,.22,-6.8,10,.32,4.4,'#d9d5cb');box(0,.14,-4.4,4,.16,.45,'#c9c6bd');
 // Apse wall, framed stained glass, rose window and the altar cross.
 box(0,3.9,-9,13.7,7.8,.35,'#c4bdb2');wall(0,-9,13.7,.35);
 function stainedWindow(x,z,y,w,h){box(x,y,z,w+.24,h+.24,.16,'#9b958c');box(x,y,z+.1,w,h,.04,'#658eac');const colors=['#90a8be','#af879b','#d3b77e','#859baf'];for(let i=0;i<4;i++)for(let j=0;j<3;j++)box(x+(i-1.5)*w/4,y+(j-1)*h/3,z+.14,w/4-.045,h/3-.045,.035,colors[(i+j)%4]);box(x,y,z+.19,.045,h,.03,'#d0c7ac');box(x,y,z+.19,w,.045,.03,'#d0c7ac');}
 stainedWindow(-4,-8.77,3.6,1.7,3.9);stainedWindow(4,-8.77,3.6,1.7,3.9);
 const roseY=5.6,roseZ=-8.76;
 for(let i=0;i<12;i++){const a=i/12*Math.PI*2,b=(i+1)/12*Math.PI*2;g.triangle([0,roseY,roseZ+.08],[Math.cos(a)*1.15,roseY+Math.sin(a)*1.15,roseZ+.08],[Math.cos(b)*1.15,roseY+Math.sin(b)*1.15,roseZ+.08],['#a0b4c9','#bb8b9b','#d9bd84','#879eb5'][i%4]);const x=Math.cos(a),y=roseY+Math.sin(a);sphere(x,y,roseZ+.1,.065,.065,.04,'#d1c4a4',6,4);}
 box(0,2.95,-8.4,.22,3.1,.18,'#c8ad77');box(0,3.65,-8.4,1.8,.2,.18,'#c8ad77');
 box(0,.91,-6.9,2.9,1.04,1.2,'#b4a58d');box(0,1.46,-6.9,3.25,.15,1.45,'#f0eae0');box(0,1.49,-6.18,2.8,.045,.02,'#ccb787');
 for(const x of [-1.25,1.25]){cyl(x,1.66,-6.8,.11,.11,.25,'#b5a071');cyl(x,1.96,-6.8,.055,.055,.45,'#fff0ce');sphere(x,2.22,-6.8,.05,.1,.05,'#efcd81');}
 box(-3.6,1.1,-6.2,.7,1.25,.65,'#8e7565');box(-3.6,1.75,-6.2,.95,.13,.75,'#ae9278');wall(0,-6.9,3.1,1.3);wall(-3.6,-6.2,.8,.8);
 // Pointed arches: complete overhead ribs, with open side bays for a readable cutaway.
 function arch(z){const inner=5.8,outer=6.05,base=4.5,peak=7.5;for(const sign of [-1,1]){for(let i=0;i<12;i++){const t=i/12,u=(i+1)/12;const p=(v,r)=>[sign*r*(1-v),base+(peak-base)*Math.sin(v*Math.PI/2),z];g.quad(p(t,inner),p(t,outer),p(u,outer),p(u,inner),'#d8d0c1');}cyl(sign*5.9,2.25,z,.22,.18,4.5,'#c3bbae',8);box(sign*5.9,.25,z,.7,.35,.7,'#c9c3b6');colliders.push({x:sign*5.9,z,r:.38});}}
 for(const z of [-7.7,-3,2,7])arch(z);
 // Low side walls and lancet windows keep the nave visible in third person.
 for(const x of [-6.6,6.6]){box(x,.55,-.2,.28,1.1,17.5,'#bfb9ae');wall(x,-.2,.28,17.5);for(const z of [-6,-1,4]){for(const dz of [-.6,0,.6])box(x,2.25,z+dz,.12,2.1,.52,['#8ea5bb','#bb99a7','#c8b48e'][Math.round((dz+.6)/.6)]);box(x,3.4,z,.18,.18,2,'#d6cbb8');}}
 // A separate slate roof is shown in first person; third person uses a dollhouse cutaway.
 roof.quad([-7,4.8,-9.4],[0,8.05,-9.4],[0,8.05,8.8],[-7,4.8,8.8],'#64707c');roof.quad([0,8.05,-9.4],[7,4.8,-9.4],[7,4.8,8.8],[0,8.05,8.8],'#707c88');
 // Bell tower and cross-crowned spire outside the left aisle.
 box(-9.2,3.1,-6.7,2.7,6.2,2.7,'#b8b1a5');box(-9.2,6.35,-6.7,3,.3,3,'#d2cabb');for(const x of [-10.15,-8.25])for(const z of [-7.65,-5.75])box(x,7.15,z,.3,1.4,.3,'#c4bbaa');cyl(-9.2,7.1,-6.7,.42,.21,.7,'#b39a64',12);cyl(-9.2,8.8,-6.7,2,0,2.3,'#6d7883',4);box(-9.2,10.35,-6.7,.12,1.15,.12,'#d2bc8d');box(-9.2,10.55,-6.7,.65,.1,.1,'#d2bc8d');wall(-9.2,-6.7,2.7,2.7);
 // Wooden pews: four rows on either side of the central aisle, three places per pew.
 for(let row=0;row<4;row++){const z=-2+row*2.35;for(const side of [-1,1]){const x=side*3.4;box(x,.31,z,3.7,.18,.85,'#a08268');box(x,.7,z+.43,3.7,.85,.12,'#8b6c56');box(x,.88,z+.51,3.75,.08,.16,'#b49a7b');for(const dx of [-1.55,1.55]){box(x+dx,.15,z,.14,.3,.65,'#79614e');box(x+dx,.51,z,.13,.5,1.05,'#8d725c');}box(x,.13,z-.65,3.1,.14,.25,'#9f8976');wall(x,z+.48,3.8,.12);for(const dx of [-1.08,0,1.08])seats.push({x:x+dx,y:z-.08});}}
 // Courtyard fountain and path to the nave.
 cyl(9,.2,4.3,2.1,2.1,.4,'#b9bdb4',32);cyl(9,.42,4.3,1.85,1.85,.04,'#91b0ba',32);cyl(9,1,4.3,.23,.18,1.2,'#ccd0c5');cyl(9,1.65,4.3,.85,.75,.25,'#bec8be',24);colliders.push({x:9,z:4.3,r:2.4});
 for(let i=0;i<4;i++)box(0,.04,9.3+i,.9,.1,.65,'#c0c2b5');
 for(let i=0;i<90;i++){const x=(rand()-.5)*29,z=(rand()-.5)*29;if(Math.abs(x)<11&&z>-10&&z<11)continue;cyl(x,.2,z,.05,0,.4,'#91a187',3);}
 const staticMesh=renderer.mesh(g),roofMesh=renderer.mesh(roof);
 // Visitors in everyday clothes, with seated legs and a joined-hands prayer pose.
 const body=renderer.mesh(new Geometry().cylinder(0,1,0,.29,.24,.75,'#7e8b9b',10).box(0,1,.235,.035,.5,.03,'#c5ccd2'));
 const head=renderer.mesh(new Geometry().sphere(0,1.65,0,.28,.31,.27,'#e3c39e',12,8).sphere(0,1.83,-.04,.29,.16,.26,'#696157',10,6).sphere(-.10,1.67,.25,.025,.03,.018,'#454b50',6,4).sphere(.1,1.67,.25,.025,.03,.018,'#454b50',6,4));
 const limb=renderer.mesh(new Geometry().cylinder(0,-.27,0,.09,.09,.54,'#596576',8));
 const hand=renderer.mesh(new Geometry().sphere(0,0,0,.085,.12,.08,'#dfbd96',8,5));
 const shadow=renderer.mesh(new Geometry().cylinder(0,.023,0,.4,.4,.008,'#aaa99b',20));
 const target=renderer.mesh(new Geometry().cylinder(0,.135,0,.22,.22,.01,'#e6cf93',24));
 const water=renderer.mesh(new Geometry().cylinder(0,0,0,.55,.55,.008,'#c4d6dc',32));
 const rain=renderer.mesh(new Geometry().box(0,0,0,.014,.3,.014,'#b8c5d1'));
 return {staticMesh,roofMesh,seats,colliders,target,water,rain,
 drawVisitor(x,z,angle,time,walking,sitting,praying,floor=0){const root=transform(x,floor,z,angle);renderer.draw(shadow,transform(x,floor,z));const pose=transform(0,sitting?-.25:0,0,0,1,1,1,praying?.035:0);const model=mul(root,pose);renderer.draw(body,model);renderer.draw(head,model);for(const s of [-1,1]){renderer.draw(limb,mul(root,transform(s*.14,sitting?.37:.56,sitting?.2:s*Math.sin(time*9)*(walking?.12:0),0,1,sitting?.55:1,1,sitting?-Math.PI/3:0)));renderer.draw(hand,mul(model,transform(praying?s*.055:s*.3,praying?1.13:1,praying?.38:.15)));}}
 };
}

export function seatPath(player,seat){return [{x:0,y:player.y},{x:0,y:seat.y-.9},{x:seat.x,y:seat.y-.9},seat];}
export function isWalkable(x,z,colliders){if(Math.abs(x)>12||z< -10||z>13)return false;return !colliders.some(c=>c.w?Math.abs(x-c.x)<c.w/2+.22&&Math.abs(z-c.z)<c.d/2+.22:Math.hypot(x-c.x,z-c.z)<c.r+.28);}
export function floorHeight(x,z){return Math.abs(x)<5&&z< -4.6&&z> -9?.38:Math.abs(x)<7&&z<9&&z> -9?.13:0;}
