import assert from 'node:assert/strict';
import test from 'node:test';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {runInNewContext} from 'node:vm';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import {act,createElement} from 'react';
const dom=new JSDOM('<div id="root"></div>',{url:'https://localhost/app',pretendToBeVisual:true});
for(const key of ['window','document','HTMLElement','Event','Node'])globalThis[key]=dom.window[key];
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const {createRoot}=await import('react-dom/client');
let native=true,tokens=[],exchanges=[],finishNative,webConfig,failToken=false,failExchange=false,owner='test-session';
const api={createPlaidLinkToken:async platform=>{tokens.push(platform??'web');if(failToken)throw Error('Could not start Plaid Link.');return {link_token:'ephemeral-link-test'};},exchangePlaidToken:async(...args)=>{exchanges.push(args);if(failExchange)throw Error('Could not confirm the connection.');},disconnectPlaid:async()=>{},refreshPlaid:async()=>({requested:0}),syncPlaid:async()=>({added:0,modified:0,removed:0})};
const built=await build({entryPoints:[fileURLToPath(new URL('../src/components/PlaidConnection.tsx',import.meta.url))],bundle:true,platform:'node',format:'cjs',packages:'external',write:false,loader:{'.css':'empty'},plugins:[{name:'boundaries',setup(builder){
 builder.onLoad({filter:/[\\/]api[\\/]client\.ts$/},()=>({contents:'export const getAccessToken=()=>globalThis.__owner();',loader:'ts'}));
 builder.onLoad({filter:/[\\/]api[\\/]plaid\.ts$/},()=>({contents:Object.keys(api).map(name=>`export const ${name}=(...args)=>globalThis.__api.${name}(...args);`).join('\n'),loader:'ts'}));
 builder.onLoad({filter:/[\\/]native[\\/]plaid\.ts$/},()=>({contents:'export const usesAndroidPlaid=()=>globalThis.__native(); export const openAndroidPlaid=(token)=>globalThis.__open(token);',loader:'ts'}));
 builder.onLoad({filter:/[\\/]services[\\/]plaidStatus\.ts$/},()=>({contents:'export const subscribePlaidStatus=fn=>{fn({configured:true,connections:[]});return()=>{}};export const refreshPlaidStatus=async()=>({configured:true,connections:[]});',loader:'ts'}));
 builder.onLoad({filter:/[\\/]api[\\/]transactions\.ts$/},()=>({contents:'export const TRANSACTIONS_UPDATED_EVENT="test:transactions";',loader:'ts'}));
}}]});
const module={exports:{}};runInNewContext(built.outputFiles[0].text,{module,exports:module.exports,require:createRequire(import.meta.url),window,document,Event,Error,__api:api,__owner:()=>owner,__native:()=>native,__open:token=>{assert.equal(token,'ephemeral-link-test');return new Promise((resolve,reject)=>finishNative={resolve,reject});}});
const {PlaidConnection}=module.exports;
let root,changes;
const connect=()=>[...document.querySelectorAll('button')].find(node=>node.textContent.includes('Connect Bank'));
async function setup(android=true){owner='test-session';native=android;tokens=[];exchanges=[];changes=0;failToken=false;failExchange=false;window.Plaid={create:config=>{webConfig=config;return {open(){},exit(){}};}};root=createRoot(document.querySelector('#root'));await act(async()=>root.render(createElement(PlaidConnection,{onAccountsChanged:()=>changes++})));}
async function cleanup(){await act(async()=>root.unmount());}
test('Android uses a package-specific token and native Link, then exchanges once and refreshes',async()=>{
 await setup();try{await act(async()=>{connect().click();connect().click();});assert.deepEqual(tokens,['android']);assert.equal(document.querySelector('script[src*="plaid.com"]'),null);assert.equal(connect().disabled,true);assert.equal(exchanges.length,0);
 await act(async()=>finishNative.resolve({status:'success',publicToken:'public-test',metadata:{institution:{institution_id:'ins_test',name:'Test Bank'}}}));assert.equal(exchanges.length,1);assert.equal(exchanges[0][0],'public-test');assert.equal(changes,1);assert.equal(connect().disabled,false);assert.match(document.body.textContent,/Bank connected/);}finally{await cleanup();}
});
test('native cancel creates nothing, and launch/exchange errors allow retry without claiming success',async()=>{
 await setup();try{await act(async()=>connect().click());await act(async()=>finishNative.resolve({status:'cancelled'}));assert.equal(exchanges.length,0);assert.equal(changes,0);assert.equal(connect().disabled,false);
 await act(async()=>connect().click());await act(async()=>finishNative.reject(Error('Plaid could not finish connecting.')));assert.match(document.body.textContent,/could not finish/);assert.equal(changes,0);
 await act(async()=>connect().click());failExchange=true;await act(async()=>finishNative.resolve({status:'success',publicToken:'public-test',metadata:{}}));assert.match(document.body.textContent,/Could not confirm/);assert.equal(changes,0);assert.equal(connect().disabled,false);}finally{await cleanup();}
});
test('website keeps its web SDK flow and ignores duplicate success callbacks',async()=>{
 await setup(false);try{await act(async()=>connect().click());assert.deepEqual(tokens,['web']);await act(async()=>{webConfig.onSuccess('public-web',{});webConfig.onSuccess('public-web',{});webConfig.onExit();});assert.equal(exchanges.length,1);assert.equal(changes,1);assert.equal(connect().disabled,false);}finally{await cleanup();}
});
test('changing sessions during bank authorization never exchanges into the new user account',async()=>{
 await setup();try{await act(async()=>connect().click());owner='another-user';await act(async()=>finishNative.resolve({status:'success',publicToken:'public-test',metadata:{}}));assert.equal(exchanges.length,0);assert.equal(changes,0);assert.match(document.body.textContent,/session changed/);}finally{await cleanup();}
});
