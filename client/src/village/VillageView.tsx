import { useEffect, useRef, useState } from "react";
import * as Phaser from "phaser";
import type { MapStatus, SceneBridge } from "./sceneBridge";
import { VillageScene } from "./VillageScene";

const CANVAS_BACKGROUND = "#14161c";

interface VillageViewProps {
  bridge: SceneBridge;
}

/** Hosts the Phaser game; it is created once per bridge and never re-created on re-render. */
export function VillageView({ bridge }: VillageViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [mapStatus, setMapStatus] = useState<MapStatus>({ kind: "loading" });

  useEffect(() => bridge.on("mapStatusChanged", setMapStatus), [bridge]);

  useEffect(() => {
    const parent = containerRef.current;
    if (!parent) return;
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent,
      backgroundColor: CANVAS_BACKGROUND,
      pixelArt: true,
      // Phaser 4 defaults roundPixels to false; pixel art needs it to stay crisp.
      roundPixels: true,
      scale: { mode: Phaser.Scale.RESIZE, width: parent.clientWidth, height: parent.clientHeight },
      scene: new VillageScene(bridge),
    });
    return () => game.destroy(true);
  }, [bridge]);

  return (
    <div className="village-view">
      <div className="village-canvas" ref={containerRef} />
      {mapStatus.kind === "loading" && <div className="village-notice">Loading map…</div>}
      {mapStatus.kind === "error" && (
        <div className="village-notice village-notice-error">
          <strong>The village map failed to load.</strong>
          <span>{mapStatus.message}</span>
          <span>
            Generate it with <code>npm run generate-map</code> (writes maps/village.json and
            maps/tileset.png), then reload.
          </span>
        </div>
      )}
    </div>
  );
}
