import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { root } from './runtime.mjs';
const market = {type:'string',enum:['a','hk','us']};
const schema = (properties={},required=[]) => ({type:'object',properties,required,additionalProperties:false});
export function extraTools(getRuntime) {
  async function web(path, options={}) {
    const r=await getRuntime(true);
    const response=await fetch(r.url+path,{...options,signal:AbortSignal.timeout(300000)});
    const value=await response.json();if(!response.ok)throw Error(value.error||`HTTP ${response.status}`);return value;
  }
  const definition=(name,description,parameters,execute)=>({name,description,parameters,execute});
  return [
    definition('open_financial_workspace','启动本地研究、日报、回测和训练工作台，返回可打开的地址。',schema(),async()=>({url:(await getRuntime(true)).url})),
    definition('start_financial_job','开始异步研究、日报、策略回测或模型训练。返回任务ID，用 get_financial_jobs 观察结果。A股原有盘中策略；美股使用独立日线策略并显式传 market=us 与 symbols。',schema({kind:{type:'string',enum:['research','daily','backtest','train']},market,session:{type:'string',enum:['morning','afternoon']},prompt:{type:'string',maxLength:6000},strategy:{type:'string'},start:{type:'string',format:'date'},end:{type:'string',format:'date'},slot:{type:'string'},symbols:{type:'array',items:{type:'string'},maxItems:50},parameters:{type:'object',additionalProperties:{type:'number'}}},['kind']),input=>web('/api/jobs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)})),
    definition('get_financial_jobs','读取已保存的任务、状态、进度与研究结果。',schema(),()=>web('/api/jobs')),
    definition('cancel_financial_job','取消指定正在运行的研究或计算任务。',schema({id:{type:'string',pattern:'^[a-f0-9-]+$'}},['id']),({id})=>web(`/api/jobs/${id}/cancel`,{method:'POST'})),
    definition('list_financial_reports','列出本地已归档日报。',schema(),()=>web('/api/reports')),
    definition('read_financial_report','读取指定日报正文。',schema({id:{type:'string',pattern:'^\\d{4}-\\d{2}-\\d{2}(?:-(?:a|hk|us)-(?:morning|afternoon))?$'}},['id']),async({id})=>({id,markdown:await readFile(join(root,'data/reports',id+'.md'),'utf8')})),
    definition('list_backtest_results','列出已归档的策略回测结果。',schema(),()=>web('/api/backtests')),
    definition('update_portfolio_holding','修改单条本地研究持仓的股数，不影响其他条目。',schema({market,symbol:{type:'string'},shares:{type:'number',exclusiveMinimum:0,maximum:1e12}},['market','symbol','shares']),({market,symbol,shares})=>web(`/api/portfolio/${market}/${encodeURIComponent(symbol)}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({shares})})),
    definition('delete_portfolio_holding','删除一条本地研究持仓。',schema({market,symbol:{type:'string'}},['market','symbol']),({market,symbol})=>web(`/api/portfolio/${market}/${encodeURIComponent(symbol)}`,{method:'DELETE'})),
    definition('get_report_schedule','读取日报调度配置；美股按纽约时间与夏令时执行，需工作台保持运行。',schema(),async()=>JSON.parse(await readFile(join(root,'config/daily-push.json'),'utf8').catch(()=>'{"enabled":true,"markets":["a"]}'))),
    definition('set_report_schedule','保存本地日报调度配置，不设置外部消息推送。',schema({enabled:{type:'boolean'},markets:{type:'array',items:market,minItems:1,uniqueItems:true},market_schedules:{type:'object',additionalProperties:false,properties:Object.fromEntries(['a','hk','us'].map(m=>[m,schema({morning:{type:'string',pattern:'^(?:[01]\\d|2[0-3]):[0-5]\\d$'},afternoon:{type:'string',pattern:'^(?:[01]\\d|2[0-3]):[0-5]\\d$'}},['morning','afternoon'])]))}},['enabled','markets']),async input=>{await mkdir(join(root,'config'),{recursive:true});const path=join(root,'config/daily-push.json');await writeFile(path+'.tmp',JSON.stringify(input,null,2));await rename(path+'.tmp',path);return {saved:true,...input};}),
  ];
}
