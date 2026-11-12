# Maps

`village.json` is a Tiled JSON map (16 px tiles). Edit it in the map editor (`/maps.html` while
`make dev` runs, or "Edit map" in the village's settings menu): it sets the map size, paints
tiles, and places places, items and each character's start tile. Saving writes this file; the
village uses it from its next reset. The file still opens in Tiled.

Everything is drawn from `acorn-tileset-8x8.png`, a 16×16 sheet of 8 px CP437 glyphs, white on
transparent. A **glyph** is `{ index, color, background? }`: the CP437 code of a cell in the
sheet, the color it's tinted, and an optional fill behind it. Each tileset tile carries its glyph
as the properties `glyph` (int), `color` and `background` (`#rrggbb` strings); the village view
draws terrain from those and items from the `glyph` of their definition in `seeds/items.json`.
`tileset.png` is only a pre-tinted preview so the map looks right in Tiled; the client never loads
it. The sim itself only reads the layers below, not tile art.

## Layer conventions

| Layer     | Kind         | Meaning                                                                                              |
| --------- | ------------ | ---------------------------------------------------------------------------------------------------- |
| `ground`  | tile layer   | Floor art                                                                                            |
| `walls`   | tile layer   | Any non-zero tile blocks movement and sight                                                          |
| `decor`   | tile layer   | Art only (furniture, trees); never blocks                                                            |
| `places`  | object layer | Rectangles; `name` is the place name, bool `isIndoor`. Indoor rectangles include their walls         |
| `objects` | object layer | One 16×16 rectangle per item at its tile; properties `name` (unique) and `definition` (`items.json`) |
| `starts`  | object layer | Points named after seed agent ids: where each character wakes on day 1                               |

Tiles outside every place belong to `village road`; an item's place is the place its tile is in.
Tileset tiles carry a bool `collides` property for Tiled users.
