import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir, mkdtemp, rm, readFile, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {advanceSimulation, createPaperTrading} from '../lib/paper-trading.mjs';

const now = new Date('2026-11-04T02:00:00Z');
const snapshot = (overrides = {}) => ({day: '2026-11-04', marketOpen: true,
  quotes: [{symbol: '600001', price: 10, as_of: now.toISOString()}, {symbol: '600002', price: 20, as_of: now.toISOString()}],
  signals: {asOf: '2026-11-03', topN: 1, rows: [{symbol:'600001',score:1,entry:true}, {symbol:'600002',score:0,entry:false}]}, ...overrides});
const ledger = () => ({market:'a', initialEquity:20000, cash:0, costs:0, positions:[{symbol:'600001',shares:1000,price:10},{symbol:'600002',shares:500,price:20}], trades:[], history:[]});

test('daily rebalance sells before buying, respects cash and lots, and includes costs in cumulative returns', () => {
  const row = advanceSimulation(ledger(), snapshot(), now);
  assert.deepEqual(row.trades.map(trade => trade.side), ['sell','buy']);
  assert.deepEqual(row.positions.map(position => position.shares), [1900,0]);
  assert.ok(row.cash >= 0); assert.ok(row.costs > 0);
  assert.ok(Math.abs(row.profit + row.costs) < 1e-6);
  assert.ok(Math.abs(row.totalReturn - (row.equity / row.initialEquity - 1)) < 1e-10);
  const trades = structuredClone(row.trades);
  advanceSimulation(row, snapshot({quotes:[{symbol:'600001',price:11,as_of:now.toISOString()},{symbol:'600002',price:20,as_of:now.toISOString()}]}), now);
  assert.deepEqual(row.trades, trades); assert.ok(row.profit > 0);
  assert.match(row.note,/今日已调仓/);
});

test('closed sessions, stale quotes, incomplete and future signals never change positions', () => {
  for (const data of [snapshot({marketOpen:false}), snapshot({quotes:[]}), snapshot({signals:{rows:[]}}), snapshot({signals:{...snapshot().signals,asOf:'2026-11-04'}}), snapshot({quotes:snapshot().quotes.map(row => ({...row,as_of:'2026-11-04T01:00:00Z'}))})]) {
    const row = advanceSimulation(ledger(), data, now);
    assert.equal(row.trades.length,0); assert.deepEqual(row.positions.map(row => row.shares),[1000,500]);
  }
});

test('A-share purchases remain locked until the next market day; prior holdings can be sold', () => {
  const row = ledger(); Object.assign(row.positions[0], {boughtDay:'2026-11-04',boughtShares:400});
  const noEntry = {...snapshot().signals, rows:snapshot().signals.rows.map(signal => ({...signal,entry:false}))};
  advanceSimulation(row, snapshot({signals:noEntry}), now);
  assert.equal(row.positions[0].shares,400); assert.equal(row.positions[1].shares,0);
  const tomorrow = new Date('2026-11-05T02:00:00Z');
  advanceSimulation(row, snapshot({day:'2026-11-05',signals:noEntry,quotes:snapshot().quotes.map(quote => ({...quote,as_of:tomorrow.toISOString()}))}),tomorrow);
  assert.equal(row.positions[0].shares,0);
});

test('older quotes cannot overwrite a newer portfolio valuation', () => {
  const row = advanceSimulation(ledger(), snapshot({marketOpen:false}), now);
  advanceSimulation(row, snapshot({marketOpen:false, quotes:snapshot().quotes.map(quote => ({...quote,price:1,as_of:'2026-11-03T02:00:00Z'}))}), now);
  assert.equal(row.equity,20000);
});

