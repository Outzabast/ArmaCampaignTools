import { createContext, useContext, useState, type DragEvent } from "react";
import { useStore } from "../store";
import { SIDES, SIDE_LABEL, type Side, type Unit } from "../types";
import { addTotals, canReparent, emptyTotals } from "../orbat/rollup";
import { SIDE_COLOR, SymbolImg, useUi } from "./common";
import { TotalsLine } from "./UnitEditor";
import { TemplateList, TemplateSelect } from "./Templates";

/** The unit being dragged in the list. dataTransfer can't be read during dragover, so drop targets check this instead. */
const DragCtx = createContext<{ dragging: Unit | null; setDragging: (u: Unit | null) => void }>({ dragging: null, setDragging: () => {} });

/** Drop-target handlers that reassign the dragged unit under `parent` (null = top level) when the move is allowed. */
function useDropTarget(parent: Unit | null) {
  const s = useStore();
  const { dragging, setDragging } = useContext(DragCtx);
  const [over, setOver] = useState(false);
  const ok = dragging !== null && canReparent(s.tree, dragging, parent);
  return {
    over: ok && over,
    props: {
      onDragOver: (e: DragEvent) => {
        if (!ok) return;
        e.preventDefault();
        e.stopPropagation();
        setOver(true);
      },
      onDragLeave: () => setOver(false),
      onDrop: (e: DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setOver(false);
        setDragging(null);
        if (ok) s.moveUnit(dragging.id, parent?.id ?? null);
      },
    },
  };
}

function Node({ unit, depth }: { unit: Unit; depth: number }) {
  const s = useStore();
  const ui = useUi();
  const { setDragging } = useContext(DragCtx);
  const drop = useDropTarget(unit);
  const [open, setOpen] = useState(depth < 1);
  const kids = s.tree.children.get(unit.id) ?? [];
  const onMap = unit.x !== null;
  return (
    <>
      <li
        className={`node${s.selectedId === unit.id ? " selected" : ""}${drop.over ? " drop-over" : ""}`}
        style={{ paddingLeft: 6 + depth * 14 }}
        title="Drag onto another unit to reassign it"
        draggable
        onDragStart={(e) => {
          e.stopPropagation();
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", String(unit.id));
          setDragging(unit);
        }}
        onDragEnd={() => setDragging(null)}
        {...drop.props}
        onClick={() => {
          s.select(unit.id);
          if (onMap) ui.center(unit.id);
        }}
        onDoubleClick={() => s.openOrbat(unit.id)}
      >
        <span
          className={`twisty${kids.length ? "" : " empty"}`}
          onClick={(e) => {
            e.stopPropagation();
            setOpen(!open);
          }}
        >
          {open ? "▾" : "▸"}
        </span>
        <SymbolImg sidc={unit.sidc} size={20} />
        <span className="grow name">{unit.name}</span>
        {onMap && <span title="On map" className="pin">●</span>}
        <TotalsLine t={s.tree.rolled.get(unit.id)!} />
      </li>
      {open && kids.map((k) => <Node key={k.id} unit={k} depth={depth + 1} />)}
    </>
  );
}

export function OrbatList() {
  const s = useStore();
  const ui = useUi();
  const [template, setTemplate] = useState<number | null>(null);
  const [dragging, setDragging] = useState<Unit | null>(null);
  // A template deleted while selected falls back to a blank unit.
  const templateId = s.templates.some((t) => t.id === template) ? template! : undefined;
  return (
    <DragCtx.Provider value={{ dragging, setDragging }}>
      <div className="orbat-list">
        <div className="addrow">
          <span>Add unit:</span>
          {SIDES.map((side) => (
            <button
              key={side}
              className={ui.placing?.kind === "new" && ui.placing.side === side ? "active" : ""}
              style={{ borderColor: SIDE_COLOR[side] }}
              title={`Place a new ${SIDE_LABEL[side]} unit on the map`}
              onClick={() => ui.setPlacing({ kind: "new", side, templateId })}
            >
              {SIDE_LABEL[side].split(" ")[0]}
            </button>
          ))}
        </div>
        {s.templates.length > 0 && (
          <div className="addrow">
            <span>From:</span>
            <TemplateSelect value={templateId ?? null} onChange={setTemplate} />
          </div>
        )}
        {SIDES.map((side) => <SideGroup key={side} side={side} />)}
        <TemplateList />
      </div>
    </DragCtx.Provider>
  );
}

function SideGroup({ side }: { side: Side }) {
  const s = useStore();
  const ui = useUi();
  const { dragging } = useContext(DragCtx);
  // Dropping on the header makes the dragged unit a top-level unit of this side.
  const drop = useDropTarget(null);
  const roots = (s.tree.children.get(null) ?? []).filter((u) => u.side === side);
  const total = roots.reduce((t, u) => addTotals(t, s.tree.rolled.get(u.id)!), emptyTotals());
  const visible = ui.visibleSides.has(side);
  const headerDrop = dragging?.side === side ? drop : { over: false, props: {} };
  return (
    <section className="side-group">
      <header
        className={headerDrop.over ? "drop-over" : ""}
        style={{ borderLeftColor: SIDE_COLOR[side] }}
        title={dragging ? "Drop here to make it a top-level unit" : undefined}
        {...headerDrop.props}
      >
        <label title="Show this side on the map">
          <input type="checkbox" checked={visible} onChange={() => ui.toggleSide(side)} /> <b>{SIDE_LABEL[side]}</b>
        </label>
        <TotalsLine t={total} />
      </header>
      <ul>{roots.map((u) => <Node key={u.id} unit={u} depth={0} />)}</ul>
      {roots.length === 0 && <div className="empty-note">No units</div>}
    </section>
  );
}
