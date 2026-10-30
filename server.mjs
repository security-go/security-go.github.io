import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {RoomHub,ROOMS} from './multiplayer.js';
const root=process.cwd(),port=Number(process.env.PORT||5173),hub=new RoomHub();
const files=new Map(['index.html','style.css','app.js','engine.js','world.js','network.js','camera.js','favicon.svg'].map(f=>['/'+f,f]));
const types={html:'text/html; charset=utf-8',css:'text/css',js:'text/javascript',svg:'image/svg+xml'};
const json=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
const server=http.createServer(async(req,res)=>{
 try{
 const url=new URL(req.url,'http://localhost');
 if(url.pathname==='/api/events'&&req.method==='GET'){
  const room=url.searchParams.get('room')||'day';if(!ROOMS.includes(room))return json(res,400,{error:'Invalid room'});
  if([...hub.sessions.values()].filter(s=>s.room===room).length>=hub.capacity)return json(res,503,{error:'Room is full'});
  res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache, no-transform','Connection':'keep-alive','X-Accel-Buffering':'no'});res.flushHeaders();
  const token=hub.join(room,(event,data)=>{if(!res.destroyed){if(res.writableLength>256*1024){res.destroy();return;}res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);if(event==='expired')res.end();}});
  const ping=setInterval(()=>{if(!res.destroyed)res.write(': keepalive\n\n');},15000);
  res.on('close',()=>{clearInterval(ping);if(token)hub.leave(token);});return;
 }
 if(url.pathname==='/api/state'&&req.method==='POST'){
  if(req.headers.origin){let origin;try{origin=new URL(req.headers.origin);}catch{return json(res,403,{error:'Origin rejected'});}if(origin.host!==req.headers.host)return json(res,403,{error:'Origin rejected'});}
  if(!req.headers['content-type']?.startsWith('application/json'))return json(res,415,{error:'JSON required'});
  let body='',tooLarge=false;for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>2048){tooLarge=true;break;}}if(tooLarge)return json(res,413,{error:'Payload too large'});
  let payload;try{payload=JSON.parse(body);}catch{return json(res,400,{error:'Invalid JSON'});}
  if(!payload||typeof payload.token!=='string')return json(res,400,{error:'Missing session'});
  const status=hub.update(payload.token,payload.state);res.writeHead(status,{'Cache-Control':'no-store'});res.end();return;
 }
 if(req.method!=='GET'&&req.method!=='HEAD')return json(res,405,{error:'Method not allowed'});
 const name=files.get(url.pathname==='/'?'/index.html':url.pathname);if(!name)return json(res,404,{error:'Not found'});
 const content=await readFile(resolve(root,name));res.writeHead(200,{'Content-Type':types[name.split('.').at(-1)],'Cache-Control':'no-cache'});res.end(req.method==='HEAD'?undefined:content);
 }catch{if(!res.headersSent)json(res,500,{error:'Request failed'});else res.end();}
});
setInterval(()=>hub.expire(),1000).unref();
// Snapshots are shared at 5 Hz; clients interpolate between them.
setInterval(()=>hub.broadcast(),200).unref();
server.listen(port,'0.0.0.0',()=>console.log(`은빛성가 · http://localhost:${port}`));
