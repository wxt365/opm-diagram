import { id } from './store.mjs';

/** 只接收当前会话的文本。独立审查会话的回复不进入用户对话。 */
export function liveReply(service, task, sessionId) {
  const attempts = new Map();
  const durableIds = new Set();
  let hasLiveFrames = false;
  const messageId = id();
  let pending, timer, writes = Promise.resolve(), error;
  const text = () => [...attempts.values()].map(value => value.text).filter(Boolean).join('\n\n');
  const commit = () => {
    clearTimeout(timer); timer = undefined;
    const next = pending; pending = undefined;
    if (next === undefined) return writes;
    writes = writes.then(() => service.store.update(task.key, value => {
      if (!task.active || value.run?.id !== task.runId || value.run.status !== 'running') return;
      putReply(value, messageId, next, task.scope.contextId);
    })).catch(cause => { error = cause; });
    return writes;
  };
  const publish = () => {
    pending = text();
    if (!timer) timer = setTimeout(commit, 100);
  };
  return {
    messageId, text,
    notify(notification) {
      if (!task.active || notification.params?.sessionId !== sessionId) return;
      const frame = notification.params.frame;
      if (notification.method === 'opm.assistant-stream' && frame) {
        hasLiveFrames = true;
        if (frame.type === 'start') attempts.set(frame.attemptId, { text: '', revision: frame.revision });
        const attempt = attempts.get(frame.attemptId);
        if (!attempt || frame.type === 'start' || frame.revision <= attempt.revision) return;
        attempt.revision = frame.revision;
        if (frame.type === 'chunk' && frame.chunk?.type === 'text-delta') {
          attempt.text += frame.chunk.text; publish();
        } else if (frame.type === 'end' && (frame.outcome?.kind === 'abandoned' || frame.outcome?.eventType === 'assistant/attempt')) {
          attempts.delete(frame.attemptId); publish();
        }
      }
      const event = notification.params.event;
      if (event?.type === 'assistant/message') {
        const content = event.data?.message?.content ?? [];
        const next = content.filter(block => block.type === 'text').map(block => block.text).join('');
        // Durable notifications also cover providers/SDK versions without live frames.
        const key = event.data.message.id ?? String(event.seq);
        if (!hasLiveFrames && next && !durableIds.has(key)) {
          durableIds.add(key); attempts.set(key, { text: next }); publish();
        }
      }
    },
    async flush() { await commit(); if (error) throw error; },
    dispose() { clearTimeout(timer); pending = undefined; },
  };
}

export function putReply(value, messageId, text, contextId) {
  const existing = value.messages.find(message => message.id === messageId);
  if (existing) existing.text = text;
  else if (text) value.messages.push({ id: messageId, role: 'assistant', text, contextId });
}
