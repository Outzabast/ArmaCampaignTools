import { useEffect, useRef, useState } from "react";
import { useStore } from "../store";
import type { Shape, ShapeKind } from "../types";
import { areaKm2, SHAPE_COLOR, type DrawMode, type DrawTool } from "../map/FrontlineLayer";
import { TextField } from "./common";
import { SitrepPanel, SITREP_SIDES } from "./SitrepPanel";

export interface FrontState {
  tool: DrawTool | null;
  setTool: (t: DrawTool | null) => void;
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
  visible: boolean;
  setVisible: (v: boolean) => void;
  showPrevious: boolean;
  setShowPrevious: (v: boolean) => void;
  drawMode: DrawMode;
  setDrawMode: (m: DrawMode) => void;
  /** Freehand simplification tolerance, screen px. */
  detail: number;
  setDetail: (px: number) => void;
  simplify: (shapeId: string) => void;
  /** Frontline tab sub-view: drawing shapes, or the snapshot's SITREPs. */
  view: FrontView;
  setView: (v: FrontView) => void;
}

export type FrontView = "draw" | "sitrep";

const DETAIL: [label: string, px: number][] = [
  ["Fine", 1.5],
  ["Medium", 3],
  ["Coarse", 6],
];

/** Points vs freehand drawing style, shared by the panel and the on-map drawing bar. */
export function DrawModeSwitch({ fs }: { fs: FrontState }) {
  return (
    <div className="mode-switch">
      <div className="seg">
        <button className={fs.drawMode === "points" ? "active" : ""} onClick={() => fs.setDrawMode("points")} title="Click each corner">◉ Points</button>
        <button className={fs.drawMode === "freehand" ? "active" : ""} onClick={() => fs.setDrawMode("freehand")} title="Press and drag to trace">✎ Freehand</button>
      </div>
      {fs.drawMode === "freehand" && (
        <label className="inline" title="How closely the traced line is followed. Fine keeps more points.">
          Detail
          <select value={fs.detail} onChange={(e) => fs.setDetail(Number(e.target.value))}>
            {DETAIL.map(([l, px]) => <option key={l} value={px}>{l}</option>)}
          </select>
        </label>
      )}
    </div>
  );
}

export const KIND_LABEL: Record<ShapeKind, string> = {
  friend: "Friendly area",
  hostile: "Hostile area",
  contested: "Contested area",
  front: "Front line",
};

export const DRAW_TOOLS: { icon: string; label: string; desc: string; tool: DrawTool }[] = [
  { icon: "■", label: "Friendly area", desc: "Territory your side holds", tool: { type: "zone", kind: "friend" } },
  { icon: "■", label: "Hostile area", desc: "Territory the enemy holds", tool: { type: "zone", kind: "hostile" } },
  { icon: "▨", label: "Contested area", desc: "Fighting or unclear control", tool: { type: "zone", kind: "contested" } },
  { icon: "━", label: "Front line", desc: "The line of contact (a line, not an area)", tool: { type: "line", kind: "front" } },
];

const nowLocal = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};

const fmt = (iso: string) => {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
};

function DateField({ value, onCommit }: { value: string; onCommit: (v: string) => void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <input type="datetime-local" value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={() => draft && draft !== value && onCommit(draft)} />
  );
}

function Guide({ hasSnapshot, hasShapes, drawing }: { hasSnapshot: boolean; hasShapes: boolean; drawing: boolean }) {
  const [open, setOpen] = useState(true);
  const step = !hasSnapshot ? 1 : drawing ? 3 : !hasShapes ? 2 : 4;
  const cls = (n: number) => (n < step ? "done" : n === step ? "now" : "");
  return (
    <div className="guide">
      <b onClick={() => setOpen(!open)} style={{ cursor: "pointer" }}>{open ? "▾" : "▸"} How to draw the frontline</b>
      {open && (
        <ol>
          <li className={cls(1)}>Create a snapshot — a dated copy of the frontline and where units are on the map.</li>
          <li className={cls(2)}>Pick what to draw below (or right-click the map): an <b>area</b> for who holds the ground, or a <b>front line</b> for the line of contact.</li>
          <li className={cls(3)}>Click points on the map, or switch to <b>Freehand</b> and drag along a terrain feature. Finish with <b>double-click</b>, <b>Enter</b> or the Finish button. Backspace undoes the last point or stroke.</li>
          <li className={cls(4)}>Adjust: click a shape, drag its square handles, click the yellow dots to add a point, right-click a handle to remove it.</li>
        </ol>
      )}
    </div>
  );
}

