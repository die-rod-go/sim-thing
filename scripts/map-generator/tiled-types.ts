/** The subset of the Tiled JSON map format the generator writes. */
export interface TiledProperty {
  name: string;
  type: "bool" | "int" | "string";
  value: boolean | number | string;
}

export interface TiledObject {
  id: number;
  name: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  visible: boolean;
  point?: boolean;
  properties?: TiledProperty[];
}

export interface TiledTileLayer {
  id: number;
  name: string;
  type: "tilelayer";
  width: number;
  height: number;
  x: number;
  y: number;
  opacity: number;
  visible: boolean;
  data: number[];
}

export interface TiledObjectLayer {
  id: number;
  name: string;
  type: "objectgroup";
  draworder: "topdown";
  x: number;
  y: number;
  opacity: number;
  visible: boolean;
  objects: TiledObject[];
}

export interface TiledMap {
  type: "map";
  version: string;
  tiledversion: string;
  orientation: "orthogonal";
  renderorder: "right-down";
  infinite: false;
  compressionlevel: number;
  width: number;
  height: number;
  tilewidth: number;
  tileheight: number;
  nextlayerid: number;
  nextobjectid: number;
  layers: (TiledTileLayer | TiledObjectLayer)[];
  tilesets: Record<string, unknown>[];
}
