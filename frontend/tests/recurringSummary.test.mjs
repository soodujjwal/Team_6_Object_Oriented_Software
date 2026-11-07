import assert from 'node:assert/strict';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
const result=await build({entryPoints:[fileURLToPath(new URL('../src/domain/recurringSummary.ts',import.meta.url))],bundle:true,platform:'node',format:'esm',write:false});
const {summarizeRecurringBills}=await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
const today=new Date(2026,10,7);
let id=0;
const bill=(changes={})=>({id:++id,name:'Saved bill',account_id:1,amount:'10.00',category:'Subscriptions',transaction_type:'expense',frequency:'monthly',next_due_date:'2026-11-17',last_paid_date:null,auto_pay_status:false,...changes});
test('no saved schedules gives real zero summaries and no invented next payment',()=>{
 assert.deepEqual(summarizeRecurringBills([],today),{monthlyTotal:0,activeSubscriptions:0,upcomingThisMonth:0,nextPayment:null});
});
test('monthly estimate annualizes weekly expenses, ignores income, and includes manual-pay schedules',()=>{
 const summary=summarizeRecurringBills([bill({amount:'100.00',category:'Housing'}),bill({amount:'12.00',frequency:'weekly'}),bill({amount:'25.00',next_due_date:'2026-12-05'}),bill({amount:'2000.00',transaction_type:'income'})],today);
 assert.equal(summary.monthlyTotal,177);assert.equal(summary.activeSubscriptions,2);assert.equal(summary.upcomingThisMonth,2);
});
test('upcoming and next payment exclude past dates and already-paid cycles; today is included',()=>{
 const dueToday=bill({amount:'15.00',next_due_date:'2026-11-07'});
 const summary=summarizeRecurringBills([bill({next_due_date:'2026-11-01'}),bill({next_due_date:'2026-11-10',last_paid_date:'2026-11-10'}),bill({next_due_date:'2026-12-01'}),dueToday],today);
 assert.equal(summary.upcomingThisMonth,1);assert.equal(summary.nextPayment.id,dueToday.id);assert.equal(summary.nextPayment.amount,'15.00');
});
test('cent-based aggregation rounds only after monthly normalization',()=>{
 assert.equal(summarizeRecurringBills([bill({amount:'0.10'}),bill({amount:'0.20'})],today).monthlyTotal,.30);
 assert.equal(summarizeRecurringBills([bill({amount:'0.01',frequency:'weekly'}),bill({amount:'0.01',frequency:'weekly'}),bill({amount:'0.01',frequency:'weekly'})],today).monthlyTotal,.13);
});
test('invalid or unsafe display totals are unavailable instead of silently showing zero',()=>{
 for(const amount of ['NaN','-10','0.001','999999999999999999.99'])assert.equal(summarizeRecurringBills([bill({amount})],today).monthlyTotal,null);
});
