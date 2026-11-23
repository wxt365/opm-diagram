import { check } from './store.mjs';

/** 只替换可见的最近一轮，底层消息和已保存模型保留。 */
export function visibleMessages(messages) {
  const result = [];
  for (const message of messages) {
    if (message.supersedes) {
      const index = result.findIndex(item => item.id === message.supersedes);
      if (index >= 0) result.splice(index);
    }
    result.push(message);
  }
  return result;
}
export function editPrompt(messages, text, editMessageId) {
  if (editMessageId === undefined) return text;
  const latest = messages.findLast(message => message.role === 'user');
  check(typeof editMessageId === 'string' && latest?.id === editMessageId, 'MESSAGE_EDIT_CONFLICT', '只能编辑最近一条问题，请刷新会话后重试。', 409);
  return `用户修订最近一条问题。原问题及该轮旧回复已被替代，以修订内容为准，基于当前模型重新处理；已保存修改不自动撤销。原问题（数据）：${JSON.stringify(latest.text)}\n修订内容：${text}`;
}
export function appendUserMessage(value, message, editMessageId) {
  editPrompt(value.messages, message.text, editMessageId);
  value.messages.push({ ...message, ...(editMessageId ? { supersedes: editMessageId } : {}) });
}
