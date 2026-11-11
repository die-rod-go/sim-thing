import type { ConversationLink } from "./activity-cues";
import type { TiledPlace } from "./tiled-map";
import type { ElementRegistry } from "./world-layout";

/** Faint lines between agents in the same ongoing conversation; the frame loop sets endpoints. */
export function ConversationLinks({
  links,
  lineRegistry,
}: {
  links: readonly ConversationLink[];
  lineRegistry: ElementRegistry<SVGLineElement>;
}) {
  return (
    <svg className="village-links" aria-hidden="true">
      {links.map((link) => (
        <line key={link.key} ref={lineRegistry.register(link.key)} />
      ))}
    </svg>
  );
}

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
