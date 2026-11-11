export type ShortcutAction =
  | { kind: "toggle_pause" }
  | { kind: "step" }
  | { kind: "set_speed_option"; optionIndex: number }
  | { kind: "cycle_agent"; direction: 1 | -1 }
  | { kind: "deselect" }
  | { kind: "toggle_help" };

export interface ShortcutHelpEntry {
  keys: string;
  does: string;
}

/** Shown in the help popover; the village view adds its own camera keys separately. */
export const SHORTCUT_HELP: readonly ShortcutHelpEntry[] = [
  { keys: "Space", does: "Pause or resume" },
  { keys: ".", does: "Step one tick (while paused)" },
  { keys: "1 – 9", does: "Pick a speed" },
  { keys: "[  ]", does: "Previous / next agent" },
  { keys: "Esc", does: "Close menus, then deselect" },
  { keys: "?", does: "Show these shortcuts" },
  { keys: "F  0  +  −", does: "Map: follow, fit, zoom" },
];

const DIGIT_PATTERN = /^[1-9]$/;

export function resolveShortcut(key: string): ShortcutAction | null {
  if (key === " ") return { kind: "toggle_pause" };
  if (key === ".") return { kind: "step" };
  if (key === "[") return { kind: "cycle_agent", direction: -1 };
  if (key === "]") return { kind: "cycle_agent", direction: 1 };
  if (key === "Escape") return { kind: "deselect" };
  if (key === "?") return { kind: "toggle_help" };
  if (DIGIT_PATTERN.test(key)) return { kind: "set_speed_option", optionIndex: Number(key) - 1 };
  return null;
}

/** The next agent id in roster order, wrapping around; starts at either end when none is chosen. */
export function cycleAgentId(
  agentIds: readonly string[],
  currentId: string | null,
  direction: 1 | -1,
): string | null {
  if (agentIds.length === 0) return null;
  const currentIndex = currentId === null ? -1 : agentIds.indexOf(currentId);
  if (currentIndex === -1)
    return direction === 1 ? (agentIds[0] ?? null) : (agentIds.at(-1) ?? null);
  const nextIndex = (currentIndex + direction + agentIds.length) % agentIds.length;
  return agentIds[nextIndex] ?? null;
}
