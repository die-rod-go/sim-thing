import type { ItemCatalog } from "@village/shared";
import { renderTemplate } from "../llm/templates";
import { describeWorldCatalog } from "./world-catalog";

const WORLD_RULES_TEMPLATE = "world-rules";

const catalogTextByItems = new WeakMap<ItemCatalog, string>();

function describeCachedCatalog(items: ItemCatalog): string {
  const cached = catalogTextByItems.get(items);
  if (cached !== undefined) return cached;
  const described = describeWorldCatalog(items);
  catalogTextByItems.set(items, described);
  return described;
}

/**
 * How the world works and everything that can exist in it: the same text for every agent, so one
 * cache entry serves the whole village. Decisions, plans and passes all show it.
 */
export function describeWorldKnowledge(items: ItemCatalog, promptsDirectory?: string): string {
  return renderTemplate(
    WORLD_RULES_TEMPLATE,
    { catalog: describeCachedCatalog(items) },
    promptsDirectory,
  );
}
