import test from 'node:test';
import assert from 'node:assert/strict';
import {Multiplayer} from '../network.js';
test('client tracks remote players, isolates room switches and clears stale visitors',()=>{
 const old=globalThis.EventSource;const sources=[];
 class Source{constructor(url){this.url=url;this.events={};sources.push(this);}addEventListener(k,f){this.events[k]=f;}close(){this.closed=true;}emit(k,v){this.events[k]({data:JSON.stringify(v)});}}
 globalThis.EventSource=Source;
 try{let count=0,spawn;const client=new Multiplayer({onStatus:(s,n)=>count=n,onSpawn:p=>spawn=p,onPlayers(){}});
 client.connect('day');sources[0].emit('welcome',{id:'self',token:'private',state:{x:1,y:6}});assert.equal(spawn.x,1);
 sources[0].emit('snapshot',{players:[{id:'self'},{id:'other',x:3,y:4}]});assert.equal(count,2);assert.equal(client.peers.size,1);
 client.connect('night');assert.ok(sources[0].closed);assert.equal(client.peers.size,0);
 sources[0].emit('snapshot',{players:[{id:'stale',x:0,y:0}]});assert.equal(client.peers.size,0);
 sources[1].emit('welcome',{id:'new-self',token:'new-private',state:{x:0,y:0}});sources[1].onerror();assert.equal(client.token,null);assert.equal(count,0);
 }finally{globalThis.EventSource=old;}
});
