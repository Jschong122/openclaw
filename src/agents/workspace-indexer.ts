/**
 * 工作區語意擷取橋接（Ultra-Low-Token Architecture）
 *
 * 透過現有 QMD 或 builtin 記憶體基礎設施，用 Router 的 searchQuery
 * 擷取相關工作區片段，取代 bootstrap 全量注入。
 */

import type { OpenClawConfig } from "../config/config.js";
import { getMemorySearchManager } from "../memory/index.js";
import { enforceContextBudget, NANO_BUDGET } from "./context-budget.js";

/**
 * 取得工作區語意上下文。
 *
 * @param params.searchQuery  - 從 Router 取得的最佳化搜尋字串
 * @param params.agentId      - 目前的 agent ID（用於 QMD cache key）
 * @param params.config       - OpenClaw 設定
 * @returns 格式化的工作區片段（在 token 預算內），QMD 不可用時回傳空字串
 */
export async function retrieveWorkspaceContext(params: {
  searchQuery: string;
  agentId: string;
  config?: OpenClawConfig;
}): Promise<string> {
  const { searchQuery, agentId, config } = params;

  if (!searchQuery.trim() || !config) return "";

  try {
    const { manager, error } = await getMemorySearchManager({
      cfg: config,
      agentId,
    });

    if (!manager) {
      if (error) {
        // 靜默降級：不向使用者暴露記憶體系統錯誤
      }
      return "";
    }

    const results = await manager.search(searchQuery, {
      maxResults: 5,
      minScore: 0.3,
    });

    if (!results.length) return "";

    const chunks = results
      .map((r) => {
        const snippet = r.snippet.slice(0, 500);
        return `[${r.path}]\n${snippet}`;
      })
      .join("\n\n");

    return enforceContextBudget(chunks, NANO_BUDGET.retrievedContext, "workspace context");
  } catch {
    // 優雅降級：記憶體搜尋失敗不影響主流程
    return "";
  }
}
