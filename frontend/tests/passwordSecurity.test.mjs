import assert from 'node:assert/strict';
import test from 'node:test';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {runInNewContext} from 'node:vm';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import {act,createElement} from 'react';

const dom=new JSDOM('<div id="root"></div>',{url:'https://finance.example',pretendToBeVisual:true});
for(const key of ['window','document','HTMLElement','HTMLInputElement','Event','Node'])globalThis[key]=dom.window[key];
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const {createRoot}=await import('react-dom/client');
let calls=[],release;
const api={register:(...args)=>{calls.push(args);return new Promise(resolve=>{release=()=>resolve({access_token:'test-token',user:{id:1,name:'Example'}});});}};
const result=await build({stdin:{contents:'export * from "./src/domain/passwordStrength";export {RegisterPage} from "./src/pages/RegisterPage";',resolveDir:fileURLToPath(new URL('..',import.meta.url)),loader:'ts'},bundle:true,platform:'node',format:'cjs',packages:'external',write:false,loader:{'.css':'empty'},plugins:[{name:'mock-auth',setup(builder){builder.onLoad({filter:/[\\/]api[\\/]auth\.ts$/},()=>({contents:'export const register=(...args)=>globalThis.__api.register(...args);',loader:'ts'}));}}]});
const module={exports:{}};
runInNewContext(result.outputFiles[0].text,{module,exports:module.exports,require:createRequire(import.meta.url),window,document,setTimeout,clearTimeout,__api:api});
const {passwordProblem,assessPassword,PASSWORD_LABELS,RegisterPage}=module.exports;
const strong='Copper lantern orbit meadow 7249!';

test('local estimator rejects weak patterns and personal words; accepts long Unicode passphrases',()=>{
 for(const value of ['123456789012345','passwordpasswordpassword','qwertyuiopasdfghjkl','short'])assert.ok(passwordProblem(value));
 assert.equal(passwordProblem(strong),'');assert.ok(assessPassword(strong).score>=3);
 assert.ok(passwordProblem(strong,[strong]));
 const unicode=Array.from('cello 粲 orbit 🪐 meadow lantern '.repeat(6)).slice(0,128).join('');
 assert.equal(assessPassword(unicode).length,128);assert.equal(passwordProblem(unicode),'');assert.ok(passwordProblem(unicode+'x'));
 assert.deepEqual(Array.from(PASSWORD_LABELS),['Very weak','Weak','Fair','Strong','Very strong']);
});

test('registration blocks mismatches/weak passwords, supports visibility and sends exactly one confirmed request',async()=>{
 calls=[];let signedIn=0;const root=createRoot(document.querySelector('#root'));
 const field=label=>[...document.querySelectorAll('label')].find(node=>node.textContent.trim()===label)?.querySelector('input');
 const input=async(node,value)=>{assert.ok(node);await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(node,value);node.dispatchEvent(new Event('input',{bubbles:true}));});};
 const submit=async()=>act(async()=>document.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 try{
  await act(async()=>root.render(createElement(RegisterPage,{onRegister:()=>{signedIn++;},onShowLogin:()=>{}})));
  await input(field('Full Name'),'Example User');await input(field('Email'),'example@example.test');
  await input(document.querySelector('input[type="tel"]'),'2025550100');
  await input(field('Password'),strong);await input(field('Confirm Password'),strong+'x');await submit();
  assert.match(document.body.textContent,/Passwords do not match/);assert.equal(calls.length,0);
  await input(field('Password'),'123456789012345');await input(field('Confirm Password'),'123456789012345');await submit();assert.equal(calls.length,0);
  await input(field('Password'),strong);await input(field('Confirm Password'),strong);
  assert.equal(field('Password').autocomplete,'new-password');assert.equal(field('Confirm Password').autocomplete,'new-password');
  const toggle=document.querySelector('button[aria-label="Show password"]');await act(async()=>toggle.click());assert.equal(field('Password').type,'text');
  await act(async()=>new Promise(resolve=>setTimeout(resolve,170)));
  assert.ok(Number(document.querySelector('[role="meter"]').getAttribute('aria-valuenow'))>=3);
  assert.equal(document.querySelectorAll('.password-strength-bars span').length,5);
  await submit();await submit();assert.equal(calls.length,1);assert.deepEqual(calls[0].slice(3),[strong,strong]);assert.equal(signedIn,0);
  await act(async()=>release());assert.equal(signedIn,1);
 }finally{await act(async()=>root.unmount());}
});
