const PORT = process.env.PORT || '8790';
﻿import fs from 'node:fs';
const CDP='http://127.0.0.1:9334';
const list=await (await fetch(`${CDP}/json/list`)).json();
const page=list.find(t=>t.type==='page'&&new RegExp(String(PORT)).test(t.url));
const ws=new WebSocket(page.webSocketDebuggerUrl);
await new Promise(r=>ws.onopen=r);
let id=0;const pending=new Map();
ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&pending.has(m.id)){pending.get(m.id)(m);pending.delete(m.id);}};
const send=(method,params={})=>new Promise(res=>{const i=++id;pending.set(i,res);ws.send(JSON.stringify({id:i,method,params}));});
const ev=async x=>(await send('Runtime.evaluate',{expression:x,awaitPromise:true,returnByValue:true})).result?.result?.value;
await send('Page.navigate',{url:`http://localhost:${PORT}/`});
await new Promise(r=>setTimeout(r,2500));
for (const t of ['light','dark']) {
  await ev(`localStorage.setItem('dukou:theme','${t}'); location.reload(); true`);
  await new Promise(r=>setTimeout(r,2600));
  const shot=await send('Page.captureScreenshot',{format:'png'});
  fs.writeFileSync(`docs/preview-${t}.png`,Buffer.from(shot.result.data,'base64'));
  console.log(t, await ev(`document.documentElement.dataset.theme`));
}
ws.close();
