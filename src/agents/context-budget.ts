/**
 * Token 預算管理器（Ultra-Low-Token Architecture）
 *
 * 目標：主 LLM 請求 < 3,000 tokens
 */

export const NANO_BUDGET = {
  systemPrompt: 600,
  toolSchemas: 800,
  retrievedContext: 1400,
  total: 3000,
} as const;

/**
 * 若 content 超出預算，裁切頭尾並插入截斷標記。
 * head 佔 70%，tail 佔 20%，留 10% 給標記本身。
 */
export function enforceContextBudget(
  content: string,
  budgetTokens: number,
  label: string,
): string {
  const estimated = estimateTokens(content);
  if (estimated <= budgetTokens) return content;
  const maxChars = budgetTokens * 4;
  const head = Math.floor(maxChars * 0.7);
  const tail = Math.floor(maxChars * 0.2);
  const marker = `\n...[${label} truncated]...\n`;
  return content.slice(0, head) + marker + content.slice(content.length - tail);
}

/** 以 4 chars/token 估算 token 數（英文文字的粗略估算）。 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
