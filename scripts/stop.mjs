import { readFile } from 'node:fs/promises';
const state=JSON.parse(await readFile(new URL('../.runtime/web.json',import.meta.url),'utf8').catch(()=>'{"pid":null}'));
if(!state.pid) console.log('工作台未运行。');
else {const r=await fetch(state.url+'/api/status',{signal:AbortSignal.timeout(2000)});if(!r.ok||(await r.json()).name!=='codex-financial')throw Error('无法确认工作台身份，未终止进程。');process.kill(state.pid,'SIGTERM');console.log('已停止知衡工作台。');}
