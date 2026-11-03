import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { readFile } from 'node:fs/promises';
import { researchTools } from '../lib/runtime.mjs';
import { scheduleSlots } from '../lib/scheduler.mjs';
import { parsePortfolio } from '../lib/portfolio.mjs';

test('all 21 original tool names and market enums are retained',async()=>{
  const tools=researchTools('http://127.0.0.1:1');assert.equal(tools.length,21);
  for(const tool of tools)if(tool.parameters.properties.market)assert.deepEqual(tool.parameters.properties.market.enum,['a','hk','us']);
  const manifest=JSON.parse(await readFile('.codex-plugin/plugin.json','utf8'));
  assert.equal(manifest.skills,'./skills/');assert.equal(manifest.mcpServers,'./.mcp.json');
});
test('US schedules use New York dates and DST, never Beijing trading dates',()=>{
  const config={markets:['us']};
  assert.equal(scheduleSlots(config,new Date('2026-07-06T13:20:00Z'))[0].key,'2026-07-06:us:morning');
  assert.equal(scheduleSlots(config,new Date('2026-01-06T14:20:00Z'))[0].key,'2026-01-06:us:morning');
  assert.equal(scheduleSlots(config,new Date('2026-07-06T19:30:00Z'))[0].key,'2026-07-06:us:afternoon');
  assert.equal(scheduleSlots(config,new Date('2026-07-06T01:20:00Z')).length,0);
});
test('US portfolio parses literal class tickers and fractional shares',()=>{
  const text='美股 BRK.B 1.5股';
  assert.deepEqual(parsePortfolio(text,JSON.stringify({holdings:[{market:'us',symbol:'BRK-B',quantity:'1.5股',source:text}],issues:[]})),[{market:'us',symbol:'BRK-B',shares:1.5}]);
  assert.throws(()=>parsePortfolio('美股 MSFT 1股',JSON.stringify({holdings:[{market:'us',symbol:'AAPL',quantity:'1股',source:'美股 MSFT 1股'}],issues:[]})));
});
test('real stdio MCP handshake, tool discovery, schema rejection and Python calendar call', {timeout:90000},async t=>{
  const transport=new StdioClientTransport({command:process.execPath,args:['scripts/mcp-server.mjs'],cwd:process.cwd(),stderr:'pipe',env:{...process.env,PYTHONIOENCODING:'utf-8',FINANCE_WEB_AUTOSTART:'0'}});
  const client=new Client({name:'financial-test',version:'1.0.0'});
  t.after(()=>client.close());await client.connect(transport);
  const listed=await client.listTools();assert.equal(listed.tools.length,32);
  const invalid=await client.callTool({name:'get_quote_snapshot',arguments:{symbol:'AAPL',market:'bogus'}});assert.equal(invalid.isError,true);
  const traversal=await client.callTool({name:'read_financial_report',arguments:{id:'../../secret'}});assert.equal(traversal.isError,true);
  const value=await client.callTool({name:'get_trading_day',arguments:{market:'us',date:'2026-07-03'}});
  assert.ok(!value.isError,JSON.stringify(value));assert.equal(JSON.parse(value.content[0].text).is_trading_day,false);
});
