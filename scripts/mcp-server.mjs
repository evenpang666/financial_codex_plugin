import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import Ajv from 'ajv';
import { createRuntime, researchTools } from '../lib/runtime.mjs';
import { extraTools } from '../lib/plugin-tools.mjs';
const only=process.argv.includes('--tools-only');
let dataRuntime,webRuntime,dataPending,webPending;
async function runtime(web=false) {
  if(web) return webRuntime || (webPending ||= createRuntime({web:true}).then(r=>webRuntime=r).catch(e=>{webPending=null;throw e;}));
  return webRuntime || dataRuntime || (dataPending ||= createRuntime().then(r=>dataRuntime=r).catch(e=>{dataPending=null;throw e;}));
}
const tools=researchTools('http://127.0.0.1:0').map(t=>({...t,execute:async args=>{const r=await runtime();return r.tools.find(tool=>tool.name===t.name).execute(args);}}));
if(!only)tools.push(...extraTools(runtime));
const ajv=new Ajv({strict:false,allErrors:true});
ajv.addFormat('date',/^\d{4}-\d{2}-\d{2}$/);
const validators=new Map(tools.map(t=>[t.name,ajv.compile(t.parameters)]));
const server=new Server({name:'financial-agent',version:'1.0.0'},{capabilities:{tools:{}}});
const mutates=new Set(['set_portfolio','get_daily_research_report','open_financial_workspace','start_financial_job','cancel_financial_job','update_portfolio_holding','delete_portfolio_holding','set_report_schedule']);
server.setRequestHandler(ListToolsRequestSchema,async()=>({tools:tools.map(t=>({name:t.name,description:t.description,inputSchema:t.parameters,annotations:{readOnlyHint:!mutates.has(t.name),destructiveHint:['set_portfolio','delete_portfolio_holding'].includes(t.name),openWorldHint:true}}))}));
server.setRequestHandler(CallToolRequestSchema,async request=>{
  try {
    const {name,arguments:args={}}=request.params,tool=tools.find(t=>t.name===name);
    if(!tool)throw Error(`未知工具：${name}`);
    const validate=validators.get(name);if(!validate(args))throw Error(`参数无效：${ajv.errorsText(validate.errors)}`);
    const result=await tool.execute(args);
    return {content:[{type:'text',text:JSON.stringify(result)}]};
  }catch(e){return {isError:true,content:[{type:'text',text:e.message}]};}
});
let closing=false;
async function close(){if(closing)return;closing=true;for(const r of await Promise.allSettled([dataPending,webPending]))if(r.status==='fulfilled'&&r.value)await r.value.close();await server.close();process.exit(0);}
process.on('SIGINT',close);process.on('SIGTERM',close);process.stdin.on('end',close);
await server.connect(new StdioServerTransport());
