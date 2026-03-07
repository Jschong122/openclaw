/**
 * 動態工具選擇器（Ultra-Low-Token Architecture）
 *
 * 依 Router 的 neededToolCategories 篩選工具，減少傳給主 LLM 的 schema token 數。
 */

import type { AnyAgentTool } from "./tools/common.js";

/**
 * 工具類別 → 工具名稱映射表。
 * 工具名稱以小寫比對。
 */
const CATEGORY_MAP: Record<string, string[]> = {
  filesystem: ["read", "write", "edit", "apply_patch", "ls"],
  search: ["grep", "find"],
  terminal: ["exec", "process"],
  web: ["web_search", "web_fetch", "browser"],
  memory: ["memory_search", "memory_get"],
  session: ["sessions_spawn", "sessions_list", "sessions_send", "subagents", "sessions_history"],
  system: ["gateway", "cron", "session_status"],
  messaging: ["message"],
};

/** 永遠包含的工具（確保最基本功能可用）。 */
const ALWAYS_INCLUDE = new Set(["exec", "read"]);

/**
 * 依類別選擇工具子集。
 *
 * @param categories - Router 輸出的工具類別名稱
 * @param allTools   - 完整工具清單（由 createOpenClawCodingTools 建立）
 * @returns 篩選後的工具陣列（最多 10 個，確保 schema token 在預算內）
 */
export function selectToolsByCategory(
  categories: string[],
  allTools: AnyAgentTool[],
): AnyAgentTool[] {
  const allowed = new Set(ALWAYS_INCLUDE);
  for (const cat of categories) {
    const names = CATEGORY_MAP[cat] ?? [];
    for (const name of names) {
      allowed.add(name);
    }
  }
  return allTools.filter((t) => allowed.has(t.name.toLowerCase())).slice(0, 10);
}
