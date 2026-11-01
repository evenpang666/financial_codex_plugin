import { createRuntime, root } from '../lib/runtime.mjs';
import { mkdir, writeFile, readFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
const stateFile=join(root,'.runtime/web.json');
async function existingStudio(){try{const state=JSON.parse(await readFile(stateFile,'utf8'));const r=await fetch(state.url+'/api/status',{signal:AbortSignal.timeout(2000)});return r.ok&&(await r.json()).name==='codex-financial'?state:null;}catch{return null;}}
const existing=await existingStudio();
if(existing)console.log(`知衡已运行：${existing.url}`);
else{
 const runtime=await createRuntime({web:true});
 await mkdir(join(root,'.runtime'),{recursive:true});await writeFile(stateFile,JSON.stringify({pid:process.pid,url:runtime.url,name:'codex-financial'}));
 console.log(`知衡 Codex 工作台：${runtime.url}`);
 let closing=false;const close=async()=>{if(closing)return;closing=true;await runtime.close();await unlink(stateFile).catch(()=>{});process.exit(0);};process.on('SIGINT',close);process.on('SIGTERM',close);
 if(!process.argv.includes('--no-open')){const [cmd,args]=process.platform==='win32'?['rundll32.exe',['url.dll,FileProtocolHandler',runtime.url]]:process.platform==='darwin'?['open',[runtime.url]]:['xdg-open',[runtime.url]];const child=spawn(cmd,args,{windowsHide:true,stdio:'ignore'});child.on('error',()=>{});child.unref();}
}
