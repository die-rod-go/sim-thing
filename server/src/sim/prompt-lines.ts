import {
  describeCount,
  listComponentWords,
  resolveEntityComponents,
  type Agent,
  type Entity,
} from "@village/shared";
import { config } from "../config";
import type { PromptEntityGroup } from "../decision/context";
import { getDefinition } from "../items/entity-store";
import type { ThingRef } from "../items/things";
import { isLyingWhenOnTile } from "../items/world-physics";
import { listVerbsForEntity } from "../items/verb-offers";
import { listBodyWords } from "../status/conditions";
import { describeItemCounts } from "./action-phrases";
import { listVisibleContents } from "./reachable-contents";
import { describeAgentAsSeen } from "./world-access";
import type { WorldState } from "./world-state";

function entityThing(entity: Entity): ThingRef {
  return { kind: "entity", entityId: entity.id };
}

/** "holding 3 bread, 2 coins" */
function describeContents(state: WorldState, contents: readonly Entity[]): string {
  const counts: Record<string, number> = {};
  for (const entity of contents) {
    counts[entity.definitionId] = (counts[entity.definitionId] ?? 0) + 1;
  }
  const items = describeItemCounts(state.items, counts);
  return config.perception.contentsWords.holding.split("{items}").join(items);
}

function describeGroundWords(state: WorldState, entity: Entity): string[] {
  const { location } = entity;
  if (location.kind !== "tile" || !isLyingWhenOnTile(state, entity)) return [];
  const place = state.map.places.find((area) => area.name === location.place);
  const words = config.perception.groundWords;
  return [place?.isIndoor ? words.indoor : words.outdoor];
}

function listHoldingWords(state: WorldState, contents: readonly Entity[]): string[] {
  return contents.length > 0 ? [describeContents(state, contents)] : [];
}

interface EntityEntry {
  entity: Entity;
  details: string[];
  verbs: string[];
  contents: PromptEntityGroup[];
  hasVisibleContents: boolean;
}

function buildEntityEntry(state: WorldState, agentId: string, entity: Entity): EntityEntry {
  const contentEntities = listVisibleContents(state, agentId, entityThing(entity));
  const componentWords = listComponentWords(
    state.items.declarations,
    resolveEntityComponents(state.items, entity),
    true,
  );
  const verbNames = listVerbsForEntity(state, agentId, entity).map((verb) => verb.name);
  return {
    entity,
    details: [
      ...componentWords,
      ...describeGroundWords(state, entity),
      ...listHoldingWords(state, contentEntities),
    ],
    verbs: [...new Set(verbNames)],
    contents: groupEntitiesForPrompt(state, agentId, contentEntities),
    hasVisibleContents: contentEntities.length > 0,
  };
}

function buildGroupKey(entry: EntityEntry): string {
  const { entity } = entry;
  if (entity.label !== null || entry.hasVisibleContents) return `entity:${entity.id}`;
  return `definition:${entity.definitionId}:${entry.details.join("|")}:${entry.verbs.join("|")}`;
}

/**
 * Entities as a prompt lists them: one entry per distinct line, identical unlabelled ones counted
 * together ("3 bread"). Each shows its words and verbs, and what the agent can see inside it as
 * nested entries.
 */
export function groupEntitiesForPrompt(
  state: WorldState,
  agentId: string,
  entities: readonly Entity[],
): PromptEntityGroup[] {
  const groups = new Map<string, EntityEntry[]>();
  for (const entity of entities) {
    const entry = buildEntityEntry(state, agentId, entity);
    const key = buildGroupKey(entry);
    groups.set(key, [...(groups.get(key) ?? []), entry]);
  }
  return [...groups.values()].flatMap((members) => {
    const [first] = members;
    if (!first) return [];
    const text =
      first.entity.label ?? describeCount(getDefinition(state, first.entity), members.length);
    return [{ text, details: first.details, verbs: first.verbs, contents: first.contents }];
  });
}

/** A dead body in sight: how it reads, and what it carries when the agent can see in. */
export function describeBodyForPrompt(
  state: WorldState,
  agentId: string,
  body: Agent,
): PromptEntityGroup {
  const contentEntities = listVisibleContents(state, agentId, { kind: "agent", agentId: body.id });
  return {
    text: describeAgentAsSeen(body),
    details: [
      ...listBodyWords(state.items, body, true),
      ...listHoldingWords(state, contentEntities),
    ],
    verbs: [],
    contents: groupEntitiesForPrompt(state, agentId, contentEntities),
  };
}
