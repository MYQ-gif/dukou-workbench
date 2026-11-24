import fs from 'node:fs';
const CDP='http://127.0.0.1:9334';
const list=await (await fetch(`${CDP}/json/list`)).json();
const page=list.find(t=>t.type==='page'&&/8787/.test(t.url));
const ws=new WebSocket(page.webSocketDebuggerUrl);
await new Promise(r=>ws.onopen=r);
let id=0;const pending=new Map();
ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&pending.has(m.id)){pending.get(m.id)(m);pending.delete(m.id);}};
const send=(method,params={})=>new Promise(res=>{const i=++id;pending.set(i,res);ws.send(JSON.stringify({id:i,method,params}));});
const ev=async x=>(await send('Runtime.evaluate',{expression:x,awaitPromise:true,returnByValue:true})).result?.result?.value;
const shot=async f=>{const r=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(f,Buffer.from(r.result.data,'base64'));console.log('saved',f);};
await send('Network.setCacheDisabled',{cacheDisabled:true});
await send('Page.navigate',{url:'http://localhost:8787/?v='+Date.now()});
await new Promise(r=>setTimeout(r,2800));
await ev(`localStorage.setItem('dukou:theme','light'); location.reload(); true`);
await new Promise(r=>setTimeout(r,2600));

await ev(`document.querySelector('#btnMarket').click(); true`);
await new Promise(r=>setTimeout(r,350));
console.log('groups', await ev(`[...document.querySelectorAll('#mkItems .pf-group')].map(e=>e.textContent).join('/')`));
await shot('docs/preview-market-menu.png');

await ev(`(()=>{const i=document.querySelector('#mkSearch');i.value='泰';i.dispatchEvent(new Event('input'));return true})()`);
await new Promise(r=>setTimeout(r,300));
console.log('filter 泰 →', await ev(`[...document.querySelectorAll('#mkItems .pf-item')].map(e=>e.textContent.trim()).join(' | ')`));
await shot('docs/preview-market-search.png');

await ev(`document.body.click(); document.querySelector('#btnLang').click(); true`);
await new Promise(r=>setTimeout(r,350));
await ev(`(()=>{const i=document.querySelector('#lgSearch');i.value='ar';i.dispatchEvent(new Event('input'));return true})()`);
await new Promise(r=>setTimeout(r,300));
console.log('lang filter ar →', await ev(`[...document.querySelectorAll('#lgItems .pf-item')].map(e=>e.textContent.trim()).join(' | ')`));
await shot('docs/preview-lang-menu.png');
ws.close();
