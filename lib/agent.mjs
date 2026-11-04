import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { DEFAULT_CODEX_MODEL, DEFAULT_REASONING_EFFORT } from './settings.mjs';
export { DEFAULT_CODEX_MODEL } from './settings.mjs';
export function createResearchAgent(_ctx, root, financeTools = [], env = process.env, run = spawn) {
  return (prompt, {signal = AbortSignal.timeout(600000), purpose = 'research', allowedTools = financeTools, images = [], model = env.FINANCE_CODEX_MODEL || DEFAULT_CODEX_MODEL, reasoningEffort = env.FINANCE_CODEX_REASONING_EFFORT || DEFAULT_REASONING_EFFORT} = {}) => new Promise((resolve, reject) => {
    signal.throwIfAborted();
    if (!allowedTools.every(name => financeTools.includes(name))) throw Error('请求了未注册的金融工具。');
    const names = allowedTools.filter(n => n !== 'set_portfolio');
    const config = {'mcp_servers.financial.command': process.execPath, 'mcp_servers.financial.args': [join(root,'scripts/mcp-server.mjs'),'--tools-only'], 'mcp_servers.financial.cwd': root, 'mcp_servers.financial.enabled_tools': names, 'mcp_servers.financial.startup_timeout_sec':90};
    const args=['exec','--skip-git-repo-check','--sandbox','read-only','--json','-C',root];
    for(const [key,value] of Object.entries(config)) args.push('-c',`${key}=${JSON.stringify(value)}`);
    args.push('--model',model);
    args.push('-c', `model_reasoning_effort=${JSON.stringify(reasoningEffort)}`);
    for (const image of images) args.push('--image', image);
    args.push('-');
    const child=run(env.FINANCE_CODEX_BIN || 'codex',args,{cwd:root,env,windowsHide:true,signal,stdio:['pipe','pipe','pipe']});
    let buffer='',text='',stderr='',sessionId,failure; const used=new Set();
    function event(line) {try {const e=JSON.parse(line); if(e.type==='thread.started') sessionId=e.thread_id; if(e.type==='turn.failed'||e.type==='error') failure=e.error?.message||e.message||'Codex 研究失败'; if(e.type==='item.completed'&&e.item?.type==='agent_message') text=e.item.text; if(e.item?.type==='mcp_tool_call')used.add(e.item.tool);}catch{}}
    child.stdout.on('data',chunk=>{buffer+=chunk;let i;while((i=buffer.indexOf('\n'))>=0){event(buffer.slice(0,i));buffer=buffer.slice(i+1);}});
    child.stderr.on('data',chunk=>{stderr=(stderr+chunk).slice(-3000);});
    child.once('error',reject);
    child.once('close',code=>{if(buffer.trim())event(buffer);if(code!==0||failure||!text.trim())return reject(Error(failure||`Codex 未完成研究，请运行 codex login 并检查配置。${stderr}`));resolve({text,sessionId,model,reasoningEffort,provider:'codex',tools:[...used]});});
    child.stdin.on('error',()=>{});
    child.stdin.end((purpose==='portfolio'?'仅提取持仓JSON，不调用写入工具。\n':purpose==='ai_simulation'?'你是知衡模拟策略分析助手。仅分析给定本地证据与策略，不调用额外工具，不执行交易。按指定 JSON 格式回答，缺失数据明确标出。\n':'你是知衡研究助手，先使用 financial 工具查证，再回答。说明来源、as_of、缺失数据，区分评分与概率，不执行交易。\n')+prompt);
  });
}
