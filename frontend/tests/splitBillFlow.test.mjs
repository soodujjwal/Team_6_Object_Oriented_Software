import assert from 'node:assert/strict';
import test from 'node:test';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {runInNewContext} from 'node:vm';
import {JSDOM} from 'jsdom';
import {build} from 'esbuild';
import {act,createElement} from 'react';
const dom=new JSDOM('<div id="root"></div>',{url:'https://finance.example',pretendToBeVisual:true});
for(const key of ['window','document','HTMLElement','HTMLInputElement','Event','MouseEvent','KeyboardEvent','Node'])globalThis[key]=dom.window[key];
globalThis.requestAnimationFrame=callback=>setTimeout(callback,0);globalThis.cancelAnimationFrame=clearTimeout;globalThis.IS_REACT_ACT_ENVIRONMENT=true;
HTMLElement.prototype.scrollIntoView=function(){};
const {createRoot}=await import('react-dom/client');
const require=createRequire(import.meta.url);
let friends,groups,bills,calls,failSave,repaymentCalls,deleteCalls,failRepayment,failDelete;
const api={getFriends:async()=>friends,getFriendGroups:async()=>groups.map(group=>({...group,friend_ids:[...group.friend_ids]})),getSplitBills:async()=>bills,
  getRepaymentOptions:async()=>({accounts:[{id:1,name:'Checking'}],transactions:[]}),
  markSplitPaid:async(id,personId,payload)=>{repaymentCalls.push({id,personId,payload});if(failRepayment)throw Error('Repayment failed; retry.');const current=bills.find(bill=>bill.id===id);const bill={...current,repayments:{...current.repayments,[personId]:{paid:true,received:'23.33',remaining:'0.00',needs_review:false}}};bills=bills.map(row=>row.id===id?bill:row);return bill;},
  deleteSplitBill:async id=>{deleteCalls.push(id);if(failDelete)throw Error('Delete failed; retry.');bills=bills.filter(bill=>bill.id!==id);},
  addFriend:async name=>{const friend={id:friends.length+1,name};friends.push(friend);return friend;},
  saveFriendGroup:async(name,ids)=>{const group={id:String(groups.length+1),name,friend_ids:ids};groups.push(group);return group;},
  saveSplitBill:async(data,id)=>{calls.push(JSON.parse(JSON.stringify(data)));if(failSave)throw Error('Save failed; retry.');const bill={id:id??bills.length+1,data:JSON.parse(JSON.stringify(data)),calculation:calculateBill(data)};bills=[bill,...bills.filter(row=>row.id!==bill.id)];return bill;}};
const result=await build({stdin:{contents:'export {SplitBillPage} from "./src/pages/SplitBillPage";export {calculateBill} from "./src/domain/splitBill";',resolveDir:fileURLToPath(new URL('..',import.meta.url)),loader:'ts'},bundle:true,platform:'node',format:'cjs',packages:'external',write:false,loader:{'.css':'empty'},plugins:[{name:'mock-api',setup(builder){
 builder.onLoad({filter:/[\\/]api[\\/]splitBills\.ts$/},()=>({contents:Object.keys(api).map(name=>`export const ${name}=(...args)=>globalThis.__api.${name}(...args);`).join('\n'),loader:'ts'}));
 builder.onLoad({filter:/[\\/]api[\\/]accounts\.ts$/},()=>({contents:'export const getAccounts=async()=>[];',loader:'ts'}));
 builder.onLoad({filter:/[\\/]api[\\/]transactions\.ts$/},()=>({contents:'export const getTransactions=async()=>[];export const TRANSACTIONS_UPDATED_EVENT="test:transactions";',loader:'ts'}));
 builder.onLoad({filter:/[\\/]services[\\/]splitReceipt\.ts$/},()=>({contents:'export const scanSplitReceipt=async()=>{};',loader:'ts'}));
}}]});
const module={exports:{}};runInNewContext(result.outputFiles[0].text,{module,exports:module.exports,require,document,window,HTMLElement,requestAnimationFrame,cancelAnimationFrame,crypto,URL,Intl,Error,__api:api});
const {SplitBillPage,calculateBill}=module.exports;
const dialog=()=>document.querySelector('[role="dialog"]');
const button=(text,scope=document)=>[...scope.querySelectorAll('button')].find(node=>node.textContent.trim()===text);
async function click(node){assert.ok(node,'Control exists');await act(async()=>node.click());}
async function input(label,value){const node=[...dialog().querySelectorAll('label')].find(node=>node.textContent.includes(label))?.querySelector('input');assert.ok(node,label);await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(node,value);node.dispatchEvent(new Event('input',{bubbles:true}));});}
async function submit(){await act(async()=>dialog().querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));}
let root;
async function setup(){friends=[{id:1,name:'Alex'},{id:2,name:'Sam'}];groups=[{id:'weekend',name:'Weekend friends',friend_ids:[1,2]}];bills=[];calls=[];repaymentCalls=[];deleteCalls=[];failRepayment=false;failDelete=false;failSave=false;root=createRoot(document.querySelector('#root'));await act(async()=>root.render(createElement(SplitBillPage,{userName:'You'})));}
async function cleanup(){await act(async()=>root.unmount());}
async function addItem(name,price){await click(button('Add an item'));await input('Item name',name);await input('Unit price',price);await submit();}
async function prepare(){await click(button('Groups'));await click(document.querySelector('.sb-group-entry'));await addItem('Dinner','20.00');await click([...document.querySelectorAll('.sb-item .sb-assignment')].find(node=>node.textContent==='Alex').querySelector('input'));await addItem('Dessert','10.00');await click([...document.querySelectorAll('.sb-item')].find(node=>node.textContent.includes('Dessert')).querySelector('.sb-everyone'));await click(button('Review receipt'));await input('Restaurant','Friday dinner');await input('Receipt total','30.00');await click(button('Done',dialog()));}

