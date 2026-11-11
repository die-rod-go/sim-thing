import type { Agent } from "@village/shared";
import { pickAgentColor } from "../village/village-geometry";

const HEX_DIGITS = 6;
const HEX_RADIX = 16;

export function toCssColor(color: number): string {
  return `#${color.toString(HEX_RADIX).padStart(HEX_DIGITS, "0")}`;
}

/**
 * CSS colors per agent id. The village scene colors markers in snapshot order, so indexing the
 * same agent list gives each agent the same color in the panel as on the map.
 */
export function buildAgentColors(agents: Agent[]): Map<string, string> {
  return new Map(
    agents.map((agent, agentIndex) => [agent.id, toCssColor(pickAgentColor(agentIndex))]),
  );
}
