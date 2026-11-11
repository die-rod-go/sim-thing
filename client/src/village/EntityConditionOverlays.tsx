import type { ConditionDefinition, Entity } from "@village/shared";
import { listTileConditionOverlays } from "../format/conditions";

interface EntityConditionOverlaysProps {
  entities: readonly Entity[];
  definitions: readonly ConditionDefinition[];
  tileSize: number;
}

/** Visible conditions on things standing on tiles (a door on fire), drawn over their tiles. */
export function EntityConditionOverlays({
  entities,
  definitions,
  tileSize,
}: EntityConditionOverlaysProps) {
  return (
    <>
      {listTileConditionOverlays(entities, definitions).map((overlay) => (
        <span
          key={overlay.key}
          className={`condition-overlay tile-condition condition-${overlay.conditionName}`}
          style={{
            left: overlay.tileX * tileSize,
            top: overlay.tileY * tileSize,
            width: tileSize,
            height: tileSize,
          }}
        />
      ))}
    </>
  );
}
