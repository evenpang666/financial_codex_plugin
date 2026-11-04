(() => {
  const form = document.querySelector('#codexSettingsForm');
  const model = document.querySelector('#codexModel'), effort = document.querySelector('#reasoningEffort');
  const save = document.querySelector('#saveCodexSettings'), reload = document.querySelector('#reloadSettings');
  const status = document.querySelector('#codexSettingsStatus');
  const labels = {low: '低', medium: '中', high: '高', xhigh: '更高', max: '最高'};
  function busy(value) { model.disabled = effort.disabled = save.disabled = reload.disabled = value; }
  async function api(options) {
    const response = await fetch('/api/settings', options), data = await response.json();
    if (!response.ok) throw Error(data.error || '设置保存失败，请稍后重试。');
    return data;
  }
  async function load() {
    busy(true); status.textContent = '正在读取设置…';
    try {
      const data = await api();
      model.replaceChildren(...data.models.map(row => new Option(row.label, row.id)));
      effort.replaceChildren(...data.reasoningEfforts.map(value => new Option(labels[value] || value, value)));
      model.value = data.model; effort.value = data.reasoningEffort;
      busy(false); status.textContent = '当前模型设置已加载。';
    } catch (error) { status.textContent = `读取失败：${error.message}`; reload.disabled = false; }
  }
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const payload = {model: model.value, reasoningEffort: effort.value};
    busy(true); status.textContent = '正在保存…';
    try { await api({method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload)}); status.textContent = '模型设置已保存，将用于后续 Codex 调用。'; }
    catch (error) { status.textContent = `保存失败：${error.message}`; }
    finally { busy(false); }
  });
  reload.addEventListener('click', load);
  const themes = document.querySelectorAll('input[name="theme"]');
  function syncTheme() { themes.forEach(input => { input.checked = input.value === window.financeTheme.get(); }); }
  themes.forEach(input => input.addEventListener('change', () => {
    try { window.financeTheme.set(input.value); document.querySelector('#themeSettingsStatus').textContent = `已切换为${input.value === 'dark' ? '深色' : '浅色'}主题。`; }
    catch { document.querySelector('#themeSettingsStatus').textContent = '浏览器无法保存主题，请允许本地存储后重试。'; }
    syncTheme();
  }));
  window.addEventListener('storage', syncTheme);
  syncTheme(); void load();
})();
