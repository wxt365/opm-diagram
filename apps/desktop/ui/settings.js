const bridge = window.opmDesktop, form = document.querySelector('#model-form'), message = document.querySelector('#message');
let working = false;
async function refresh() {
  const state = await bridge.getState();
  document.querySelector('#version').textContent = `${state.version} · ${state.platform} ${state.arch}`;
  document.querySelector('#assistant').textContent = ({ READY: '已就绪', UNCONFIGURED: '未配置', FAILED: '未连接' })[state.assistant] ?? '未连接';
  document.querySelector('#data-path').textContent = state.dataPath;
  for (const field of ['provider', 'baseURL', 'model']) form.elements[field].value = state.model[field];
  form.elements.key.value = '';
  form.elements.persist.disabled = !state.model.canPersist;
  form.elements.persist.checked = state.model.canPersist;
  document.querySelector('#credential-note').textContent = !state.model.canPersist ? '系统凭证保护不可用，Key 仅在本次运行中有效。' : state.model.hasKey ? `已配置 Key（${state.model.persisted ? '已加密保存在此设备' : '仅本次运行有效'}），不会显示原值。` : '尚未配置 Key，可继续离线建模。';
  document.querySelector('#runtimes').textContent = Object.entries(state.runtimes ?? {}).map(([key, value]) => `${key}: ${value}`).join(' · ');
}
async function run(action, success) {
  if (working) return; working = true;
  document.querySelectorAll('button').forEach(button => { button.disabled = true; });
  message.className = ''; message.textContent = '正在处理…';
  try { const result = await action(); await refresh(); message.textContent = result?.cancelled ? '操作已取消。' : success + (result?.path ? `：${result.path}` : ''); }
  catch (error) { message.className = 'error'; message.textContent = error.message; }
  finally { working = false; document.querySelectorAll('button').forEach(button => { button.disabled = false; }); }
}
form.addEventListener('submit', event => { event.preventDefault(); const data = new FormData(form); void run(() => bridge.saveSettings({ provider:data.get('provider'), baseURL:data.get('baseURL'), model:data.get('model'), key:data.get('key'), persist:form.elements.persist.checked }), '配置已保存'); });
for (const [id, method, text] of [['test','testConnection','连接已通过'], ['clear','clearKey','Key 已清除'], ['backup','backup','工作区已备份'], ['restore','restore','已恢复工作区'], ['diagnostics','diagnostics','诊断已导出'], ['open-data','openData','已打开数据目录'], ['open-logs','openLogs','已打开日志目录']]) document.getElementById(id).addEventListener('click', () => void run(() => bridge[method](), text));
void refresh().catch(error => { message.className = 'error'; message.textContent = error.message; });
