import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
async function load(file){const source=await readFile(new URL(file,import.meta.url),'utf8');const {outputText}=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}});return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);}
const {createRefreshQueue}=await load('../src/services/refreshQueue.ts');
const {createSharedPoller}=await load('../src/services/sharedPoller.ts');
const tick=()=>new Promise(resolve=>setTimeout(resolve,15));

test('five simultaneous refresh signals make one read; changes during it make exactly one follow-up',async()=>{
 let calls=0,done;const queue=createRefreshQueue(()=>{calls++;return new Promise(resolve=>done=resolve);},1);
 try{for(let i=0;i<5;i++)queue.request();await tick();assert.equal(calls,1);for(let i=0;i<5;i++)queue.request();done();await tick();assert.equal(calls,2);done();await tick();assert.equal(calls,2);}finally{queue.dispose();}
});
test('disposing a refresh queue prevents scheduled and trailing reads',async()=>{
 let calls=0;const queue=createRefreshQueue(async()=>{calls++;},5);queue.request();queue.dispose();await tick();assert.equal(calls,0);
});
test('bank panel and app shell share polling, pause offline, and release listeners on unmount',async()=>{
 let calls=0,online=true,resume,stopped=0;const received=[];
 const poller=createSharedPoller({fetch:async()=>{calls++;return {connections:[1]};},owner:()=> 'one',available:()=>online,interval:()=>60000,listen:fn=>{resume=fn;return()=>stopped++;}});
 const a=poller.subscribe(value=>received.push(['shell',value]));const b=poller.subscribe(value=>received.push(['panel',value]));
 try{await tick();assert.equal(calls,1);assert.equal(received.length,2);online=false;await assert.rejects(poller.refresh());assert.equal(calls,1);online=true;resume();await new Promise(resolve=>setTimeout(resolve,130));assert.equal(calls,2);}finally{a();b();}
 assert.equal(stopped,1);
});
test('old-owner bank responses cannot update a new session',async()=>{
 let owner='one';const responses=[],values=[];
 const poller=createSharedPoller({fetch:()=>new Promise(resolve=>responses.push(resolve)),owner:()=>owner,available:()=>true,interval:()=>60000,listen:()=>()=>{}});
 const stop=poller.subscribe(value=>values.push(value));
 try{await tick();owner='two';const second=poller.refresh();responses[0]('old-private-data');await tick();assert.deepEqual(values,[]);responses[1]('new-data');await second;assert.deepEqual(values,['new-data']);}finally{stop();}
});
