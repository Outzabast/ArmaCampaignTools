// Map definition for Virolahti - Valtatie 7 (worldName vt7), values taken from the Atlas page.
// Coordinates everywhere in the app are Arma world meters: x = east, y = north.

export const WORLD_SIZE = 18001.9;
export const TILE_SIZE = 224;
// Pixels per meter at zoom 0 (one tile covers the whole world).
export const FACTOR = 0.012375;
// World Y at the top edge of the tile grid. Tile (0,0) is the north-west corner.
// Adjust if overlays look shifted north/south against known locations.
export const WORLD_TOP = WORLD_SIZE;

export const MIN_ZOOM = 0;
export const MAX_NATIVE_ZOOM = 6;
export const MAX_ZOOM = 9;

export interface TileLayerDef {
  id: string;
  label: string;
  url: string;
}

// "/tiles" is proxied to Atlas by Vite; the layer id (124 topo, 297 aerial) is part of the path.
export const TILE_LAYERS: TileLayerDef[] = [
  { id: "topo", label: "Topographic", url: "/tiles/124/{z}/{x}/{y}.webp" },
  { id: "aerial", label: "Aerial", url: "/tiles/297/{z}/{x}/{y}.webp" },
];

/** Maps an operation can be played on. Only the one map is wired up so far (see the settings above). */
export const MAPS = [{ id: "vt7", name: "Virolahti - Valtatie 7" }];
export const mapName = (id: string) => MAPS.find((m) => m.id === id)?.name ?? id;
