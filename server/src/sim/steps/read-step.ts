import type { Entity, Memory, StepOfType } from "@village/shared";
import { config } from "../../config";
import { findEntityIfPresent, getDefinition, listContents } from "../../items/entity-store";
import { locateThing, readField, type ThingRef } from "../../items/things";
import { readThingName, scopeOf } from "../../items/values";
import { truncateMemoryText } from "../../memory/filing";
import { extractTags, uniqueTags } from "../../memory/tags";
import { listKnownNames, rememberBriefly } from "../world-access";
import type { WorldState } from "../world-state";
import { findStepThings, requireVerbRun } from "./step-roles";
import { DONE, type StepHandler, type StepRun } from "./step-run";

/** One text found, with what bore it and (when it was inside what is read) what that was. */
interface FoundText {
  text: string;
  author: string;
  thingName: string;
  holderName: string | null;
}

function readTextField(state: WorldState, thing: ThingRef, path: string | undefined): string {
  if (path === undefined) return "";
  const value = readField(state, thing, path);
  return typeof value === "string" ? value.trim() : "";
}

function describeBearer(state: WorldState, entity: Entity): string {
  return getDefinition(state, entity).name;
}

/** The text on the thing itself, then on the newest things directly inside it that have the field. */
function findTexts(run: StepRun, step: StepOfType<"read">, thing: ThingRef): FoundText[] {
  const { state } = run.context;
  const thingName = readThingName(scopeOf(run), step.on ?? "self");
  const found: FoundText[] = [];
  const own = readTextField(state, thing, step.field);
  if (own !== "") {
    const bearer = thing.kind === "entity" ? findEntityIfPresent(state, thing.entityId) : undefined;
    found.push({
      text: own,
      author: readTextField(state, thing, step.author),
      thingName: bearer ? describeBearer(state, bearer) : thingName,
      holderName: null,
    });
  }
  if (thing.kind !== "entity") return found;
  const inside = listContents(state, thing.entityId)
    .reverse()
    .filter(
      (entity) =>
        readField(state, { kind: "entity", entityId: entity.id }, step.field) !== undefined,
    )
    .slice(0, config.reading.thingsShownOnRead);
  for (const entity of inside) {
    const ref: ThingRef = { kind: "entity", entityId: entity.id };
    const text = readTextField(state, ref, step.field);
    if (text === "") continue;
    found.push({
      text,
      author: readTextField(state, ref, step.author),
      thingName: describeBearer(state, entity),
      holderName: thingName,
    });
  }
  return found;
}

function fillTemplate(template: string, values: Record<string, string>): string {
  return Object.entries(values).reduce(
    (text, [placeholder, value]) => text.split(`{${placeholder}}`).join(value),
    template,
  );
}

function pickTemplate(found: FoundText): string {
  const { memories } = config.reading;
  const hasAuthor = found.author !== "";
  const hasHolder = found.holderName !== null;
  if (hasAuthor && hasHolder) return memories.withAuthorAndHolder;
  if (hasAuthor) return memories.withAuthor;
  return hasHolder ? memories.withHolder : memories.plain;
}

function buildTextMemory(
  state: WorldState,
  readerId: string,
  thing: ThingRef,
  found: FoundText,
): Memory {
  const place = locateThing(state, thing)?.place ?? "";
  const text = fillTemplate(pickTemplate(found), {
    thing: found.thingName,
    holder: found.holderName ?? "",
    author: found.author,
    text: found.text,
  });
  return {
    id: state.memoryIds.nextId(readerId, state.tick),
    agentId: readerId,
    bucket: "seen",
    tick: state.tick,
    text: truncateMemoryText(text),
    tags: uniqueTags([
      found.author,
      found.holderName ?? found.thingName,
      place,
      ...extractTags(found.text, listKnownNames(state)),
    ]),
    strength: config.memory.newMemoryStrength,
    lastRecalledTick: null,
  };
}

function readThing(
  run: StepRun,
  step: StepOfType<"read">,
  thing: ThingRef,
  readerId: string,
): void {
  const { state } = run.context;
  const texts = findTexts(run, step, thing);
  if (texts.length === 0) {
    const nothing = fillTemplate(config.reading.nothingToRead, {
      thing: readThingName(scopeOf(run), step.on ?? "self"),
    });
    rememberBriefly(state, readerId, nothing);
    return;
  }
  const existingTexts = new Set(
    state.memoryStore.listByAgent(readerId).map((memory) => memory.text),
  );
  for (const found of texts) {
    const memory = buildTextMemory(state, readerId, thing, found);
    if (existingTexts.has(memory.text)) continue;
    state.memoryStore.add(memory);
    rememberBriefly(state, readerId, memory.text);
  }
}

/** The user files `seen` memories of the text on the thing and on the newest things inside it. */
export const readStep: StepHandler<"read"> = {
  isVerbOnly: true,
  run(run, step) {
    const readerId = requireVerbRun(run, "read").agentId;
    for (const thing of findStepThings(run, step.on ?? "self"))
      readThing(run, step, thing, readerId);
    return DONE;
  },
};
