import type { Entity } from "@village/shared";
import {
  listContents,
  moveEntity,
  removeEntity,
  resolveEntityPosition,
} from "../../items/entity-store";
import { markEntityChanged, markEntityRemoved } from "../world-access";
import type { TickContext } from "../tick-context";
import { recordTouched } from "./step-roles";
import type { StepRun } from "./step-run";

/** What a destroyed container held falls where it stood, so nothing is lost with it. */
function spillContents(context: TickContext, container: Entity): void {
  const { state, result } = context;
  const position = resolveEntityPosition(state, container);
  if (!position) return;
  for (const entity of listContents(state, container.id)) {
    moveEntity(state, entity.id, { kind: "tile", place: position.place, pos: { ...position.pos } });
    markEntityChanged(result, entity.id);
  }
}

/** Removes the entities for good; what was inside each goes to where it was. */
export function destroyEntities(run: StepRun, entities: readonly Entity[]): void {
  const { context } = run;
  for (const entity of entities) {
    spillContents(context, entity);
    removeEntity(context.state, entity.id);
    markEntityRemoved(context.result, entity.id);
  }
  recordTouched(
    run,
    entities.map((entity) => entity.id),
  );
}
