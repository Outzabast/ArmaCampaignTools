import { useState } from "react";
import { useStore } from "../store";
import { SIDES, SIDE_LABEL, type Unit } from "../types";
import { addTotals, emptyTotals } from "../orbat/rollup";
import { SIDE_COLOR, SymbolImg, useUi } from "./common";
import { TotalsLine } from "./UnitEditor";
import { TemplateList, TemplateSelect } from "./Templates";

function Node({ unit, depth }: { unit: Unit; depth: number }) {
  const s = useStore();
  const ui = useUi();
  const [open, setOpen] = useState(depth < 1);
  const kids = s.tree.children.get(unit.id) ?? [];
  const onMap = unit.x !== null;
  return (
    <>
      <li
        className={`node${s.selectedId === unit.id ? " selected" : ""}`}
        style={{ paddingLeft: 6 + depth * 14 }}
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
  // A template deleted while selected falls back to a blank unit.
  const templateId = s.templates.some((t) => t.id === template) ? template! : undefined;
  return (
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
      {SIDES.map((side) => {
        const roots = (s.tree.children.get(null) ?? []).filter((u) => u.side === side);
        const total = roots.reduce((t, u) => addTotals(t, s.tree.rolled.get(u.id)!), emptyTotals());
        const visible = ui.visibleSides.has(side);
        return (
          <section key={side} className="side-group">
            <header style={{ borderLeftColor: SIDE_COLOR[side] }}>
              <label title="Show this side on the map">
                <input type="checkbox" checked={visible} onChange={() => ui.toggleSide(side)} /> <b>{SIDE_LABEL[side]}</b>
              </label>
              <TotalsLine t={total} />
            </header>
            <ul>{roots.map((u) => <Node key={u.id} unit={u} depth={0} />)}</ul>
            {roots.length === 0 && <div className="empty-note">No units</div>}
          </section>
        );
      })}
      <TemplateList />
    </div>
  );
}