test('save and new split archives item assignments and clears participants without deleting friends/groups',async()=>{
 await setup();try{await prepare();assert.equal(calls.length,0);await click(button('Save & new split'));assert.equal(calls.length,1);assert.equal(document.querySelectorAll('.sb-people .sb-chip').length,1);assert.equal(document.querySelectorAll('.sb-item').length,0);assert.equal(friends.length,2);assert.equal(groups.length,1);assert.equal(bills.length,1);assert.equal('paid' in bills[0],false);assert.equal(bills[0].calculation.allocated,3000);assert.deepEqual(calls[0].items[0].people,['friend-1']);assert.deepEqual(calls[0].items[1].people,['self','friend-1','friend-2']);
 await click(button('Past splits'));await click(document.querySelector('.sb-history-entry'));assert.equal(document.querySelectorAll('.sb-people .sb-chip').length,3);assert.equal(document.querySelectorAll('.sb-item').length,2);await click(button('New split'));assert.equal(calls.length,1);await click(button('Groups'));await click(document.querySelector('.sb-group-entry'));assert.equal(document.querySelectorAll('.sb-people .sb-chip').length,3);assert.equal(bills[0].data.title,'Friday dinner');}finally{await cleanup();}
});
test('saved friends can form a reusable group without re-adding names',async()=>{
 await setup();try{await click(button('Add Friend'));const option=[...dialog().querySelectorAll('.sb-saved-friend')].find(node=>node.textContent==='Alex');await click(option.querySelector('input'));await click(button('Done',dialog()));await click(button('Groups'));await input('Group name','Lunch crew');await submit();assert.deepEqual(groups.at(-1).friend_ids,[1]);assert.equal(friends.length,2);await click(button('New split'));await click(button('Groups'));await click([...document.querySelectorAll('.sb-group-entry')].find(node=>node.textContent.includes('Lunch crew')));assert.equal(document.querySelectorAll('.sb-people .sb-chip').length,2);assert.equal(calls.length,0);}finally{await cleanup();}
});
test('incomplete or failed saves keep the current people and receipt intact',async()=>{
 await setup();try{await addItem('Dinner','20.00');await click(button('Save & new split'));assert.equal(calls.length,0);assert.equal(document.querySelectorAll('.sb-item').length,1);assert.match(document.body.textContent,/current split has been kept/);}finally{await cleanup();}
 await setup();try{await prepare();failSave=true;await click(button('Save & new split'));assert.equal(calls.length,1);assert.equal(bills.length,0);assert.equal(document.querySelectorAll('.sb-item').length,2);assert.equal(document.querySelectorAll('.sb-people .sb-chip').length,3);assert.match(document.body.textContent,/Save failed/);}finally{await cleanup();}
});


test('Mark as Paid confirms the receiving account, records once, and restores paid status from history',async()=>{
 await setup();try{await prepare();assert.equal(button('Mark as Paid').disabled,true);await click(button('Split Bill'));assert.equal(calls.length,1);assert.equal(document.querySelectorAll('.sb-share').length,3);assert.equal(button('Mark as Paid').disabled,false);
 await click(button('Mark as Paid'));assert.match(dialog().textContent,/Record \$23.33 received from Alex/);assert.equal(repaymentCalls.length,0);await click(button('Cancel',dialog()));assert.equal(repaymentCalls.length,0);
 await click(button('Mark as Paid'));await click(button('Confirm repayment',dialog()));assert.equal(repaymentCalls.length,1);assert.equal(repaymentCalls[0].personId,'friend-1');assert.equal(repaymentCalls[0].payload.account_id,1);assert.ok(repaymentCalls[0].payload.request_id);assert.equal(button('Paid').disabled,true);
 await click(button('New split'));await click(button('Past splits'));await click(document.querySelector('.sb-history-entry'));assert.equal(button('Paid').disabled,true);assert.equal(repaymentCalls.length,1);assert.equal(bills[0].calculation.allocated,3000);}finally{await cleanup();}
});

test('deleting a saved split requires confirmation and clears it from the list',async()=>{
 await setup();try{await prepare();await click(button('Split Bill'));await click(button('Past splits'));await click(document.querySelector('[aria-label="Delete split: Friday dinner"]'));assert.match(dialog().textContent,/recorded repayments will be kept/);await click(button('Cancel',dialog()));assert.equal(deleteCalls.length,0);assert.equal(bills.length,1);
 await click(button('Delete split'));await click(button('Delete split',dialog()));assert.deepEqual(deleteCalls,[1]);assert.equal(bills.length,0);assert.equal(friends.length,2);assert.equal(document.querySelectorAll('.sb-item').length,0);await click(button('Past splits'));assert.match(dialog().textContent,/No saved splits yet/);}finally{await cleanup();}
});

test('failed repayment and deletion keep the split and show retryable errors',async()=>{
 await setup();try{await prepare();await click(button('Split Bill'));await click(button('Mark as Paid'));failRepayment=true;await click(button('Confirm repayment',dialog()));assert.match(dialog().textContent,/Repayment failed/);assert.equal(bills[0].repayments,undefined);const requestId=repaymentCalls[0].payload.request_id;failRepayment=false;await click(button('Confirm repayment',dialog()));assert.equal(repaymentCalls[1].payload.request_id,requestId);assert.equal(button('Paid').disabled,true);
 await click(button('Delete split'));failDelete=true;await click(button('Delete split',dialog()));assert.match(dialog().textContent,/Delete failed/);assert.equal(bills.length,1);failDelete=false;await click(button('Delete split',dialog()));assert.equal(bills.length,0);}finally{await cleanup();}
});
