import type { Entity, ThingCatalog } from "@village/shared";
import { listTileConditionOverlays } from "../format/conditions";

interface EntityConditionOverlaysProps {
  entities: readonly Entity[];
  catalog: ThingCatalog;
  tileSize: number;
}

/** Visible components on things standing on tiles (a door on fire), drawn over their tiles. */
export function EntityConditionOverlays({
  entities,
  catalog,
  tileSize,
}: EntityConditionOverlaysProps) {
  return (
    <>
      {listTileConditionOverlays(entities, catalog).map((overlay) => (
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
