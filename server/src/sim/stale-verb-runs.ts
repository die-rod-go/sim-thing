import type { Agent, ItemCatalog } from "@village/shared";
import type { AgentRuntime } from "./agent-runtime";

/**
 * A saved verb run whose verb is gone or has changed in `items.json` can't be resumed. Drops it
 * and clears that agent's action so the agent decides afresh.
 */
export function dropStaleVerbRuns(
  agents: readonly Agent[],
  agentRuntimes: Record<string, AgentRuntime>,
  items: ItemCatalog,
): Agent[] {
  const staleAgentIds = new Set<string>();
  for (const [agentId, runtime] of Object.entries(agentRuntimes)) {
    const run = runtime.verbRun;
    if (run === null || items.verbs[run.verbIndex]?.name === run.verbName) continue;
    runtime.verbRun = null;
    staleAgentIds.add(agentId);
  }
  return agents.map((agent) =>
    staleAgentIds.has(agent.id) ? { ...agent, currentAction: null } : agent,
  );
}
