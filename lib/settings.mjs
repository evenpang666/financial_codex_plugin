import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

export const DEFAULT_CODEX_MODEL = 'gpt-6-sol';
export const DEFAULT_REASONING_EFFORT = 'high';
export const CODEX_MODELS = [
  {id: 'gpt-6-sol', label: 'GPT-6 Sol'},
  {id: 'gpt-6.1-sol', label: 'GPT-6.1 Sol'},
  {id: 'gpt-6.1-terra', label: 'GPT-6.1 Terra'},
  {id: 'gpt-6-astra', label: 'GPT-6 Astra'},
  {id: 'gpt-6-luna', label: 'GPT-6 Luna'},
];
export const REASONING_EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'];

export async function createWebSettings(root, env = process.env) {
  const directory = join(root, 'data/web'), file = join(directory, 'settings.json');
  const models = CODEX_MODELS.map(row => ({...row}));
  if (env.FINANCE_CODEX_MODEL && !models.some(row => row.id === env.FINANCE_CODEX_MODEL)) {
    models.push({id: env.FINANCE_CODEX_MODEL, label: env.FINANCE_CODEX_MODEL});
  }
  const validate = value => {
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !['model', 'reasoningEffort'].includes(key)) || !models.some(row => row.id === value.model) || !REASONING_EFFORTS.includes(value.reasoningEffort)) {
      throw Error('请选择有效的 Codex 模型与推理强度。');
    }
    return {model: value.model, reasoningEffort: value.reasoningEffort};
  };
  let current = validate({model: env.FINANCE_CODEX_MODEL || DEFAULT_CODEX_MODEL, reasoningEffort: env.FINANCE_CODEX_REASONING_EFFORT || DEFAULT_REASONING_EFFORT});
  try { current = validate(JSON.parse(await readFile(file, 'utf8'))); }
  catch (error) { if (error.code !== 'ENOENT') throw new Error(`无法读取网页设置：${error.message}`); }
  let saving = Promise.resolve();
  return {
    get: () => ({...current}),
    describe: () => ({...current, models, reasoningEfforts: REASONING_EFFORTS}),
    update(value) {
      const next = validate(value);
      const operation = saving.catch(() => {}).then(async () => {
        await mkdir(directory, {recursive: true});
        await writeFile(file + '.tmp', JSON.stringify(next, null, 2) + '\n');
        await rename(file + '.tmp', file);
        current = next;
        return {...current};
      });
      saving = operation;
      return operation;
    },
  };
}
