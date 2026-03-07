/**
 * Cheap LLM Router（Ultra-Low-Token Architecture）
 *
 * 用便宜模型（Haiku / GPT-4o-mini）分析使用者意圖，
 * 輸出所需工具類別、QMD 搜尋字串、prompt 模式。
 *
 * 每次呼叫預算：~325 tokens（in + out）
 */

import { completeSimple, getEnvApiKey } from "@mariozechner/pi-ai";

export type RouterDecision = {
  /** 所需工具類別子集，例如 ["filesystem", "terminal"] */
  neededToolCategories: string[];
  /** 給 QMD 語意搜尋的查詢字串（一句話） */
  searchQuery: string;
  /**
   * 回覆風格：
   * - "nano"：簡單任務，使用超精簡系統 prompt
   * - "full"：複雜多步驟任務，使用完整系統 prompt
   */
  replyStyle: "nano" | "full";
};

/** Router 失敗時的安全 fallback：回傳所有常用類別 + full 模式。 */
const FALLBACK_DECISION: RouterDecision = {
  neededToolCategories: ["filesystem", "terminal", "memory"],
  searchQuery: "",
  replyStyle: "full",
};

const VALID_CATEGORIES = new Set([
  "filesystem",
  "search",
  "terminal",
  "web",
  "memory",
  "session",
  "system",
  "messaging",
]);

const ROUTER_SYSTEM_PROMPT = `You are a tool router. Given a user message, output JSON only:
{
  "neededToolCategories": [...],
  "searchQuery": "...",
  "replyStyle": "nano" | "full"
}
neededToolCategories: subset of [filesystem, search, terminal, web, memory, session, system, messaging]
searchQuery: 1-sentence semantic search for workspace docs
replyStyle: nano for simple/single-step, full for complex/multi-step
Output only valid JSON. No other text.`;

function parseRouterOutput(text: string, fallbackQuery: string): RouterDecision {
  try {
    const trimmed = text.trim();
    // 從回應中擷取 JSON（防止 LLM 在前後加多餘文字）
    const jsonStart = trimmed.indexOf("{");
    const jsonEnd = trimmed.lastIndexOf("}");
    if (jsonStart === -1 || jsonEnd === -1) return { ...FALLBACK_DECISION, searchQuery: fallbackQuery };
    const parsed = JSON.parse(trimmed.slice(jsonStart, jsonEnd + 1)) as unknown;
    if (!parsed || typeof parsed !== "object") return { ...FALLBACK_DECISION, searchQuery: fallbackQuery };
    const obj = parsed as Record<string, unknown>;

    const categories = Array.isArray(obj.neededToolCategories)
      ? (obj.neededToolCategories as unknown[])
          .filter((c): c is string => typeof c === "string")
          .filter((c) => VALID_CATEGORIES.has(c))
      : FALLBACK_DECISION.neededToolCategories;

    const searchQuery =
      typeof obj.searchQuery === "string" && obj.searchQuery.trim()
        ? obj.searchQuery.trim().slice(0, 200)
        : fallbackQuery;

    const replyStyle = obj.replyStyle === "nano" ? "nano" : "full";

    return { neededToolCategories: categories, searchQuery, replyStyle };
  } catch {
    return { ...FALLBACK_DECISION, searchQuery: fallbackQuery };
  }
}

/**
 * 呼叫便宜模型進行意圖路由。
 *
 * @param params.userQuery     - 使用者原始訊息
 * @param params.routerModel   - 路由用模型 ID，例如 "claude-haiku-4-5-20251001"
 * @param params.routerProvider - 路由用 provider，例如 "anthropic"
 * @param params.apiKey        - 可選的 API key（優先使用；未提供時從環境變數讀取）
 * @returns RouterDecision（失敗時回傳安全 fallback）
 */
export async function routeIntent(params: {
  userQuery: string;
  routerModel: string;
  routerProvider: string;
  apiKey?: string;
}): Promise<RouterDecision> {
  const { userQuery, routerModel, routerProvider } = params;
  const fallbackQuery = userQuery.slice(0, 100);

  try {
    // 截斷輸入以節省 tokens（最多 500 chars ≈ 125 tokens）
    const truncatedQuery = userQuery.slice(0, 500);

    // 取得 API key
    const apiKey =
      params.apiKey?.trim() ||
      (getEnvApiKey(routerProvider as Parameters<typeof getEnvApiKey>[0]) ?? undefined);

    // 建構 Model 物件
    // completeSimple 接受 Model<TApi>，以 api 欄位辨別 provider
    const api = resolveApiForProvider(routerProvider);
    const model = {
      id: routerModel,
      name: routerModel,
      api,
      provider: routerProvider,
      baseUrl: resolveBaseUrlForProvider(routerProvider),
      reasoning: false,
      input: ["text"] as ("text" | "image")[],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 200000,
      maxTokens: 8096,
    } as const;

    const context = {
      systemPrompt: ROUTER_SYSTEM_PROMPT,
      messages: [{ role: "user" as const, content: truncatedQuery, timestamp: Date.now() }],
    };

    const result = await completeSimple(model as Parameters<typeof completeSimple>[0], context, {
      maxTokens: 200,
      apiKey,
    });

    // 從回應中提取文字
    const text = result.content
      .filter((c) => c.type === "text")
      .map((c) => (c as { type: "text"; text: string }).text)
      .join("");

    if (!text.trim()) return { ...FALLBACK_DECISION, searchQuery: fallbackQuery };
    return parseRouterOutput(text, fallbackQuery);
  } catch {
    return { ...FALLBACK_DECISION, searchQuery: fallbackQuery };
  }
}

function resolveApiForProvider(
  provider: string,
): "anthropic-messages" | "openai-completions" | "google-generative-ai" {
  const p = provider.toLowerCase();
  if (p === "anthropic") return "anthropic-messages";
  if (p === "google") return "google-generative-ai";
  // openai、openrouter 等 OpenAI-compatible 使用 openai-completions
  return "openai-completions";
}

function resolveBaseUrlForProvider(provider: string): string {
  const p = provider.toLowerCase();
  if (p === "anthropic") return "https://api.anthropic.com";
  if (p === "openai") return "https://api.openai.com";
  if (p === "google") return "https://generativelanguage.googleapis.com";
  return "https://api.openai.com";
}
