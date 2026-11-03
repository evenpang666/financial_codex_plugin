import { readFile } from 'node:fs/promises';
import { findWorkspace } from '../lib/workspace.mjs';
import { root } from '../lib/runtime.mjs';
const state=JSON.parse(await readFile(new URL('../.runtime/web.json',import.meta.url),'utf8').catch(()=>'{"pid":null}'));
if(!state.pid) console.log('工作台未运行。');
else {const current=await findWorkspace(root);if(!current||current.pid!==state.pid)throw Error('无法确认工作台身份，未终止进程。');process.kill(state.pid,'SIGTERM');console.log('已停止知衡工作台。');}
