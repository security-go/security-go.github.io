import { Renderer, transform } from './engine.js';
import { createWorld, seatPath, isWalkable, floorHeight } from './world.js';
import { cameraPose } from './camera.js';
import { Multiplayer } from './network.js';
const $ = (s) => document.querySelector(s);
const canvas = $('#scene');
let renderer, world;
try { renderer = new Renderer(canvas); world = createWorld(renderer); } catch (error) { $('#webgl-error').hidden = false; $('#webgl-error p').textContent = error.message; }
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const initialRoom = new URL(location.href).searchParams.get('room');
let zoom = 1, theme = ['day','night','rain'].includes(initialRoom)?initialRoom:'day', mode = 'walk', toastTimer;
let player = { x: 0, y: 4.1, tx: 0, ty: 4.1 }, praying = false, lastFrame = 0, elapsed = 0;
let statsDate = dateKey(), stats = readStats();
let audio, ambientSource, ambientGain;
const seats = world?.seats || [{x:0,y:0}];
let seatRoute=[];
let firstPerson=false;
const remoteLabels=new Map();
const network=new Multiplayer({
 onStatus(state,count){$('#connection-status').textContent=state==='online'?`함께 ${count}명`:state==='connecting'?'연결 중':'혼자 쉬는 중 · 재연결 중';$('#connection-status').dataset.state=state;},
 onSpawn(p){player.x=player.tx=p.x;player.y=player.ty=p.y;setMode('walk');$('.identity-name').textContent=p.name+' · 나';$('#player-label').textContent=p.name+' · 나';},
 onPlayers(players){const ids=new Set(players.map(p=>p.id));for(const [id,node] of remoteLabels)if(!ids.has(id)){node.remove();remoteLabels.delete(id);}for(const p of players)if(!remoteLabels.has(p.id)){const node=document.createElement('div');node.className='remote-label';node.textContent=p.name;$('#remote-labels').append(node);remoteLabels.set(p.id,node);}}
});
function dateKey() { const d = new Date(); return `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`; }
function readStats() { try { const v = JSON.parse(localStorage.getItem(`eunbit-seongga:${statsDate}`)); return { prayers: Math.max(0, Number(v?.prayers) || 0), rosaryBeads: Math.max(0, Number(v?.rosaryBeads) || 0) }; } catch { return { prayers: 0, rosaryBeads: 0 }; } }
function updateStats() {
  if (dateKey() !== statsDate) { statsDate = dateKey(); stats = readStats(); }
  $('#prayer-count').textContent = stats.prayers; $('#rosary-count').textContent = stats.rosaryBeads;
  const cycle=stats.rosaryBeads?((stats.rosaryBeads-1)%59)+1:0;$('#ring-count').textContent=cycle;
  $('#rosary-progress').style.width = `${cycle / 59 * 100}%`;
  try { localStorage.setItem(`eunbit-seongga:${statsDate}`, JSON.stringify(stats)); } catch { /* Storage may be disabled; the session remains usable. */ }
}
function toast(message) { $('#toast').textContent = message; $('#toast').classList.add('visible'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 2800); }
function status(message) { $('#status').textContent = message; }
function setMode(next) { if(next==='walk'){praying=false;updatePrayerButton();} mode = next; $('#sit-button').classList.toggle('active', next === 'sit'); status(next === 'sit' ? '고요히 쉬어가는 중' : '천천히 걸어보세요'); }
function updatePrayerButton(){ $('#pray-button').classList.toggle('active',praying);$('#prayer-label').textContent=praying?'기도 마치기':'기도하기';$('#pray-button').setAttribute('aria-pressed',String(praying)); }
function chooseSeat(seat){praying=false;updatePrayerButton();seatRoute=seatPath(player,seat);const next=seatRoute.shift();player.tx=next.x;player.ty=next.y;setMode('sit');}
function sit() { if (mode === 'sit') { seatRoute=[];player.tx=player.x;player.ty=player.y;setMode('walk');return; } const nearest=seats.reduce((a,b)=>Math.hypot(player.x-a.x,player.y-a.y)<Math.hypot(player.x-b.x,player.y-b.y)?a:b);chooseSeat(nearest);toast('의자에 앉아 잠시 쉬어가세요.'); }
function pray(){if(seatRoute.length)setMode('walk');praying=!praying;seatRoute=[];player.tx=player.x;player.ty=player.y;if(praying){updateStats();stats.prayers++;updateStats();status('두 손을 모으고 조용히 기도하는 중');}else status(mode==='sit'?'고요히 쉬어가는 중':'천천히 걸어보세요');updatePrayerButton();}
function bead() { updateStats();stats.rosaryBeads++;updateStats();document.querySelectorAll('.bead').forEach((b,i)=>b.classList.toggle('active',i===(stats.rosaryBeads-1)%59));if(stats.rosaryBeads%59===0){$('#rosary-message').textContent='묵주 한 바퀴를 마쳤어요. 잠시 마음에 평화를 담아보세요.';toast('묵주 한 바퀴를 마쳤어요.');} }
function getAudio() { if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)(); if (audio.state === 'suspended') audio.resume().catch(() => {}); return audio; }
function bell(volume = .5) { try { const a = getAudio(); [523.25, 1046.5, 1569.75].forEach((hz,i) => { const o = a.createOscillator(), g = a.createGain(); o.type = 'sine'; o.frequency.value = hz; g.gain.setValueAtTime(volume / (i+1), a.currentTime); g.gain.exponentialRampToValueAtTime(.0001, a.currentTime + 2.8 - i*.3); o.connect(g); g.connect(a.destination); o.start(); o.stop(a.currentTime+3); }); } catch { toast('이 브라우저에서는 소리를 사용할 수 없어요.'); } }
function toggleSound() { if (ambientSource) { ambientSource.stop(); ambientSource = null; $('#sound-button').setAttribute('aria-pressed','false'); $('#sound-button').setAttribute('aria-label','자연 소리 켜기'); return; } try { const a = getAudio(), buffer = a.createBuffer(1,a.sampleRate*4,a.sampleRate), data = buffer.getChannelData(0); let v=0; for(let i=0;i<data.length;i++){v=(v + (Math.random()*2-1)*.025)/1.025; data[i]=v*3;} const source = a.createBufferSource(), filter = a.createBiquadFilter(); ambientGain = a.createGain(); filter.type='lowpass'; filter.frequency.value = theme==='rain'?1400:650; ambientGain.gain.value=.28; source.buffer=buffer; source.loop=true; source.connect(filter); filter.connect(ambientGain); ambientGain.connect(a.destination); source.start(); ambientSource=source; $('#sound-button').setAttribute('aria-pressed','true'); $('#sound-button').setAttribute('aria-label','자연 소리 끄기'); toast('잔잔한 자연 소리를 켰어요.'); } catch { toast('이 브라우저에서는 소리를 사용할 수 없어요.'); } }
$('#sit-button').addEventListener('click',sit); $('#pray-button').addEventListener('click',pray);
$('#bell-button').addEventListener('click',()=>{bell();toast('잠시, 성당 종 소리에 귀 기울여보세요.');});
$('#rosary-button').addEventListener('click',()=>$('#rosary-dialog').showModal());
$('#room-button').addEventListener('click',()=>$('#room-dialog').showModal());
$('#help-button').addEventListener('click',()=>$('#help-dialog').showModal());
$('#sound-button').addEventListener('click',toggleSound);
$('#zoom-in').addEventListener('click',()=>zoom=Math.min(1.5,zoom+.1)); $('#zoom-out').addEventListener('click',()=>zoom=Math.max(.65,zoom-.1));
$('#reset-button').addEventListener('click',()=>{ if(confirm('오늘의 기도와 묵주 기록을 초기화할까요?')) { stats={prayers:0,rosaryBeads:0};updateStats();toast('오늘의 기록을 초기화했어요.'); } });
document.querySelectorAll('dialog').forEach(d=>{ d.querySelector('.close').addEventListener('click',()=>d.close()); d.addEventListener('click', e=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();}}); });
document.querySelectorAll('[data-room]').forEach(b=>b.addEventListener('click',()=>{theme=b.dataset.theme;document.body.dataset.theme=theme;$('#room-label').textContent=b.dataset.room;$('#room-dialog').close();network.connect(theme);const url=new URL(location.href);url.searchParams.set('room',theme);history.replaceState(null,'',url);$('.scene-label').childNodes[1].textContent=theme==='night'?' 달빛 아래 고요한 성당 ':theme==='rain'?' 빗소리가 머무는 성당 ':' 성당에 내려앉은 오후 ';toast(`${b.dataset.room}에 오신 것을 환영해요.`);}));
// Four pendant beads and a loop of fifty small beads with five separators.
for(let i=0;i<59;i++){const b=document.createElement('i');b.className='bead';if(i<4){b.classList.toggle('large',i===0);b.style.transform=`translate(0px,${50+i*17}px)`;}else{const j=i-4,a=Math.PI/2+j*2*Math.PI/55;b.classList.toggle('large',j%11===0);b.style.transform=`translate(${Math.cos(a)*82}px,${Math.sin(a)*82-50}px)`;}$('#rosary-ring').append(b);}
let beadY=null, dragged=false;
$('#rosary-ring').addEventListener('pointerdown',e=>{beadY=e.clientY;dragged=false;e.currentTarget.setPointerCapture(e.pointerId);});
$('#rosary-ring').addEventListener('pointermove',e=>{if(beadY!==null&&Math.abs(e.clientY-beadY)>22){bead();beadY=e.clientY;dragged=true;}});
$('#rosary-ring').addEventListener('pointerup',()=>{beadY=null;});
$('#rosary-ring').addEventListener('pointercancel',()=>{beadY=null;dragged=true;});
$('#rosary-ring').addEventListener('click',()=>{if(!dragged)bead();dragged=false;});
// Game input is camera-relative; pointer drags orbit and taps select ground targets.
const keys=new Set();let yaw=.48,pitch=.69,angle=Math.PI,follow=[0,1,1],drag=null,pinchDistance=0;const pointers=new Map();let joy=[0,0];let gamePaused=false;
const modalsOpen=()=>!!document.querySelector('dialog[open]');
function cancelMovement(){keys.clear();joy=[0,0];$('#joystick-stick').style.transform='translate(0,0)';}
window.addEventListener('blur',cancelMovement);
document.addEventListener('visibilitychange',()=>{if(document.hidden)cancelMovement();});
document.querySelectorAll('dialog').forEach(d=>new MutationObserver(()=>{if(d.open)cancelMovement();}).observe(d,{attributes:true,attributeFilter:['open']}));
window.addEventListener('keydown',e=>{if(modalsOpen()||e.ctrlKey||e.metaKey||e.altKey||['BUTTON','A'].includes(e.target.tagName)&&e.code==='Space')return;const k=e.key.toLowerCase();if(['arrowup','arrowdown','arrowleft','arrowright','w','a','s','d',' '].includes(k)){e.preventDefault();keys.add(k);}if(e.repeat)return;if(k==='1'||k===' ')sit();if(k==='2')pray();if(k==='3')$('#rosary-dialog').showModal();if(k==='4')bell();if(k==='r')resetCamera();if(k==='v')toggleView();});
window.addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));
function toggleView(){firstPerson=!firstPerson;pitch=firstPerson?.04:.69;document.body.dataset.view=firstPerson?'first':'third';$('#view-button').textContent=firstPerson?'3인칭':'1인칭';$('#view-button').setAttribute('aria-pressed',String(firstPerson));$('#view-button').setAttribute('aria-label',firstPerson?'3인칭 시점으로 전환':'1인칭 시점으로 전환');cancelMovement();toast(firstPerson?'1인칭 · 드래그로 둘러보고 WASD나 조이스틱으로 걸어요.':'3인칭 시점으로 전환했어요.');}
$('#view-button').addEventListener('click',toggleView);
$('#invite-button').addEventListener('click',async()=>{const url=new URL(location.href);url.searchParams.set('room',theme);try{await navigator.clipboard.writeText(url.href);toast('초대 링크를 복사했어요. 같은 링크로 함께 들어오세요.');}catch{prompt('이 링크를 공유해 주세요.',url.href);}});
function resetCamera(){yaw=.48;pitch=firstPerson?.04:.69;zoom=1;toast('시점을 처음 위치로 돌렸어요.');}
$('#camera-reset').addEventListener('click',resetCamera);
$('#fullscreen-button').addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{toast('이 브라우저에서는 전체 화면을 사용할 수 없어요.');}});
canvas.addEventListener('contextmenu',e=>e.preventDefault());
canvas.addEventListener('pointerdown',e=>{if(!renderer||gamePaused)return;canvas.setPointerCapture(e.pointerId);canvas.focus({preventScroll:true});pointers.set(e.pointerId,[e.clientX,e.clientY]);drag={id:e.pointerId,x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY,moved:false};if(pointers.size===2){const p=[...pointers.values()];pinchDistance=Math.hypot(p[0][0]-p[1][0],p[0][1]-p[1][1]);drag.moved=true;}});
canvas.addEventListener('pointermove',e=>{if(!pointers.has(e.pointerId)||!drag)return;const old=pointers.get(e.pointerId);pointers.set(e.pointerId,[e.clientX,e.clientY]);if(pointers.size===2){const p=[...pointers.values()],d=Math.hypot(p[0][0]-p[1][0],p[0][1]-p[1][1]);if(pinchDistance>0&&!firstPerson)zoom=Math.max(.65,Math.min(1.8,zoom*d/pinchDistance));pinchDistance=d;drag.moved=true;return;}if(Math.hypot(e.clientX-drag.startX,e.clientY-drag.startY)>6)drag.moved=true;if(drag.moved){yaw-=(e.clientX-old[0])*.006;pitch=Math.max(firstPerson?-1.1:.28,Math.min(1.2,pitch+(e.clientY-old[1])*.005));}});
function releasePointer(e){const tapped=drag&&!drag.moved&&pointers.size===1&&e.type==='pointerup';pointers.delete(e.pointerId);if(tapped&&renderer.vp){const p=renderer.groundPoint(e.clientX,e.clientY),seatPoint=renderer.groundPoint(e.clientX,e.clientY,.45);const c=seatPoint&&seats.find(c=>Math.hypot(c.x-seatPoint.x,c.y-seatPoint.y)<.65);if(c)chooseSeat(c);else if(p&&Math.abs(p.x)<13&&p.y>-11&&p.y<14){seatRoute=[];player.tx=p.x;player.ty=p.y;setMode('walk');}}if(!pointers.size){drag=null;pinchDistance=0;}else if(drag)drag.moved=true;}
canvas.addEventListener('pointerup',releasePointer);canvas.addEventListener('pointercancel',releasePointer);
canvas.addEventListener('wheel',e=>{e.preventDefault();if(firstPerson)return;zoom=Math.max(.65,Math.min(1.8,zoom*Math.exp(-e.deltaY*.001)));},{passive:false});
const joystick=$('#joystick');let joyId=null;
function joystickMove(e){if(joyId!==e.pointerId)return;const r=joystick.getBoundingClientRect();let x=(e.clientX-r.left-r.width/2)/30,y=(e.clientY-r.top-r.height/2)/30;const m=Math.max(1,Math.hypot(x,y));joy=[x/m,y/m];$('#joystick-stick').style.transform=`translate(${joy[0]*26}px,${joy[1]*26}px)`;}
joystick.addEventListener('pointerdown',e=>{joyId=e.pointerId;joystick.setPointerCapture(e.pointerId);joystickMove(e);});joystick.addEventListener('pointermove',joystickMove);for(const type of ['pointerup','pointercancel'])joystick.addEventListener(type,()=>{joyId=null;joy=[0,0];$('#joystick-stick').style.transform='translate(0,0)';});
canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();gamePaused=true;$('#webgl-error').hidden=false;$('#webgl-error p').textContent='3D 그래픽 연결이 중단됐어요. 페이지를 새로고침해 주세요.';cancelMovement();});
function free(x,z){return isWalkable(x,z,world.colliders);}
function frame(now){requestAnimationFrame(frame);if(!renderer||gamePaused)return;const dt=Math.min((now-lastFrame)/1000,.04);lastFrame=now;elapsed+=dt;const paused=modalsOpen(),t=reduceMotion?0:elapsed;
 let ix=joy[0]+(keys.has('d')||keys.has('arrowright')?1:0)-(keys.has('a')||keys.has('arrowleft')?1:0),iz=joy[1]+(keys.has('s')||keys.has('arrowdown')?1:0)-(keys.has('w')||keys.has('arrowup')?1:0);
 if(!paused&&Math.hypot(ix,iz)>.12){const len=Math.max(1,Math.hypot(ix,iz));ix/=len;iz/=len;seatRoute=[];if(praying){praying=false;updatePrayerButton();}player.tx=player.x+(ix*Math.cos(yaw)+iz*Math.sin(yaw))*1.5;player.ty=player.y+(-ix*Math.sin(yaw)+iz*Math.cos(yaw))*1.5;if(mode!=='walk')setMode('walk');}
 const dx=player.tx-player.x,dz=player.ty-player.y,dist=Math.hypot(dx,dz),walking=dist>.06&&!praying&&!paused;const speed=Math.min(dist,dt*2.8);
 if(walking){const nx=player.x+dx/dist*speed,nz=player.y+dz/dist*speed;let moved=false;if(free(nx,player.y)){player.x=nx;moved=true;}if(free(player.x,nz)){player.y=nz;moved=true;}if(!moved){seatRoute=[];player.tx=player.x;player.ty=player.y;setMode('walk');}angle=Math.atan2(dx,dz);}else if(mode==='sit'||praying)angle=Math.PI;
 if(dist<=.08&&seatRoute.length&&!paused){const next=seatRoute.shift();player.tx=next.x;player.ty=next.y;}
 const wanted=[player.x*.5,1,player.y*.4-1];for(let i=0;i<3;i++)follow[i]+=(wanted[i]-follow[i])*Math.min(1,dt*3);
 const floor=floorHeight(player.x,player.y);
 const pose=cameraPose({first:firstPerson,player,floor,yaw,pitch,follow,distance:(canvas.clientWidth<720?29:25)/zoom,sitting:mode==='sit'&&!walking&&!seatRoute.length,praying});renderer.begin(pose.eye,pose.target,theme,pose.fov);renderer.draw(world.staticMesh);if(firstPerson)renderer.draw(world.roofMesh);
 if(!firstPerson)world.drawVisitor(player.x,player.y,angle,t,walking,mode==='sit'&&!walking&&!seatRoute.length,praying,floor);
 if(firstPerson&&!walking)angle=yaw+Math.PI;
 network.send({x:player.x,y:player.y,angle,mode:mode==='sit'&&!walking&&!seatRoute.length?'sit':'walk',walking,praying},now);
 for(const peer of network.peers.values()){peer.rx+=(peer.x-peer.rx)*Math.min(1,dt*10);peer.ry+=(peer.y-peer.ry)*Math.min(1,dt*10);const h=floorHeight(peer.rx,peer.ry);world.drawVisitor(peer.rx,peer.ry,peer.angle,t,peer.walking,peer.mode==='sit'&&!peer.walking,peer.praying,h);const label=remoteLabels.get(peer.id),p=renderer.project([peer.rx,h+2.1,peer.ry]);if(label){label.style.transform=`translate(${p.x}px,${p.y}px) translate(-50%,-100%)`;label.hidden=!p.visible;}}
 if(walking&&!reduceMotion)renderer.draw(world.target,transform(player.tx,0,player.ty));

 for(let i=0;i<3;i++){const k=1+((t*.3+i*.33)%1)*1.6;renderer.draw(world.water,transform(9,.45,4.3,0,k,1,k));}
 if(theme==='rain'&&!reduceMotion)for(let i=0;i<100;i++){const x=Math.sin(i*73)*16,z=Math.cos(i*41)*16,y=10-((t*6+i*.7)%10);renderer.draw(world.rain,transform(x,y,z));}
 const name=renderer.project([player.x,2.1+floor,player.y]);$('#player-label').style.transform=`translate(${name.x}px,${name.y}px) translate(-50%,-100%)`;$('#player-label').hidden=firstPerson||!name.visible;
 $('#compass-arrow').style.transform=`rotate(${-yaw}rad)`;
}
function clock(){const d=new Date();$('#clock').textContent=d.toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit',hour12:false});updateStats();}
document.body.dataset.theme=theme;$('#room-label').textContent={day:'빛의 성당',night:'달빛 성당',rain:'빗소리 성당'}[theme];$('.scene-label').childNodes[1].textContent={day:' 성당에 내려앉은 오후 ',night:' 달빛 아래 고요한 성당 ',rain:' 빗소리가 머무는 성당 '}[theme];network.connect(theme);
updateStats();clock();setInterval(clock,30000);if(renderer)requestAnimationFrame(frame);
