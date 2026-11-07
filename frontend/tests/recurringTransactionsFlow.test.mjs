import assert from 'node:assert/strict';
import test from 'node:test';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {runInNewContext} from 'node:vm';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import {act,createElement} from 'react';
const dom=new JSDOM('<div id="root"></div>',{url:'https://finance.example/app',pretendToBeVisual:true});
for(const key of ['window','document','HTMLElement','HTMLInputElement','Event','KeyboardEvent','Node'])globalThis[key]=dom.window[key];
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
globalThis.requestAnimationFrame=fn=>setTimeout(fn,0);globalThis.cancelAnimationFrame=clearTimeout;
const {createRoot}=await import('react-dom/client');
let bills,transactions,connected,statusFails,saves,removes;
const date=new Date(Date.now()+10*86400000).toISOString().slice(0,10);
const account={id:1,name:'Test Checking',bank_name:'Test Bank',account_type:'checking',starting_balance:'100',current_balance:'100'};
const api={getAccounts:async()=>[account],getTransactions:async()=>transactions,getPlaidStatus:async()=>{if(statusFails)throw Error('Synthetic bank-status outage');return {configured:true,connections:connected?[{id:1}]:[]};},getRecurringTransactions:async()=>bills,
createRecurringTransaction:async data=>{saves.push(data);const bill={...data,id:2,last_paid_date:null};bills=[...bills,bill];return bill;},updateRecurringTransaction:async(id,data)=>{saves.push(data);bills=bills.map(b=>b.id===id?{...b,...data}:b);},deleteRecurringTransaction:async id=>{removes.push(id);bills=bills.filter(b=>b.id!==id);}};
const result=await build({stdin:{contents:'export {RecurringTransactionsPage} from "./src/pages/RecurringTransactionsPage";export {NavigationDrawer} from "./src/components/NavigationDrawer";',resolveDir:fileURLToPath(new URL('..',import.meta.url)),loader:'ts'},bundle:true,platform:'node',format:'cjs',packages:'external',write:false,loader:{'.css':'empty'},plugins:[{name:'synthetic-api',setup(builder){
for(const [file,names] of [['accounts',['getAccounts']],['transactions',['getTransactions']],['plaid',['getPlaidStatus']],['recurringTransactions',['getRecurringTransactions','createRecurringTransaction','updateRecurringTransaction','deleteRecurringTransaction']]])builder.onLoad({filter:new RegExp('[\\\\/]api[\\\\/]'+file+'\\.ts$')},()=>({contents:names.map(name=>`export const ${name}=(...args)=>globalThis.__api.${name}(...args);`).join('\n')+(file==='transactions'?'\nexport const TRANSACTIONS_UPDATED_EVENT="test:transactions";':''),loader:'ts'}));
}}]});
const module={exports:{}};runInNewContext(result.outputFiles[0].text,{module,exports:module.exports,require:createRequire(import.meta.url),window,document,HTMLElement,Event,Error,requestAnimationFrame,cancelAnimationFrame,__api:api});
const {RecurringTransactionsPage,NavigationDrawer}=module.exports;
let root,opened;
const button=(text,scope=document)=>[...scope.querySelectorAll('button')].find(node=>node.textContent.trim()===text);
async function click(node){assert.ok(node);await act(async()=>node.click());}
async function setup(){statusFails=false;connected=true;saves=[];removes=[];opened=0;bills=[{id:1,name:'Internet plan',account_id:1,amount:'49.00',category:'Housing',transaction_type:'expense',frequency:'monthly',next_due_date:date,note:null,auto_pay_status:true,reminder_settings:[],last_paid_date:null}];transactions=[['Netflix','15.99'],['Spotify','11.99']].map(([note,amount],i)=>({id:i+1,account_id:1,note,amount,transaction_type:'expense',transaction_date:date,receipt_metadata:{source:'plaid'}}));root=createRoot(document.querySelector('#root'));}
async function show(){await act(async()=>root.render(createElement(RecurringTransactionsPage,{onOpenAccounts:()=>opened++})));}
async function cleanup(){await act(async()=>root.unmount());}
async function input(label,value){const node=[...document.querySelector('[role="dialog"]').querySelectorAll('label')].find(n=>n.textContent.includes(label))?.querySelector('input');assert.ok(node,label);await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(node,value);node.dispatchEvent(new Event('input',{bubbles:true}));});}
test('More menu opens Recurring Transactions without removing existing destinations',async()=>{
 await setup();let destination,closed=0;try{await act(async()=>root.render(createElement(NavigationDrawer,{isOpen:true,onClose:()=>closed++,onNavigate:page=>destination=page,onLogout:()=>{}})));for(const name of ['Accounts','Split Bill','Goals','Settings','Help'])assert.ok(button(name));await click(button('Recurring Transactions'));assert.equal(destination,'recurring');assert.equal(closed,1);}finally{await cleanup();}
});
test('recurring page shows synced subscription estimates and preserves reminder create/edit/delete',async()=>{
 await setup();try{await show();assert.equal(document.querySelector('h1').textContent,'Recurring Transactions');assert.match(document.body.textContent,/Detected subscriptions2/);assert.match(document.body.textContent,/\$27\.98/);assert.match(document.body.textContent,/Internet plan/);assert.equal(saves.length,0);
 assert.equal(document.querySelector('[data-summary="monthly"] strong').textContent,'$49.00');
 await click(button('Add Bill or Subscription'));await input('Name','Music reminder');await input('Amount','12.00');await act(async()=>document.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));assert.equal(saves.length,1);assert.equal(bills.length,2);assert.equal(transactions.length,2);assert.match(document.body.textContent,/Music reminder/);assert.equal(document.querySelector('[data-summary="monthly"] strong').textContent,'$61.00');
 await click(button('Edit',[...document.querySelectorAll('.bill-card')].find(card=>card.textContent.includes('Internet plan'))));await input('Amount','50.00');await act(async()=>document.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));assert.equal(saves.length,2);assert.equal(bills[0].amount,'50.00');assert.equal(transactions.length,2);assert.equal(document.querySelector('[data-summary="monthly"] strong').textContent,'$62.00');
 await click(document.querySelector('[aria-label="Delete Music reminder"]'));assert.deepEqual(removes,[2]);assert.equal(bills.length,1);assert.equal(transactions.length,2);assert.equal(document.querySelector('[data-summary="monthly"] strong').textContent,'$50.00');}finally{await cleanup();}
});
test('bank-status failure leaves saved bills accessible and subscriptions can be retried',async()=>{
 await setup();statusFails=true;try{await show();assert.match(document.body.textContent,/Internet plan/);assert.ok(button('Add Bill or Subscription'));assert.ok(button('Retry subscriptions'));assert.doesNotMatch(document.body.textContent,/Detected subscriptions0/);statusFails=false;await click(button('Retry subscriptions'));assert.match(document.body.textContent,/\$27\.98/);}finally{await cleanup();}
});
test('disconnected users get a working Accounts action rather than invented subscriptions',async()=>{
 await setup();connected=false;transactions=[];bills=[];try{await show();assert.match(document.body.textContent,/Connect a bank in Accounts/);assert.doesNotMatch(document.body.textContent,/Detected subscriptions0/);await click(button('Go to Accounts'));assert.equal(opened,1);}finally{await cleanup();}
});
test('loading uses the new card skeletons without displaying invented financial values',async()=>{
 await setup();const original=api.getRecurringTransactions;let resolve;
 api.getRecurringTransactions=()=>new Promise(done=>resolve=done);
 try{await show();assert.equal(document.querySelector('.recurring-page').getAttribute('aria-busy'),'true');assert.equal(document.querySelectorAll('.rt-loading-card').length,4);assert.doesNotMatch(document.body.textContent,/\$0\.00/);await act(async()=>resolve(bills));assert.equal(document.querySelector('[data-summary="monthly"] strong').textContent,'$49.00');}finally{api.getRecurringTransactions=original;await cleanup();}
});
test('failed saved-bill loading is unavailable rather than a false zero or empty account',async()=>{
 await setup();const original=api.getRecurringTransactions;api.getRecurringTransactions=async()=>{throw Error('Synthetic schedule outage');};
 try{await show();assert.equal(document.querySelector('[data-summary="monthly"] strong').textContent,'—');assert.match(document.body.textContent,/Saved bills are unavailable/);assert.ok(button('Retry bills'));assert.equal(button('Add Your First Bill'),undefined);api.getRecurringTransactions=original;await click(button('Retry bills'));assert.equal(document.querySelector('[data-summary="monthly"] strong').textContent,'$49.00');}finally{api.getRecurringTransactions=original;await cleanup();}
});
