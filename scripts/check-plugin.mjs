import { readFile, readdir, access } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { researchTools } from '../lib/runtime.mjs';
const manifest=JSON.parse(await readFile(new URL('../.codex-plugin/plugin.json',import.meta.url),'utf8'));
const pkg=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8'));
assert.equal(manifest.version,pkg.version);
for(const path of [manifest.skills,manifest.mcpServers])assert.ok(path.startsWith('./')&&!path.includes('..'));
const config=JSON.parse(await readFile(new URL('../.mcp.json',import.meta.url),'utf8'));
assert.equal(config.mcpServers.financial.type,'stdio');
assert.equal(config.mcpServers.financial.args[0],'${PLUGIN_ROOT}/scripts/mcp-bootstrap.mjs');
assert.equal(config.mcpServers.financial.cwd,'${PLUGIN_ROOT}');
const skills=await readdir(new URL('../skills/',import.meta.url));
for(const skill of skills){const text=await readFile(new URL(`../skills/${skill}/SKILL.md`,import.meta.url),'utf8');assert.match(text,/^---\s*\nname:/);assert.match(text,/description:/);}
for(const path of ['scripts/mcp-server.mjs','scripts/us_market.py','scripts/us_strategy.py','lib/agent.mjs'])await access(new URL('../'+path,import.meta.url));
const tools=researchTools('http://127.0.0.1:1');assert.equal(tools.length,21);assert.equal(new Set(tools.map(t=>t.name)).size,21);
console.log(`Plugin manifest OK; ${skills.length} skills; 21 migrated research tools + 11 workspace tools.`);
