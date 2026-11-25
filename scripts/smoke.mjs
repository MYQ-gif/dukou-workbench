import fs from 'node:fs';
const CDP='http://127.0.0.1:9334';
const list=await (await fetch(`${CDP}/json/list`)).json();
const page=list.find(t=>t.type==='page'&&/8787|localhost/.test(t.url));
if(!page){console.log('no page target');process.exit(0);}
const ws=new WebSocket(page.webSocketDebuggerUrl);
await new Promise(r=>ws.onopen=r);
let id=0;const pending=new Map();const errors=[];
ws.onmessage=e=>{const m=JSON.parse(e.data);
 if(m.method==='Runtime.exceptionThrown') errors.push('EXC '+(m.params.exceptionDetails?.exception?.description||'').slice(0,160));
 if(m.method==='Runtime.consoleAPICalled'&&m.params.type==='error') errors.push('CONSOLE '+JSON.stringify(m.params.args?.[0]?.value||'').slice(0,160));
 if(m.id&&pending.has(m.id)){pending.get(m.id)(m);pending.delete(m.id);}};
const send=(method,params={})=>new Promise(res=>{const i=++id;pending.set(i,res);ws.send(JSON.stringify({id:i,method,params}));});
const ev=async x=>(await send('Runtime.evaluate',{expression:x,awaitPromise:true,returnByValue:true})).result?.result?.value;
await send('Runtime.enable');await send('Page.enable');
await send('Page.navigate',{url:'http://localhost:8787/?t='+Date.now()});
await new Promise(r=>setTimeout(r,2500));
for (const tab of ['video','ledger','api','image']) {
  await ev(`document.querySelector('.tab[data-tab="${tab}"]').click(); true`);
  await new Promise(r=>setTimeout(r,300));
}
const state = await ev(`JSON.stringify({
  tabs: [...document.querySelectorAll('.tab')].map(t=>t.dataset.tab),
  hasChat: !!document.querySelector('#chat'),
  hasPd: !!document.querySelector('#pd'),
  hasWh: !!document.querySelector('#wh'),
  tiles: document.querySelectorAll('.tile').length,
  body: document.body.innerText.length
})`);
console.log('state', state);
console.log('errors', errors.length ? errors : 'none');
ws.close();
