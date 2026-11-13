import {
  buildDefinitionNamer,
  findDefinition,
  listComponentWords,
  type Memory,
} from "@village/shared";
import { config } from "../../config";
import { describeEntityName, findEntityIfPresent, listContents } from "../../items/entity-store";
import {
  describeThingName,
  locateThing,
  readComponents,
  readThingId,
  type ThingRef,
} from "../../items/things";
import { canSeeInto } from "../../items/world-physics";
import { truncateMemoryText } from "../../memory/filing";
import { uniqueTags } from "../../memory/tags";
import { describeItemCounts } from "../action-phrases";
import { rememberBriefly } from "../world-access";
import type { WorldState } from "../world-state";
import { findStepThings, requireVerbRun } from "./step-roles";
import { DONE, type StepHandler } from "./step-run";

interface Inspection {
  details: string[];
  /** The names of what was found inside, for recall. */
  contentNames: string[];
}

/** "bakery chest" for an entity, as memories name things; a body or person by its name. */
function nameThing(state: WorldState, thing: ThingRef): string {
  const entity = thing.kind === "entity" ? findEntityIfPresent(state, thing.entityId) : undefined;
  return entity ? describeEntityName(state, entity) : describeThingName(state, thing);
}

/** "holding 3 bread and 2 coins", or null when nothing is inside. */
function describeContents(state: WorldState, thing: ThingRef): Inspection | null {
  const counts: Record<string, number> = {};
  for (const entity of listContents(state, readThingId(thing))) {
    counts[entity.definitionId] = (counts[entity.definitionId] ?? 0) + 1;
  }
  const definitionIds = Object.keys(counts);
  if (definitionIds.length === 0) return null;
  const items = describeItemCounts(state.items, counts);
  return {
    details: [config.perception.contentsWords.holding.split("{items}").join(items)],
    contentNames: definitionIds.map(
      (definitionId) => findDefinition(state.items, definitionId).name,
    ),
  };
}

/** What the inspector makes of the thing: its visible state, then what is inside it, counted. */
function inspect(
  state: WorldState,
  inspectorId: string,
  thing: ThingRef,
  emptyText: string | undefined,
): Inspection {
  const stateWords = listComponentWords(
    state.items.declarations,
    readComponents(state, thing) ?? {},
    true,
    buildDefinitionNamer(state.items),
  );
  if (!canSeeInto(state, inspectorId, thing)) {
    return { details: [...stateWords, config.inspecting.hiddenText], contentNames: [] };
  }
  const contents = describeContents(state, thing);
  if (contents !== null) {
    return { details: [...stateWords, ...contents.details], contentNames: contents.contentNames };
  }
  const empty = emptyText === undefined ? [] : [emptyText];
  return { details: [...stateWords, ...empty], contentNames: [] };
}

function buildInspectionMemory(
  state: WorldState,
  inspectorId: string,
  thing: ThingRef,
  emptyText: string | undefined,
): Memory {
  const name = nameThing(state, thing);
  const { details, contentNames } = inspect(state, inspectorId, thing, emptyText);
  const text = config.inspecting.memory
    .split("{thing}")
    .join(name)
    .split("{details}")
    .join(details.length > 0 ? details.join(", ") : config.inspecting.nothingOfNoteText);
  return {
    id: state.memoryIds.nextId(inspectorId, state.tick),
    agentId: inspectorId,
    bucket: "seen",
    tick: state.tick,
    text: truncateMemoryText(text),
    tags: uniqueTags([name, locateThing(state, thing)?.place, ...contentNames]),
    strength: config.memory.newMemoryStrength,
    lastRecalledTick: null,
  };
}

/**
 * The user files a `seen` memory of what it finds on looking the thing over: its visible state
 * ("10 left") and what is inside it, counted, or `emptyText` when nothing is. A recount is new
 * evidence at a new time, so it is filed even when it reads the same as the last one.
 */
export const inspectStep: StepHandler<"inspect"> = {
  isVerbOnly: true,
  run(run, step) {
    const { state } = run.context;
    const inspectorId = requireVerbRun(run, "inspect").agentId;
    for (const thing of findStepThings(run, step.on ?? "self")) {
      const memory = buildInspectionMemory(state, inspectorId, thing, step.emptyText);
      state.memoryStore.add(memory);
      rememberBriefly(state, inspectorId, memory.text);
    }
    return DONE;
  },
};
