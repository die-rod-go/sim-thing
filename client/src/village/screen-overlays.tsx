import type { TiledPlace } from "./tiled-map";
import type { ElementRegistry } from "./world-layout";

/** Place names along the top edge of each place, placed by the frame loop. */
export function PlaceLabels({
  places,
  labelRegistry,
}: {
  places: readonly TiledPlace[];
  labelRegistry: ElementRegistry;
}) {
  return (
    <>
      {places.map((place) => (
        <div key={place.name} className="place-label" ref={labelRegistry.register(place.name)}>
          <span>{place.name}</span>
        </div>
      ))}
    </>
  );
}
