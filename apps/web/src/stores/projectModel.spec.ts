import { createPinia, setActivePinia } from 'pinia';
import { flushPromises } from '@vue/test-utils';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { localRuntimeApi, LocalRuntimeApiError } from '@/shared/api/localRuntimeApi';
import { DraftDelivery } from '@/shared/api/draftDelivery';
import { useProjectModelStore } from './projectModel';

function project(id: string) { return { project_id: id, name: id, archive_state: 'ACTIVE' as const, model_count: 0, updated_at: 'today' }; }
function model(projectId: string) { return { project_id: projectId, model_id: 'model.created', name: '模型', access_mode: 'EDITABLE_DRAFT' as const,
  profile_id: 'profile.test', profile_version: '1', head_revision: 'revision.1' }; }
function deferred<T>() { let resolve!: (value: T) => void, reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
beforeEach(() => {
  setActivePinia(createPinia());
  vi.spyOn(localRuntimeApi, 'getProject').mockImplementation(async id => project(id));
  vi.spyOn(localRuntimeApi, 'listModels').mockResolvedValue([]);
});
afterEach(() => vi.restoreAllMocks());

it.each([true, false])('生命周期刷新接替同项目整页读取正确结束加载，成功=%s', async success => {
  const store = useProjectModelStore(); await store.loadProject('project.a');
  const lifecycle = deferred<Awaited<ReturnType<typeof localRuntimeApi.changeModelLifecycle>>>();
  vi.spyOn(DraftDelivery.prototype, 'pending').mockResolvedValue([]);
  const command = vi.spyOn(localRuntimeApi, 'changeModelLifecycle').mockReturnValue(lifecycle.promise);
  const action = store.changeModelLifecycle('project.a', 'model.created', 'TRASH', 'command.test');
  await flushPromises(); expect(command).toHaveBeenCalledOnce();
  const oldSummary = deferred<ReturnType<typeof project>>();
  vi.mocked(localRuntimeApi.getProject).mockReturnValueOnce(oldSummary.promise);
  const reentry = store.loadProject('project.a');
  if (success) vi.mocked(localRuntimeApi.getProject).mockResolvedValue(project('project.a'));
  else vi.mocked(localRuntimeApi.getProject).mockRejectedValueOnce(new LocalRuntimeApiError('FAILED', '接替读取失败'));
  lifecycle.resolve({ project_id: 'project.a', model_id: 'model.created', lifecycle_state: 'ARCHIVED' }); await action;
  expect(store.projectResource).toBe(success ? 'ready' : 'error');
  expect(store.modelListResource).toBe(success ? 'empty' : 'error');
  expect(store.lifecycleBusy).toBe(false);
  if (!success) expect(store.projectError).toBe('接替读取失败');
  oldSummary.resolve({ ...project('project.a'), model_count: 99 }); await reentry;
  expect(store.projectResource).toBe(success ? 'ready' : 'error');
  expect(store.project?.modelCount).not.toBe(99);
  if (!success) {
    vi.mocked(localRuntimeApi.getProject).mockResolvedValue(project('project.a'));
    await store.loadProject('project.a');
    expect(store.projectResource).toBe('ready'); expect(store.projectError).toBe('');
  }
});

it('普通列表读取失败保留已加载项目和可恢复列表错误', async () => {
  const store = useProjectModelStore(); await store.loadProject('project.a');
  vi.mocked(localRuntimeApi.listModels).mockRejectedValueOnce(new LocalRuntimeApiError('FAILED', '列表读取失败'));
  await store.loadModels('project.a', 'ARCHIVED');
  expect(store.projectResource).toBe('ready'); expect(store.project?.id).toBe('project.a');
  expect(store.projectError).toBe(''); expect(store.modelError).toBe('列表读取失败'); expect(store.modelListResource).toBe('error');
});

it.each([['loadProject', true], ['loadProject', false], ['loadModels', true], ['loadModels', false]] as const)(
  '跨创建确认的旧 %s 响应必须重新读取，成功=%s', async (operation, success) => {
    const store = useProjectModelStore(); await store.loadProject('project.a');
    const pending = deferred<ReturnType<typeof model>[]>();
    vi.mocked(localRuntimeApi.listModels).mockReturnValueOnce(pending.promise).mockResolvedValue([model('project.a')]);
    const oldRead = operation === 'loadProject' ? store.loadProject('project.a') : store.loadModels('project.a', 'ACTIVE');
    vi.spyOn(localRuntimeApi, 'createModel').mockResolvedValue(model('project.a'));
    vi.mocked(localRuntimeApi.getProject).mockResolvedValue({ ...project('project.a'), model_count: 1 });
    await store.createModel('project.a', '模型');
    if (success) pending.resolve([]); else pending.reject(new LocalRuntimeApiError('FAILED', '旧读取失败'));
    await oldRead; await flushPromises();
    expect(store.models.map(item => item.id)).toEqual(['model.created']); expect(store.project?.modelCount).toBe(1);
    expect(store.projectResource).toBe('ready'); expect(store.modelListResource).toBe('ready');
    expect(store.modelError).toBe(''); expect(store.projectError).toBe('');
    expect(localRuntimeApi.listModels).toHaveBeenCalledTimes(3);
  });

it('数量挂起时创建立即完成并解除忙碌', async () => {
  const store = useProjectModelStore(); await store.loadProject('project.a');
  const pending = deferred<ReturnType<typeof project>>();
  vi.mocked(localRuntimeApi.getProject).mockReturnValueOnce(pending.promise);
  vi.spyOn(localRuntimeApi, 'createModel').mockResolvedValue(model('project.a'));
  let confirmed = false;
  const creation = store.createModel('project.a', '模型').then(() => { confirmed = true; });
  try {
    await flushPromises(); expect(confirmed).toBe(true); expect(store.isCreatingModel).toBe(false);
    expect(store.models.map(item => item.id)).toEqual(['model.created']);
  } finally { pending.resolve({ ...project('project.a'), model_count: 1 }); await creation; await flushPromises(); }
  expect(store.project?.modelCount).toBe(1);
});

it('被新项目替代的旧列表不重试也不回写', async () => {
  const store = useProjectModelStore(); await store.loadProject('project.a');
  const pending = deferred<ReturnType<typeof model>[]>();
  vi.mocked(localRuntimeApi.listModels).mockReturnValueOnce(pending.promise);
  const oldRead = store.loadModels('project.a', 'ACTIVE');
  vi.spyOn(localRuntimeApi, 'createModel').mockResolvedValue(model('project.a'));
  await store.createModel('project.a', '模型');
  await store.loadProject('project.b');
  pending.resolve([]); await oldRead; await flushPromises();
  expect(store.project?.id).toBe('project.b'); expect(store.models).toEqual([]);
  expect(localRuntimeApi.listModels).toHaveBeenCalledTimes(3);
});

it('较新读取已应用后，旧后台数量失败不残留错误', async () => {
  const store = useProjectModelStore(); await store.loadProject('project.a');
  const pending = deferred<ReturnType<typeof project>>();
  vi.mocked(localRuntimeApi.getProject).mockReturnValueOnce(pending.promise);
  vi.spyOn(localRuntimeApi, 'createModel').mockResolvedValue(model('project.a'));
  await store.createModel('project.a', '模型');
  vi.mocked(localRuntimeApi.getProject).mockResolvedValue({ ...project('project.a'), model_count: 1 });
  await store.loadModels('project.a', 'ARCHIVED');
  pending.reject(new LocalRuntimeApiError('FAILED', '旧数量失败')); await flushPromises();
  expect(store.projectError).toBe(''); expect(store.project?.modelCount).toBe(1);
});

it('连续创建后旧后台数量晚到不能覆盖新数量', async () => {
  const store = useProjectModelStore(); await store.loadProject('project.a');
  const first = deferred<ReturnType<typeof project>>(), second = deferred<ReturnType<typeof project>>();
  vi.spyOn(localRuntimeApi, 'createModel').mockResolvedValueOnce(model('project.a')).mockResolvedValueOnce({ ...model('project.a'), model_id: 'model.second' });
  vi.mocked(localRuntimeApi.getProject).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
  await store.createModel('project.a', '模型一'); await store.createModel('project.a', '模型二');
  second.resolve({ ...project('project.a'), model_count: 2 }); await flushPromises();
  first.resolve({ ...project('project.a'), model_count: 1 }); await flushPromises();
  expect(store.project?.modelCount).toBe(2); expect(store.models).toHaveLength(2);
});

it.each([true, false])('同一轮微任务中列表与创建确认交错仍保持新数据，列表先返回=%s', async listFirst => {
  const store = useProjectModelStore(); await store.loadProject('project.a');
  const list = deferred<ReturnType<typeof model>[]>(), create = deferred<ReturnType<typeof model>>();
  vi.mocked(localRuntimeApi.listModels).mockReturnValueOnce(list.promise).mockResolvedValue([model('project.a')]);
  const reading = store.loadModels('project.a', 'ACTIVE');
  vi.spyOn(localRuntimeApi, 'createModel').mockReturnValue(create.promise);
  const creating = store.createModel('project.a', '模型');
  vi.mocked(localRuntimeApi.getProject).mockResolvedValue({ ...project('project.a'), model_count: 1 });
  if (listFirst) { list.resolve([]); create.resolve(model('project.a')); }
  else { create.resolve(model('project.a')); list.resolve([]); }
  await Promise.all([reading, creating]); await flushPromises();
  expect(store.models.map(item => item.id)).toEqual(['model.created']); expect(store.project?.modelCount).toBe(1);
  expect(store.modelListResource).toBe('ready');
});

it('旧列表跨写入重读后，旧后台摘要失败不覆盖同序号的新摘要', async () => {
  const store = useProjectModelStore(); await store.loadProject('project.a');
  const list = deferred<ReturnType<typeof model>[]>(), summary = deferred<ReturnType<typeof project>>();
  vi.mocked(localRuntimeApi.listModels).mockReturnValueOnce(list.promise).mockResolvedValue([model('project.a')]);
  const reading = store.loadModels('project.a', 'ACTIVE');
  vi.mocked(localRuntimeApi.getProject).mockReturnValueOnce(summary.promise).mockResolvedValue({ ...project('project.a'), model_count: 1 });
  vi.spyOn(localRuntimeApi, 'createModel').mockResolvedValue(model('project.a'));
  await store.createModel('project.a', '模型');
  list.resolve([]); await reading;
  summary.reject(new LocalRuntimeApiError('FAILED', '旧摘要失败')); await flushPromises();
  expect(store.project?.modelCount).toBe(1); expect(store.projectError).toBe('');
});

it('创建确认后旧回收站读取重试仍保持筛选及空状态', async () => {
  const store = useProjectModelStore(); await store.loadProject('project.a');
  const list = deferred<ReturnType<typeof model>[]>();
  vi.mocked(localRuntimeApi.listModels).mockReturnValueOnce(list.promise);
  const reading = store.loadModels('project.a', 'ARCHIVED');
  vi.mocked(localRuntimeApi.getProject).mockResolvedValue({ ...project('project.a'), model_count: 1 });
  vi.spyOn(localRuntimeApi, 'createModel').mockResolvedValue(model('project.a'));
  await store.createModel('project.a', '模型'); list.resolve([]); await reading; await flushPromises();
  expect(store.models).toEqual([]); expect(store.modelArchiveState).toBe('ARCHIVED');
  expect(store.modelListResource).toBe('empty'); expect(store.project?.modelCount).toBe(1);
  expect(localRuntimeApi.listModels).toHaveBeenCalledTimes(3);
});

it('跨创建确认重读的新请求失败仍显示错误且可恢复', async () => {
  const store = useProjectModelStore(); await store.loadProject('project.a');
  const list = deferred<ReturnType<typeof model>[]>();
  vi.mocked(localRuntimeApi.listModels).mockReturnValueOnce(list.promise).mockRejectedValueOnce(new LocalRuntimeApiError('FAILED', '新读取失败'));
  const reading = store.loadModels('project.a', 'ACTIVE');
  vi.spyOn(localRuntimeApi, 'createModel').mockResolvedValue(model('project.a'));
  vi.mocked(localRuntimeApi.getProject).mockResolvedValue({ ...project('project.a'), model_count: 1 });
  await store.createModel('project.a', '模型'); list.resolve([]); await reading;
  expect(store.modelListResource).toBe('error'); expect(store.modelError).toBe('新读取失败');
  vi.mocked(localRuntimeApi.listModels).mockResolvedValue([model('project.a')]);
  await store.loadModels('project.a', 'ACTIVE');
  expect(store.modelListResource).toBe('ready'); expect(store.modelError).toBe('');
});

it.each([true, false])('旧项目创建响应不回写新项目列表或错误，成功=%s', async success => {
  const store = useProjectModelStore(), pending = deferred<ReturnType<typeof model>>();
  vi.spyOn(localRuntimeApi, 'createModel').mockReturnValue(pending.promise);
  await store.loadProject('project.a');
  const creation = store.createModel('project.a', '模型').catch(error => error);
  await store.loadProject('project.b');
  if (success) pending.resolve(model('project.a')); else pending.reject(new LocalRuntimeApiError('FAILED', '旧项目创建失败'));
  await creation;
  expect(store.project?.id).toBe('project.b'); expect(store.project?.modelCount).toBe(0);
  expect(store.models).toEqual([]); expect(store.modelError).toBe(''); expect(store.isCreatingModel).toBe(false);
});

it('创建在途切到回收站后，不插入活动模型', async () => {
  const store = useProjectModelStore(), pending = deferred<ReturnType<typeof model>>();
  vi.spyOn(localRuntimeApi, 'createModel').mockReturnValue(pending.promise);
  await store.loadProject('project.a'); const creation = store.createModel('project.a', '模型');
  await store.loadModels('project.a', 'ARCHIVED');
  vi.mocked(localRuntimeApi.getProject).mockResolvedValue({ ...project('project.a'), model_count: 1 });
  pending.resolve(model('project.a')); await creation;
  expect(store.modelArchiveState).toBe('ARCHIVED'); expect(store.models).toEqual([]);
  expect(store.modelListResource).toBe('empty');
  expect(store.project?.modelCount).toBe(1);
});

it('同项目重新加载清除旧打开错误，并允许新打开失败正常重试', async () => {
  const store = useProjectModelStore(); await store.loadProject('project.a');
  const open = vi.spyOn(localRuntimeApi, 'openWorkspace').mockRejectedValue(new LocalRuntimeApiError('FAILED', '打开失败'));
  await expect(store.openWorkspace('project.a', 'model.created')).rejects.toThrow();
  expect(store.workspaceError).toBe('打开失败');
  await store.loadProject('project.a');
  expect(store.workspaceError).toBe(''); expect(store.openWorkspaceState).toBe('idle');
  await expect(store.openWorkspace('project.a', 'model.created')).rejects.toThrow();
  expect(store.workspaceError).toBe('打开失败');
  open.mockResolvedValue({} as never); await store.openWorkspace('project.a', 'model.created');
  expect(store.workspaceError).toBe(''); expect(store.openWorkspaceState).toBe('opened');
});

it.each([true, false])('同项目重新加载后旧打开响应无效，成功=%s', async success => {
  const store = useProjectModelStore(); await store.loadProject('project.a');
  const pending = deferred<Awaited<ReturnType<typeof localRuntimeApi.openWorkspace>>>();
  vi.spyOn(localRuntimeApi, 'openWorkspace').mockReturnValue(pending.promise);
  const opening = store.openWorkspace('project.a', 'model.created').catch(error => error);
  await store.loadProject('project.a');
  if (success) pending.resolve({} as never); else pending.reject(new LocalRuntimeApiError('FAILED', '旧打开失败'));
  await opening;
  expect(store.workspaceError).toBe(''); expect(store.openWorkspaceState).toBe('idle'); expect(store.modelError).toBe('');
});

it.each(['ACTIVE', 'ARCHIVED'] as const)('创建确认后独立刷新 %s 数量，服务端摘要已计入时不重复加一', async scope => {
  const store = useProjectModelStore(); await store.loadProject('project.a');
  const pending = deferred<ReturnType<typeof model>>(); vi.spyOn(localRuntimeApi, 'createModel').mockReturnValue(pending.promise);
  const creating = store.createModel('project.a', '模型');
  vi.mocked(localRuntimeApi.getProject).mockResolvedValue({ ...project('project.a'), model_count: 1 });
  vi.mocked(localRuntimeApi.listModels).mockResolvedValue(scope === 'ACTIVE' ? [model('project.a')] : []);
  await store.loadModels('project.a', scope);
  pending.resolve(model('project.a')); await creating;
  expect(localRuntimeApi.getProject).toHaveBeenCalledTimes(3);
  expect(store.project?.modelCount).toBe(1); expect(store.models).toHaveLength(scope === 'ACTIVE' ? 1 : 0);
});

it.each([true, false])('创建后的迟到摘要不覆盖较新的项目或列表，切项目=%s', async switchProject => {
  const store = useProjectModelStore(); await store.loadProject('project.a');
  const pending = deferred<ReturnType<typeof project>>();
  vi.spyOn(localRuntimeApi, 'createModel').mockResolvedValue(model('project.a'));
  vi.mocked(localRuntimeApi.getProject).mockReturnValueOnce(pending.promise);
  const creating = store.createModel('project.a', '模型'); await Promise.resolve();
  vi.mocked(localRuntimeApi.getProject).mockResolvedValue({ ...project(switchProject ? 'project.b' : 'project.a'), model_count: 2 });
  if (switchProject) await store.loadProject('project.b'); else await store.loadModels('project.a', 'ARCHIVED');
  pending.resolve({ ...project('project.a'), model_count: 1 }); await creating; await flushPromises();
  expect(store.project?.id).toBe(switchProject ? 'project.b' : 'project.a'); expect(store.project?.modelCount).toBe(2);
});

it('创建已确认但数量读取失败不重复创建，可在原范围重试摘要', async () => {
  const store = useProjectModelStore(); await store.loadProject('project.a'); await store.loadModels('project.a', 'ARCHIVED');
  vi.spyOn(localRuntimeApi, 'createModel').mockResolvedValue(model('project.a'));
  vi.mocked(localRuntimeApi.getProject).mockRejectedValueOnce(new LocalRuntimeApiError('FAILED', '读取失败'));
  await expect(store.createModel('project.a', '模型')).resolves.toMatchObject({ id: 'model.created' });
  expect(store.projectError).toContain('模型已创建'); expect(store.models).toEqual([]);
  vi.mocked(localRuntimeApi.getProject).mockResolvedValue({ ...project('project.a'), model_count: 1 });
  await store.loadModels('project.a', 'ARCHIVED');
  expect(store.projectError).toBe(''); expect(store.project?.modelCount).toBe(1); expect(store.modelArchiveState).toBe('ARCHIVED');
  expect(localRuntimeApi.createModel).toHaveBeenCalledOnce();
});

it('旧项目请求结束不解除新项目的创建忙碌状态', async () => {
  const store = useProjectModelStore(), first = deferred<ReturnType<typeof model>>(), second = deferred<ReturnType<typeof model>>();
  vi.spyOn(localRuntimeApi, 'createModel').mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
  await store.loadProject('project.a'); const old = store.createModel('project.a', '旧模型');
  await store.loadProject('project.b'); const current = store.createModel('project.b', '新模型');
  first.resolve(model('project.a')); await old;
  expect(store.isCreatingModel).toBe(true); expect(store.models).toEqual([]);
  second.resolve(model('project.b')); await current;
  expect(store.isCreatingModel).toBe(false); expect(store.models.map(item => item.projectId)).toEqual(['project.b']);
});

it('生命周期迟到响应不重新加载旧项目', async () => {
  const store = useProjectModelStore(); await store.loadProject('project.a');
  vi.spyOn(DraftDelivery.prototype, 'pending').mockResolvedValue([]);
  const pending = deferred<Awaited<ReturnType<typeof localRuntimeApi.changeModelLifecycle>>>();
  vi.spyOn(localRuntimeApi, 'changeModelLifecycle').mockReturnValue(pending.promise);
  const action = store.changeModelLifecycle('project.a', 'model.created', 'TRASH', 'command.test');
  await Promise.resolve(); await store.loadProject('project.b');
  pending.resolve({ project_id: 'project.a', model_id: 'model.created', lifecycle_state: 'ARCHIVED' }); await action;
  expect(store.project?.id).toBe('project.b');
  expect(localRuntimeApi.listModels).toHaveBeenCalledTimes(2);
});

it('旧项目打开失败不覆盖新项目打开状态', async () => {
  const store = useProjectModelStore(); await store.loadProject('project.a');
  const pending = deferred<Awaited<ReturnType<typeof localRuntimeApi.openWorkspace>>>();
  vi.spyOn(localRuntimeApi, 'openWorkspace').mockReturnValue(pending.promise);
  const opening = store.openWorkspace('project.a', 'model.created').catch(error => error);
  await store.loadProject('project.b'); pending.reject(new LocalRuntimeApiError('FAILED', '旧打开失败')); await opening;
  expect(store.openWorkspaceState).toBe('idle'); expect(store.modelError).toBe('');
});