test('service snapshots saved holdings, persists across restarts and updates without an open page', async t => {
  await mkdir('.test-tmp', {recursive:true}); const directory = await mkdtemp(join(process.cwd(),'.test-tmp/paper-'));
  let saved = [{market:'a',symbol:'600001',shares:1000},{market:'hk',symbol:'00700',shares:200}], calls = 0;
  const options = {directory, intervalMs:20, portfolio:async()=>({holdings:saved}), snapshot:async row => {
    calls++; return {day:'2026-11-04',marketOpen:false, strategyName:'动量',quotes:row.positions.map(position => ({symbol:position.symbol,price:calls > 1 ? 11 : 10,as_of:new Date().toISOString()}))};
  }};
  let service = await createPaperTrading(options);
  t.after(async()=>{await service.close(); await rm(directory,{recursive:true,force:true});});
  const row = await service.start({market:'a',strategy:'momentum'});
  assert.equal(row.initialEquity,10000); assert.equal(row.positions.length,1);
  saved = [{market:'a',symbol:'600002',shares:1}];
  await assert.rejects(service.start({market:'a',strategy:'momentum'}),{status:409});
  const deadline = Date.now()+3000;
  while (service.list()[0].equity !== 11000 && Date.now()<deadline) await new Promise(resolve=>setTimeout(resolve,20));
  assert.equal(service.list()[0].profit,1000); assert.equal(service.list()[0].positions[0].symbol,'600001');
  await service.pause(row.id); assert.equal(service.list()[0].status,'paused');
  const beforeSwitch=service.list()[0];
  await assert.rejects(service.switchStrategy(row.id,'momentum','动量'),{status:409});
  const changed=await service.switchStrategy(row.id,'macd','MACD');
  assert.equal(changed.strategy,'macd'); assert.equal(changed.strategyName,'MACD');
  assert.deepEqual(changed.positions,beforeSwitch.positions); assert.deepEqual(changed.history,beforeSwitch.history);
  assert.equal(changed.profit,beforeSwitch.profit); assert.equal(changed.strategyChanges.length,1);
  const ticksBeforePause = calls;
  await new Promise(resolve=>setTimeout(resolve,60)); assert.equal(calls,ticksBeforePause);
  await service.resume(row.id); assert.equal(service.list()[0].status,'running');
  await assert.rejects(service.switchStrategy(row.id,'momentum','动量'),{status:409});
  await service.close(); service = await createPaperTrading(options);
  assert.equal(service.list()[0].status,'paused'); assert.equal(service.list()[0].pauseReason,'service'); assert.equal(service.list()[0].profit,1000);
  assert.equal(service.list()[0].strategy,'macd'); assert.equal(service.list()[0].strategyChanges.length,1);
  assert.equal(JSON.parse(await readFile(join(directory,'paper-trading.json'),'utf8'))[0].status,'paused');
  await service.resume(row.id); assert.equal(service.list()[0].status,'running');
  assert.deepEqual(await service.stop(row.id),{id:row.id,deleted:true});
  assert.deepEqual(service.list(),[]);
  assert.deepEqual(JSON.parse(await readFile(join(directory,'paper-trading.json'),'utf8')),[]);
});

test('invalid cash, empty holdings, and incomplete starting prices fail without creating a ledger', async t => {
  await mkdir('.test-tmp',{recursive:true}); const directory=await mkdtemp(join(process.cwd(),'.test-tmp/paper-invalid-'));
  let holdings=[];
  const service=await createPaperTrading({directory,portfolio:async()=>({holdings}),snapshot:async()=>({quotes:[]})});
  t.after(async()=>{await service.close();await rm(directory,{recursive:true,force:true});});
  for(const initialCash of [-1,'100',null,1e13]) await assert.rejects(service.start({market:'a',strategy:'momentum',initialCash}),/初始现金/);
  await assert.rejects(service.start({market:'a',strategy:'momentum'}),/有效持仓/);
  holdings=[{symbol:'600001',shares:100}];
  await assert.rejects(service.start({market:'a',strategy:'momentum'}),/行情不完整/);
  assert.deepEqual(service.list(),[]);
});

test('an unclean shutdown is recovered as paused without changing the ledger', async t => {
  await mkdir('.test-tmp',{recursive:true}); const directory=await mkdtemp(join(process.cwd(),'.test-tmp/paper-recovery-'));
  const file=join(directory,'paper-trading.json');
  const saved={id:'prior-run',market:'a',strategy:'momentum',strategyName:'动量',status:'running',startedAt:now.toISOString(),initialEquity:1000,equity:1010,profit:10,totalReturn:.01,cash:10,costs:0,positions:[{symbol:'600001',shares:100,price:10}],initialPositions:[{symbol:'600001',shares:100}],trades:[],history:[{at:now.toISOString(),equity:1010,totalReturn:.01}]};
  await writeFile(file,JSON.stringify([saved])); let calls=0;
  const service=await createPaperTrading({directory,intervalMs:20,portfolio:async()=>({holdings:[]}),snapshot:async()=>{calls++;throw Error('should not fetch');}});
  t.after(async()=>{await service.close();await rm(directory,{recursive:true,force:true});});
  assert.equal(service.list()[0].status,'paused'); assert.equal(service.list()[0].pauseReason,'service');
  await new Promise(resolve=>setTimeout(resolve,60)); assert.equal(calls,0);
  const persisted=JSON.parse(await readFile(file,'utf8'))[0];
  assert.equal(persisted.status,'paused'); assert.deepEqual(persisted.positions,saved.positions); assert.deepEqual(persisted.history,saved.history);
});
