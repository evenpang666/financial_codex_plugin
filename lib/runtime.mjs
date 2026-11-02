import { fileURLToPath } from 'node:url';
import { startWorker } from './workers.mjs';
import { apply } from '../engine/tools.mjs';
import { createFinanceServer, listen } from './server.mjs';
import { createResearchAgent, DEFAULT_CODEX_MODEL } from './agent.mjs';
import { startScheduler } from './scheduler.mjs';
export const root = fileURLToPath(new URL('../', import.meta.url));
export function researchTools(baseUrl) {
  const definitions = [];
  apply({tools:{register: value => definitions.push(value)}, skills:{register(){}}}, {baseUrl});
  return definitions;
}
export async function createRuntime({web = false, env = process.env} = {}) {
  const owned = []; let site, stopScheduler;
  const close = async () => {stopScheduler?.(); if(site?.server.listening) await site.close(); for(const worker of owned.reverse())worker.close();};
  try {
    const data = await startWorker(root,'data',env); owned.push(data);
    const tools = researchTools(data.url);
    if(web) {
      const reports = await startWorker(root,'reports',{...env, FINANCE_DATA_URL:data.url}); owned.push(reports);
      site = await createFinanceServer({root,dataUrl:data.url,reportsUrl:reports.url,env,network:env.FINANCE_LAN === '1' ? undefined : null,research:createResearchAgent(null,root,tools.map(t=>t.name),env),model:()=>({model:env.FINANCE_CODEX_MODEL||DEFAULT_CODEX_MODEL})});
      const port = await listen(site.server,env.FINANCE_PORT||3205,site.network ? '0.0.0.0' : '127.0.0.1');
      stopScheduler = startScheduler(root,slot=>site.startJob(slot,{scheduled:true}),async market=>{
        const response=await fetch(data.url+'/v1/trading-day?market='+market,{signal:AbortSignal.timeout(10000)});
        const value=await response.json();if(!response.ok)throw Error(value.error);return value;
      });
      return {tools,site,dataUrl:data.url,url:`http://127.0.0.1:${port}`,close};
    }
    return {tools,dataUrl:data.url,close};
  } catch(error) {await close();throw error;}
}
