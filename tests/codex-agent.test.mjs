import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { createResearchAgent } from '../lib/agent.mjs';
function mockProcess(events,code=0,check=()=>{}) {
  return (command,args,options)=>{
    check(command,args,options);
    const child=new EventEmitter();child.stdin=new PassThrough();child.stdout=new PassThrough();child.stderr=new PassThrough();
    child.stdin.on('finish',()=>{for(const event of events)child.stdout.write(JSON.stringify(event)+'\n');child.emit('close',code);});
    return child;
  };
}
test('Codex bridge passes prompt through stdin, keeps read-only sandbox and excludes portfolio writes',async()=>{
  const env={FINANCE_CODEX_BIN:'codex.exe',FINANCE_CODEX_MODEL:'configured-model'};
  const run=mockProcess([{type:'thread.started',thread_id:'session-1'},{type:'item.completed',item:{type:'mcp_tool_call',tool:'stock_search'}},{type:'item.completed',item:{type:'agent_message',text:'工具查证完成'}}],0,(cmd,args,opts)=>{
    assert.equal(cmd,'codex.exe');assert.equal(args[args.indexOf('--sandbox')+1],'read-only');assert.ok(!args.includes('--dangerously-bypass-approvals-and-sandbox'));assert.ok(args.includes('configured-model'));
    const enabled=args.find(a=>a.startsWith('mcp_servers.financial.enabled_tools='));assert.match(enabled,/stock_search/);assert.doesNotMatch(enabled,/set_portfolio/);assert.equal(opts.windowsHide,true);assert.equal(args.at(-1),'-');
  });
  const result=await createResearchAgent(null,process.cwd(),['stock_search','set_portfolio'],env,run)('研究AAPL');
  assert.equal(result.text,'工具查证完成');assert.equal(result.sessionId,'session-1');assert.deepEqual(result.tools,['stock_search']);
});
test('Codex bridge rejects errors and unregistered tool requests instead of publishing success',async()=>{
  const agent=createResearchAgent(null,process.cwd(),['stock_search'],{},mockProcess([{type:'turn.failed',error:{message:'authentication required'}}],1));
  await assert.rejects(agent('research'),/authentication required/);
  await assert.rejects(agent('research',{allowedTools:['unknown']}),/未注册/);
});
test('Codex bridge selects gpt-6-sol with high reasoning by default',async()=>{
  const run=mockProcess([{type:'item.completed',item:{type:'agent_message',text:'完成'}}],0,(_cmd,args)=>{
    assert.equal(args[args.indexOf('--model')+1],'gpt-6-sol');
    assert.ok(args.includes('model_reasoning_effort="high"'));
  });
  const result=await createResearchAgent(null,process.cwd(),['stock_search'],{},run)('研究AAPL');
  assert.equal(result.model,'gpt-6-sol');
  assert.equal(result.reasoningEffort,'high');
});
test('Codex bridge applies saved model and effort instead of environment defaults', async () => {
  const run = mockProcess([{type:'item.completed',item:{type:'agent_message',text:'完成'}}], 0, (_cmd, args) => {
    assert.equal(args[args.indexOf('--model') + 1], 'gpt-6-luna');
    assert.ok(args.includes('model_reasoning_effort="low"'));
  });
  const result = await createResearchAgent(null, process.cwd(), [], {FINANCE_CODEX_MODEL:'gpt-6-sol'}, run)('研究', {model:'gpt-6-luna', reasoningEffort:'low'});
  assert.equal(result.model, 'gpt-6-luna');
  assert.equal(result.reasoningEffort, 'low');
});

test('Codex bridge attaches local images separately from the stdin prompt', async () => {
  const path = 'C:/temporary folder/holdings.png';
  const run = mockProcess([{type:'item.completed',item:{type:'agent_message',text:'{"text":"002297 博云新材","issues":[]}'}}], 0, (_cmd, args) => {
    assert.equal(args[args.indexOf('--image') + 1], path);
    assert.equal(args.at(-1), '-');
    assert.equal(args[args.indexOf('--sandbox') + 1], 'read-only');
  });
  const result = await createResearchAgent(null, process.cwd(), [], {}, run)('识别截图', {purpose:'portfolio', allowedTools:[], images:[path]});
  assert.match(result.text, /002297/);
});