export function FrontlinePanel({ fs }: { fs: FrontState }) {
  const s = useStore();
  const front = s.activeFront;
  const list = s.frontlines;
  const idx = front ? list.findIndex((f) => f.id === front.id) : -1;
  const [adding, setAdding] = useState(false);
  const [newDate, setNewDate] = useState(nowLocal());
  const [newLabel, setNewLabel] = useState("");

  // Switching snapshot must not leave a half-drawn tool or a selection from the other snapshot.
  const lastId = useRef(front?.id);
  useEffect(() => {
    if (lastId.current !== front?.id) {
      fs.setTool(null);
      fs.setSelectedId(null);
    }
    lastId.current = front?.id;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [front?.id]);

  const reportCount = front ? s.sitreps.filter((r) => r.frontline_id === front.id && SITREP_SIDES.includes(r.side)).length : 0;
  const selected = front?.shapes.find((sh) => sh.id === fs.selectedId) ?? null;
  const patchShape = (id: string, patch: Partial<Shape>) =>
    front && s.saveShapes(front.id, front.shapes.map((sh) => (sh.id === id ? { ...sh, ...patch } : sh)));

  const create = async () => {
    await s.createFrontline(newDate, newLabel.trim(), front?.id);
    setAdding(false);
    setNewLabel("");
  };

  return (
    <div className="frontline-panel">
      {fs.view === "draw" && <Guide hasSnapshot={!!front} hasShapes={!!front?.shapes.length} drawing={!!fs.tool} />}

      <label className="check">
        <input type="checkbox" checked={fs.visible} onChange={(e) => fs.setVisible(e.target.checked)} /> Show frontline on map
      </label>

      <h4>1 · Snapshot ({list.length})</h4>
      {list.length > 1 && (
        <div className="scrubber">
          <input type="range" min={0} max={list.length - 1} value={Math.max(idx, 0)} onChange={(e) => s.setActiveFront(list[Number(e.target.value)].id)} />
          <div className="scrub-btns">
            <button disabled={idx <= 0} onClick={() => s.setActiveFront(list[idx - 1].id)}>◀</button>
            <span>{idx + 1} / {list.length}</span>
            <button disabled={idx >= list.length - 1} onClick={() => s.setActiveFront(list[idx + 1].id)}>▶</button>
          </div>
        </div>
      )}

      {front ? (
        <div className="snap">
          <div className="snap-title">{front.label || "Untitled snapshot"} <small>{fmt(front.taken_at)}</small></div>
          <div className="row2">
            <label>Date / time <DateField value={front.taken_at} onCommit={(taken_at) => s.updateFrontlineMeta(front.id, { taken_at })} /></label>
            <label>Label <TextField value={front.label} placeholder="e.g. Day 3 dawn" onCommit={(label) => s.updateFrontlineMeta(front.id, { label })} /></label>
          </div>
          {idx > 0 && (
            <label className="check">
              <input type="checkbox" checked={fs.showPrevious} onChange={(e) => fs.setShowPrevious(e.target.checked)} /> Show previous snapshot (dashed)
            </label>
          )}
        </div>
      ) : (
        <div className="empty-note">No snapshots yet. Create one to start drawing.</div>
      )}

      {adding ? (
        <div className="add-vehicle">
          <div className="row2">
            <label>Date / time <input type="datetime-local" value={newDate} onChange={(e) => setNewDate(e.target.value)} /></label>
            <label>Label <input value={newLabel} placeholder="optional" onChange={(e) => setNewLabel(e.target.value)} /></label>
          </div>
          {front && <small className="hint">Starts as a copy of the snapshot shown above, unit positions included.</small>}
          <div className="btnrow">
            <button className="primary" disabled={!newDate} onClick={create}>Create snapshot</button>
            <button onClick={() => setAdding(false)}>Cancel</button>
          </div>
        </div>
      ) : (
        <div className="btnrow">
          <button className={front ? "" : "primary"} onClick={() => { setNewDate(nowLocal()); setAdding(true); }}>＋ New snapshot{front ? " (copy of this one)" : ""}</button>
          {front && <button onClick={() => confirm(`Delete snapshot "${front.label || fmt(front.taken_at)}"?`) && s.deleteFrontline(front.id)}>Delete</button>}
        </div>
      )}

      {front && (
        <div className="seg view-switch">
          <button className={fs.view === "draw" ? "active" : ""} onClick={() => fs.setView("draw")}>✎ Draw</button>
          <button className={fs.view === "sitrep" ? "active" : ""} onClick={() => fs.setView("sitrep")}>
            ☰ SITREP{reportCount ? ` (${reportCount}/${SITREP_SIDES.length})` : ""}
          </button>
        </div>
      )}

      {front && fs.view === "sitrep" && <SitrepPanel front={front} previous={idx > 0 ? list[idx - 1] : null} />}

      {front && fs.view === "draw" && (
        <>
          <h4>2 · Draw on this snapshot</h4>
          <DrawModeSwitch fs={fs} />
          <small className="hint mode-hint">
            {fs.drawMode === "points"
              ? "Click each corner. Best for straight or simple edges."
              : "Press and drag along a coast, road or tree line. Release and it is converted into editable points. Draw several strokes to build one shape; hold Space to pan."}
          </small>
          <div className="tool-list">
            {DRAW_TOOLS.map(({ icon, label, desc, tool }) => {
              const active = fs.tool?.type === tool.type && fs.tool.kind === tool.kind;
              return (
                <button key={label} className={active ? "active" : ""} style={{ borderColor: SHAPE_COLOR[tool.kind] }} onClick={() => fs.setTool(active ? null : tool)}>
                  <span className="ico" style={{ color: SHAPE_COLOR[tool.kind] === "#111111" ? "#fff" : SHAPE_COLOR[tool.kind] }}>{icon}</span>
                  <b>{active ? `Drawing: ${label} — click the map` : label}</b>
                  <small>{desc}</small>
                </button>
              );
            })}
          </div>

          {selected && !fs.tool && (
            <div className="shape-edit">
              <b>Selected: {KIND_LABEL[selected.kind]}</b>
              <small className="hint">Drag the square handles on the map to reshape it.</small>
              {selected.type === "zone" && (
                <label>
                  Type
                  <select value={selected.kind} onChange={(e) => patchShape(selected.id, { kind: e.target.value as ShapeKind })}>
                    <option value="friend">Friendly area</option>
                    <option value="hostile">Hostile area</option>
                    <option value="contested">Contested area</option>
                  </select>
                </label>
              )}
              <label>Label <TextField value={selected.label} placeholder="optional" onCommit={(label) => patchShape(selected.id, { label })} /></label>
              <button onClick={() => fs.simplify(selected.id)} title="Remove points that barely change the shape">Simplify ({selected.points.length} points)</button>
              <button onClick={() => { s.saveShapes(front.id, front.shapes.filter((sh) => sh.id !== selected.id)); fs.setSelectedId(null); }}>Delete shape</button>
            </div>
          )}

          <h4>Shapes on this snapshot ({front.shapes.length})</h4>
          <ul className="kids shapes">
            {front.shapes.map((sh) => (
              <li key={sh.id} className={sh.id === fs.selectedId ? "sel" : ""} onClick={() => fs.setSelectedId(sh.id)}>
                <span className="swatch" style={{ background: SHAPE_COLOR[sh.kind] }} />
                <span className="grow">{sh.label || KIND_LABEL[sh.kind]}</span>
                <small>{sh.type === "zone" ? `${areaKm2(sh.points).toFixed(1)} km² · ` : ""}{sh.points.length} pts</small>
              </li>
            ))}
          </ul>
          {front.shapes.length === 0 && <div className="empty-note">Nothing drawn yet.</div>}
        </>
      )}
    </div>
  );
}
