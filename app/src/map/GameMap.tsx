import { useEffect, useRef, useState, type ReactNode } from "react";
import L from "leaflet";
import { ArmaCRS } from "./crs";
import { ArmaGrid } from "./GridLayer";
import { MeasureTool, type MeasureMode } from "./MeasureTool";
import { MAX_NATIVE_ZOOM, MAX_ZOOM, MIN_ZOOM, TILE_LAYERS, TILE_SIZE, WORLD_SIZE } from "./config";

export interface MeasureRequest {
  mode: MeasureMode;
  /** Optional first point; `nonce` makes a repeated request (same mode) re-apply. */
  seed?: L.LatLng;
  nonce: number;
}

interface Props {
  onReady?: (map: L.Map, measure: MeasureTool) => void;
  measure: MeasureRequest;
  onMeasureMode: (mode: MeasureMode) => void;
  children?: ReactNode;
}

export function GameMap({ onReady, measure, onMeasureMode, children }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map>();
  const tilesRef = useRef<Record<string, L.TileLayer>>({});
  const gridRef = useRef<ArmaGrid>();
  const measureRef = useRef<MeasureTool>();

  const [layer, setLayer] = useState(TILE_LAYERS[0].id);
  const [grid, setGrid] = useState(true);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const map = L.map(el.current!, {
      crs: ArmaCRS,
      minZoom: MIN_ZOOM,
      maxZoom: MAX_ZOOM,
      zoomSnap: 0.25,
      attributionControl: true,
      maxBounds: L.latLngBounds([-2000, -2000], [WORLD_SIZE + 2000, WORLD_SIZE + 2000]),
    });
    map.attributionControl.addAttribution("© Bohemia Interactive, furean");
    L.control.scale({ metric: true, imperial: false, maxWidth: 160 }).addTo(map);

    for (const def of TILE_LAYERS) {
      tilesRef.current[def.id] = L.tileLayer(def.url, {
        tileSize: TILE_SIZE,
        minNativeZoom: MIN_ZOOM,
        maxNativeZoom: MAX_NATIVE_ZOOM,
        maxZoom: MAX_ZOOM,
        noWrap: true,
        // Tiles are indexed from the NW corner; Leaflet's CRS.Simple y already runs downward in tile space.
        bounds: L.latLngBounds([0, 0], [WORLD_SIZE, WORLD_SIZE]),
      });
    }
    tilesRef.current[TILE_LAYERS[0].id].addTo(map);

    gridRef.current = new ArmaGrid().addTo(map);
    measureRef.current = new MeasureTool(map);
    map.fitBounds([[0, 0], [WORLD_SIZE, WORLD_SIZE]]);
    map.on("mousemove", (e: L.LeafletMouseEvent) => setCursor({ x: e.latlng.lng, y: e.latlng.lat }));
    map.on("mouseout", () => setCursor(null));
    mapRef.current = map;
    onReady?.(map, measureRef.current);
    return () => {
      map.remove();
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    for (const [id, tl] of Object.entries(tilesRef.current)) {
      if (id === layer) tl.addTo(map);
      else tl.remove();
    }
  }, [layer]);

  useEffect(() => {
    const map = mapRef.current;
    const g = gridRef.current;
    if (!map || !g) return;
    if (grid) g.addTo(map);
    else g.remove();
  }, [grid]);

  useEffect(() => measureRef.current?.setMode(measure.mode, measure.seed), [measure]);

  const mode = measure.mode;
  const toggleMode = (m: MeasureMode) => onMeasureMode(mode === m ? "off" : m);

  return (
    <div className="gamemap">
      <div ref={el} className="map" />
      <div className="toolbar">
        {TILE_LAYERS.map((l) => (
          <button key={l.id} className={layer === l.id ? "active" : ""} onClick={() => setLayer(l.id)}>
            {l.label}
          </button>
        ))}
        <span className="sep" />
        <button className={grid ? "active" : ""} onClick={() => setGrid((g) => !g)}>Grid</button>
        <span className="sep" />
        <button className={mode === "path" ? "active" : ""} onClick={() => toggleMode("path")}>Measure</button>
        <button className={mode === "bearing" ? "active" : ""} onClick={() => toggleMode("bearing")}>Bearing</button>
        <button onClick={() => measureRef.current?.clear()}>Clear</button>
      </div>
      {children}
      <div className="coords">
        {cursor
          ? `X ${Math.round(cursor.x)}  Y ${Math.round(cursor.y)}  |  ${String(Math.floor(cursor.x / 10)).padStart(4, "0")} ${String(Math.floor(cursor.y / 10)).padStart(4, "0")}`
          : "—"}
      </div>
    </div>
  );
}
