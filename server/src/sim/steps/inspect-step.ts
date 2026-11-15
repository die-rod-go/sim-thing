import { buildDefinitionNamer, listComponentWords } from "@village/shared";
import { config } from "../../config";
import { describeEntityName, findEntityIfPresent, listContents } from "../../items/entity-store";
import { describeThingName, readComponents, readThingId, type ThingRef } from "../../items/things";
import { canSeeInto } from "../../items/world-physics";
import { describeItemCounts } from "../action-phrases";
import { appendToStream } from "../world-access";
import type { WorldState } from "../world-state";
import { findUserAgent } from "../verb-user";
import { findStepThings, requireVerbRun } from "./step-roles";
import { DONE, type StepHandler } from "./step-run";

/** "bakery chest" for an entity, as memories name things; a body or person by its name. */
function nameThing(state: WorldState, thing: ThingRef): string {
  const entity = thing.kind === "entity" ? findEntityIfPresent(state, thing.entityId) : undefined;
  return entity ? describeEntityName(state, entity) : describeThingName(state, thing);
}

/** "holding 3 bread and 2 coins", or null when nothing is inside. */
function describeContents(state: WorldState, thing: ThingRef): string | null {
  const counts: Record<string, number> = {};
  for (const entity of listContents(state, readThingId(thing))) {
    counts[entity.definitionId] = (counts[entity.definitionId] ?? 0) + 1;
  }
  if (Object.keys(counts).length === 0) return null;
  const items = describeItemCounts(state.items, counts);
  return config.perception.contentsWords.holding.split("{items}").join(items);
}

/** What the inspector makes of the thing: its visible state, then what is inside it, counted. */
function inspect(
  state: WorldState,
  inspectorId: string,
  thing: ThingRef,
  emptyText: string | undefined,
): string[] {
  const stateWords = listComponentWords(
    state.items.declarations,
    readComponents(state, thing) ?? {},
    true,
    buildDefinitionNamer(state.items),
  );
  if (!canSeeInto(state, inspectorId, thing)) return [...stateWords, config.inspecting.hiddenText];
  const contents = describeContents(state, thing);
  if (contents !== null) return [...stateWords, contents];
  return emptyText === undefined ? stateWords : [...stateWords, emptyText];
}

function describeInspection(
  state: WorldState,
  inspectorId: string,
  thing: ThingRef,
  emptyText: string | undefined,
): string {
  const details = inspect(state, inspectorId, thing, emptyText);
  return config.inspecting.memory
    .split("{thing}")
    .join(nameThing(state, thing))
    .split("{details}")
    .join(details.length > 0 ? details.join(", ") : config.inspecting.nothingOfNoteText);
}

/**
 * The user's stream gets what it finds on looking the thing over: its visible state
 * ("10 left") and what is inside it, counted, or `emptyText` when nothing is. A recount is new
 * evidence at a new time, so it is filed even when it reads the same as the last one.
 */
export const inspectStep: StepHandler<"inspect"> = {
  isVerbOnly: true,
  run(run, step) {
    const { state } = run.context;
    const inspectorId = requireVerbRun(run, "inspect").userId;
    if (findUserAgent(state, inspectorId) === null) return DONE;
    for (const thing of findStepThings(run, step.on ?? "self")) {
      appendToStream(
        state,
        inspectorId,
        describeInspection(state, inspectorId, thing, step.emptyText),
      );
    }
    return DONE;
  },
};
