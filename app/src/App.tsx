import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type L from "leaflet";
import { GameMap, type MeasureRequest } from "./map/GameMap";
import type { MeasureMode } from "./map/MeasureTool";
import { UnitLayer } from "./map/UnitLayer";
import { FrontlineLayer, SHAPE_COLOR, hitTestShape, type DrawControl, type DrawTool } from "./map/FrontlineLayer";
import { useStore } from "./store";
import { SIDES, SIDE_LABEL, type Side, type ShapeKind } from "./types";
import { UiCtx, type MenuItem, type Placing, type Tab } from "./ui/common";
import { ContextMenu } from "./ui/ContextMenu";
import { OrbatList } from "./ui/OrbatList";
import { OrbatModal } from "./ui/OrbatModal";
import { UnitEditor } from "./ui/UnitEditor";
import { VehicleLibrary } from "./ui/VehicleLibrary";
import { DRAW_TOOLS, FrontlinePanel, KIND_LABEL, type FrontState } from "./ui/FrontlinePanel";

const MIN_POINTS = { zone: 3, line: 2 } as const;

export function App() {
  const s = useStore();
  const [map, setMap] = useState<L.Map | null>(null);
  const [placing, setPlacingRaw] = useState<Placing>(null);
  const [visibleSides, setVisibleSides] = useState<Set<Side>>(new Set(SIDES));
  const [tab, setTab] = useState<Tab>("orbat");
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);

  const [measure, setMeasure] = useState<MeasureRequest>({ mode: "off", nonce: 0 });
  const [tool, setToolRaw] = useState<DrawTool | null>(null);
  const [drawCount, setDrawCount] = useState(0);
  const drawControl = useRef<DrawControl | null>(null);
  const [shapeId, setShapeId] = useState<string | null>(null);
  const [showFront, setShowFront] = useState(true);
  const [showPrevious, setShowPrevious] = useState(false);

  // One map tool at a time: starting any of measure / bearing / place unit / draw shape cancels the others.
  const startMeasure = useCallback((mode: MeasureMode, seed?: L.LatLng) => {
    if (mode !== "off") {
      setToolRaw(null);
      setPlacingRaw(null);
    }
    setMeasure((m) => (mode === "off" && m.mode === "off" ? m : { mode, seed, nonce: m.nonce + 1 }));
  }, []);
  const setPlacing = useCallback(
    (p: Placing) => {
      if (p) {
        setToolRaw(null);
        startMeasure("off");
      }
      setPlacingRaw(p);
    },
    [startMeasure],
  );
  const setTool = useCallback(
    (t: DrawTool | null) => {
      if (t) {
        setPlacingRaw(null);
        startMeasure("off");
      }
      setToolRaw(t);
    },
    [startMeasure],
  );

  const front = s.activeFront;
  const frontIdx = front ? s.frontlines.findIndex((f) => f.id === front.id) : -1;
  const previous = frontIdx > 0 ? s.frontlines[frontIdx - 1] : null;
  const fs: FrontState = { tool, setTool, selectedId: shapeId, setSelectedId: setShapeId, visible: showFront, setVisible: setShowFront, showPrevious, setShowPrevious };
  const onFrontTab = tab === "frontline";

  // Frontline tools only make sense while the Frontline tab is open.
  useEffect(() => {
    if (!onFrontTab) {
      setToolRaw(null);
      setShapeId(null);
    }
  }, [onFrontTab]);

  const center = useCallback(
    (id: number) => {
      const u = s.units.find((x) => x.id === id);
      if (map && u && u.x !== null && u.y !== null) map.panTo([u.y, u.x]);
    },
    [map, s.units],
  );

  // Placement mode: next map click creates a unit (or moves an existing one).
  useEffect(() => {
    if (!map || !placing) return;
    const container = map.getContainer();
    container.style.cursor = "copy";
    const onClick = async (e: L.LeafletMouseEvent) => {
      const x = Math.round(e.latlng.lng * 10) / 10;
      const y = Math.round(e.latlng.lat * 10) / 10;
      setPlacingRaw(null);
      if (placing.kind === "new") {
        const u = await s.createUnit({ side: placing.side, x, y });
        if (u) {
          s.select(u.id);
          setVisibleSides((v) => new Set(v).add(placing.side));
        }
      } else {
        await s.updateUnit(placing.unitId, { x, y });
      }
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setPlacingRaw(null);
    map.on("click", onClick);
    const cancel = () => setPlacingRaw(null);
    map.on("contextmenu", cancel);
    document.addEventListener("keydown", onKey);
    return () => {
      container.style.cursor = "";
      map.off("click", onClick);
      map.off("contextmenu", cancel);
      document.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, placing]);

  const showTab = useCallback((t: Tab) => setTab(t), []);

  const startDraw = (t: DrawTool) => {
    setTab("frontline");
    setTool(t);
  };

  // Right-click on empty map / a frontline shape. Reads current state through a ref so the listener is attached once.
  const onContext = (e: L.LeafletMouseEvent) => {
    if (!map || measure.mode !== "off" || tool || placing) return; // an active tool owns the right-click
    const x = Math.round(e.latlng.lng);
    const y = Math.round(e.latlng.lat);
    const items: MenuItem[] = [];

    const shape = front ? hitTestShape(map, front.shapes, e.latlng) : null;
    if (front && shape) {
      const patch = (p: Partial<typeof shape>) => s.saveShapes(front.id, front.shapes.map((sh) => (sh.id === shape.id ? { ...sh, ...p } : sh)));
      items.push({ header: `${KIND_LABEL[shape.kind]}${shape.label ? ` — ${shape.label}` : ""}` });
      items.push({ label: "Select and reshape", onClick: () => { setTab("frontline"); setShapeId(shape.id); } });
      if (shape.type === "zone") {
        for (const k of ["friend", "hostile", "contested"] as ShapeKind[]) {
          if (k !== shape.kind) items.push({ label: `Change to ${KIND_LABEL[k].toLowerCase()}`, onClick: () => patch({ kind: k }) });
        }
      }
      items.push({ label: "Rename…", onClick: () => { const v = prompt("Label for this shape", shape.label); if (v !== null) patch({ label: v.trim() }); } });
      items.push({ label: "Delete shape", danger: true, onClick: () => { s.saveShapes(front.id, front.shapes.filter((sh) => sh.id !== shape.id)); setShapeId(null); } });
      items.push({ separator: true });
    }

    items.push({ header: `Add unit here  (${x}, ${y})` });
    for (const side of SIDES) {
      items.push({
        label: SIDE_LABEL[side],
        onClick: async () => {
          const u = await s.createUnit({ side, x, y });
          if (u) {
            s.select(u.id);
            setVisibleSides((v) => new Set(v).add(side));
            setTab("orbat");
          }
        },
      });
    }

    items.push({ separator: true }, { header: "Frontline" });
    if (front) {
      for (const d of DRAW_TOOLS) items.push({ label: `Draw ${d.label.toLowerCase()}`, onClick: () => startDraw(d.tool) });
    } else {
      items.push({ label: "Create a frontline snapshot first…", onClick: () => setTab("frontline") });
    }

    items.push(
      { separator: true },
      { header: "Measure" },
      { label: "Measure distance from here", onClick: () => startMeasure("path", e.latlng) },
      { label: "Bearing from here", onClick: () => startMeasure("bearing", e.latlng) },
      { label: "Copy coordinates", onClick: () => void navigator.clipboard?.writeText(`${x}, ${y}`) },
    );
    setMenu({ x: e.containerPoint.x, y: e.containerPoint.y, items });
  };
  const contextRef = useRef(onContext);
  contextRef.current = onContext;
  useEffect(() => {
    if (!map) return;
    const h = (e: L.LeafletMouseEvent) => contextRef.current(e);
    map.on("contextmenu", h);
    return () => void map.off("contextmenu", h);
  }, [map]);

  const closeMenu = useCallback(() => setMenu(null), []);

  const ui = useMemo(
    () => ({
      openMenu: (items: MenuItem[], at: { x: number; y: number }) => setMenu({ ...at, items }),
      showTab,
      placing,
      setPlacing,
      center,
      visibleSides,
      toggleSide: (side: Side) =>
        setVisibleSides((v) => {
          const n = new Set(v);
          if (n.has(side)) n.delete(side);
          else n.add(side);
          return n;
        }),
    }),
    [placing, setPlacing, showTab, center, visibleSides],
  );

  const selected = s.units.find((u) => u.id === s.selectedId) ?? null;
  const placingBanner = placing
    ? placing.kind === "new"
      ? `Click the map to place a ${SIDE_LABEL[placing.side]} unit — Esc or right-click to cancel`
      : "Click the map to set the unit's position — Esc or right-click to cancel"
    : null;
  const idleHint = onFrontTab && front && front.shapes.length === 0 && !tool && !placingBanner;

  return (
    <UiCtx.Provider value={ui}>
      <div className="app">
        <div className="map-area">
          <GameMap onReady={(m) => setMap(m)} measure={measure} onMeasureMode={startMeasure}>
            {placingBanner && <div className="banner">{placingBanner}</div>}
            {idleHint && <div className="banner">Nothing drawn yet — choose a shape in the panel (or right-click the map), then click points on the map</div>}
            {tool && (
              <div className="hud">
                <div className="hud-row">
                  <span className="swatch" style={{ background: SHAPE_COLOR[tool.kind] }} />
                  <b>Drawing {DRAW_TOOLS.find((d) => d.tool.kind === tool.kind)?.label.toLowerCase()}</b>
                  <span>· {drawCount} point{drawCount === 1 ? "" : "s"}</span>
                  <button disabled={drawCount === 0} onClick={() => drawControl.current?.undo()}>↶ Undo point</button>
                  <button className="primary" disabled={drawCount < MIN_POINTS[tool.type]} onClick={() => drawControl.current?.finish()}>✔ Finish</button>
                  <button onClick={() => setTool(null)}>✕ Cancel</button>
                </div>
                <small>
                  Click to add points ({drawCount < MIN_POINTS[tool.type] ? `need ${MIN_POINTS[tool.type] - drawCount} more` : "ready to finish"}) · double-click or Enter finishes · Backspace undoes
                  {tool.type === "zone" ? " · click the first point to close" : ""}
                </small>
              </div>
            )}
            {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={closeMenu} />}
          </GameMap>
          <FrontlineLayer
            map={map}
            frontline={front}
            previous={previous}
            visible={showFront}
            showPrevious={showPrevious && onFrontTab}
            editing={onFrontTab}
            tool={onFrontTab ? tool : null}
            selectedId={shapeId}
            controlRef={drawControl}
            onProgress={setDrawCount}
            onSelect={setShapeId}
            onChange={(shapes) => front && s.saveShapes(front.id, shapes)}
            onToolDone={() => setToolRaw(null)}
          />
          <UnitLayer map={map} visibleSides={visibleSides} />
        </div>
        <aside className="panel">
          <nav className="tabs">
            <button className={tab === "orbat" ? "active" : ""} onClick={() => setTab("orbat")}>ORBAT</button>
            <button className={tab === "vehicles" ? "active" : ""} onClick={() => setTab("vehicles")}>Vehicles</button>
            <button className={tab === "frontline" ? "active" : ""} onClick={() => setTab("frontline")}>Frontline</button>
          </nav>
          {s.error && (
            <div className="error" onClick={s.clearError}>{s.error} <small>(click to dismiss)</small></div>
          )}
          <div className="panel-body">
            {tab === "frontline" ? <FrontlinePanel fs={fs} /> : tab === "vehicles" ? <VehicleLibrary /> : selected ? <UnitEditor key={selected.id} unit={selected} /> : <OrbatList />}
          </div>
        </aside>
        {s.orbatViewId !== null && <OrbatModal unitId={s.orbatViewId} onClose={() => s.openOrbat(null)} />}
      </div>
    </UiCtx.Provider>
  );
}
