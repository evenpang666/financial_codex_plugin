import { spawnSync } from 'node:child_process';
import { root } from '../lib/runtime.mjs';
import { pythonPath } from '../lib/workers.mjs';
const result=spawnSync(pythonPath(root),['scripts/package_plugin.py'],{cwd:root,stdio:'inherit',windowsHide:true,env:{...process.env,PYTHONUTF8:'1',FINANCE_NODE:process.execPath}});
if(result.error)throw result.error;process.exitCode=result.status||0;
