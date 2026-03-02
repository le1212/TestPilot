/** Context passed to AI Chat when navigating from case/defect/report. */

export const AI_CHAT_CONTEXT_KEY = 'ai_chat_context';

export interface AIChatContext {
  source: 'case' | 'defect' | 'report';
  id: number;
  title: string;
  summary: string;
}

export function setAIChatContext(ctx: AIChatContext): void {
  try {
    sessionStorage.setItem(AI_CHAT_CONTEXT_KEY, JSON.stringify(ctx));
  } catch {
    /* ignore */
  }
}

export function getAIChatContext(): AIChatContext | null {
  try {
    const raw = sessionStorage.getItem(AI_CHAT_CONTEXT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AIChatContext;
    sessionStorage.removeItem(AI_CHAT_CONTEXT_KEY);
    return parsed && parsed.source && parsed.title ? parsed : null;
  } catch {
    return null;
  }
}

/** Build prompt prefix from context for AI to understand. */
export function buildContextPrompt(ctx: AIChatContext): string {
  return `【上下文】来自${ctx.source === 'case' ? '用例' : ctx.source === 'defect' ? '缺陷' : '报告'}「${ctx.title}」：\n\n${ctx.summary}\n\n请基于以上内容回答：`;
}
