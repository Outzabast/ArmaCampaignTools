import { useState } from "react";
import { useStore } from "../store";
import { VEHICLE_CATEGORIES, SIDES, SIDE_LABEL, type Side, type Unit, type VehicleCategory } from "../types";
import { defaultSidc, withSide } from "../orbat/sidc";
import { personnelTotal, type Totals } from "../orbat/rollup";
import { Counter, SymbolImg, TextField, useUi } from "./common";
import { SymbolPicker } from "./SymbolPicker";

export function TotalsLine({ t }: { t: Totals }) {
  return (
    <span className="totals">
      <b title="Personnel active / total">{t.active}/{personnelTotal(t)}</b> pers
      <span className="sep-dot">·</span>
      <b title="Vehicles operational / total">{t.vOp}/{t.vOp + t.vDmg + t.vKia}</b> veh
    </span>
  );
}

function AddVehicle({ unit, onDone }: { unit: Unit; onDone: () => void }) {
  const { vehicleTypes, unitVehicles, setUnitVehicle, createVehicleType } = useStore();
  const taken = new Set(unitVehicles.filter((v) => v.unit_id === unit.id).map((v) => v.vehicle_type_id));
  const available = vehicleTypes.filter((t) => !taken.has(t.id));
  const [choice, setChoice] = useState<string>(available[0] ? String(available[0].id) : "new");
  const [name, setName] = useState("");
  const [category, setCategory] = useState<VehicleCategory>("wheeled");
  const [count, setCount] = useState(1);

  const add = async () => {
    let typeId = Number(choice);
    if (choice === "new") {
      if (!name.trim()) return;
      const t = await createVehicleType(name.trim(), category);
      if (!t) return;
      typeId = t.id;
    }
    await setUnitVehicle(unit.id, typeId, { operational: count, damaged: 0, destroyed: 0 });
    onDone();
  };

  return (
    <div className="add-vehicle">
      <select value={choice} onChange={(e) => setChoice(e.target.value)}>
        {available.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.category})</option>)}
        <option value="new">＋ New vehicle type…</option>
      </select>
      {choice === "new" && (
        <div className="row2">
          <input autoFocus placeholder="Vehicle name, e.g. BMP-2" value={name} onChange={(e) => setName(e.target.value)} />
          <select value={category} onChange={(e) => setCategory(e.target.value as VehicleCategory)}>
            {VEHICLE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
      )}
      <div className="row2">
        <label className="inline">Count <input type="number" min={1} value={count} onChange={(e) => setCount(Math.max(1, Number(e.target.value)))} /></label>
        <span>
          <button className="primary" onClick={add}>Add</button> <button onClick={onDone}>Cancel</button>
        </span>
      </div>
    </div>
  );
}

export function UnitEditor({ unit }: { unit: Unit }) {
  const s = useStore();
  const ui = useUi();
  const [pickSymbol, setPickSymbol] = useState(false);
  const [addingVehicle, setAddingVehicle] = useState(false);

  const rolled = s.tree.rolled.get(unit.id)!;
  const kids = s.tree.children.get(unit.id) ?? [];
  const myVehicles = s.unitVehicles
    .filter((v) => v.unit_id === unit.id)
    .map((v) => ({ v, type: s.vehicleTypes.find((t) => t.id === v.vehicle_type_id)! }))
    .filter((r) => r.type);

  const ancestors: Unit[] = [];
  for (let p = unit.parent_id; p !== null; ) {
    const parent = s.units.find((u) => u.id === p);
    if (!parent) break;
    ancestors.unshift(parent);
    p = parent.parent_id;
  }

  const upd = (patch: Partial<Unit>) => s.updateUnit(unit.id, patch);
  const onMap = unit.x !== null && unit.y !== null;

  const addChild = async () => {
    const child = await s.createUnit({
      side: unit.side,
      parent_id: unit.id,
      name: "New subordinate",
      sidc: withSide(defaultSidc(unit.side), unit.side),
    });
    if (child) s.select(child.id);
  };

  return (
    <div className="editor">
      <div className="crumbs">
        <button onClick={() => s.select(null)}>← All units</button>
        {ancestors.map((a) => <button key={a.id} onClick={() => s.select(a.id)}>{a.name}</button>)}
      </div>

      <div className="editor-head">
        <button className="symbtn" title="Change symbol" onClick={() => setPickSymbol(true)}>
          <SymbolImg sidc={unit.sidc} size={44} />
        </button>
        <div className="editor-names">
          <TextField value={unit.name} onCommit={(name) => name.trim() && upd({ name: name.trim() })} />
          <TextField value={unit.designation} placeholder="Designation (shown on symbol)" onCommit={(designation) => upd({ designation })} />
        </div>
      </div>

      <div className="row2">
        {unit.parent_id === null ? (
          <label>
            Side
            <select value={unit.side} onChange={(e) => upd({ side: e.target.value as Side })}>
              {SIDES.map((sd) => <option key={sd} value={sd}>{SIDE_LABEL[sd]}</option>)}
            </select>
          </label>
        ) : (
          <label>Side<input disabled value={SIDE_LABEL[unit.side]} /></label>
        )}
        <label>
          Position
          <input disabled value={onMap ? `${Math.round(unit.x!)}, ${Math.round(unit.y!)}` : "not on map"} />
        </label>
      </div>
      <div className="btnrow">
        <button onClick={() => ui.setPlacing({ kind: "existing", unitId: unit.id })}>{onMap ? "Move on map" : "Place on map"}</button>
        {onMap && <button onClick={() => ui.center(unit.id)}>Center</button>}
        {onMap && <button onClick={() => upd({ x: null, y: null })}>Remove from map</button>}
        <button onClick={() => s.openOrbat(unit.id)}>View ORBAT</button>
      </div>

      <h4>Personnel <small>{kids.length > 0 && <>(subtree: {rolled.active}/{personnelTotal(rolled)} active)</>}</small></h4>
      <div className="counters">
        <Counter label="Active" tone="ok" value={unit.pers_active} onChange={(v) => upd({ pers_active: v })} />
        <Counter label="Wounded" tone="warn" value={unit.pers_wounded} onChange={(v) => upd({ pers_wounded: v })} />
        <Counter label="KIA" tone="bad" value={unit.pers_kia} onChange={(v) => upd({ pers_kia: v })} />
        <Counter label="MIA" tone="muted" value={unit.pers_mia} onChange={(v) => upd({ pers_mia: v })} />
      </div>

      <h4>Vehicles <small>{kids.length > 0 && <>(subtree: {rolled.vOp}/{rolled.vOp + rolled.vDmg + rolled.vKia} operational)</>}</small></h4>
      {myVehicles.map(({ v, type }) => (
        <div className="vehicle" key={type.id}>
          <div className="vehicle-name">
            <b>{type.name}</b> <span className={`cat cat-${type.category}`}>{type.category}</span>
            <button className="x" title="Remove from unit" onClick={() => s.removeUnitVehicle(unit.id, type.id)}>✕</button>
          </div>
          <div className="counters three">
            <Counter label="Operational" tone="ok" value={v.operational} onChange={(n) => s.setUnitVehicle(unit.id, type.id, { ...v, operational: n })} />
            <Counter label="Damaged" tone="warn" value={v.damaged} onChange={(n) => s.setUnitVehicle(unit.id, type.id, { ...v, damaged: n })} />
            <Counter label="Destroyed" tone="bad" value={v.destroyed} onChange={(n) => s.setUnitVehicle(unit.id, type.id, { ...v, destroyed: n })} />
          </div>
        </div>
      ))}
      {addingVehicle ? <AddVehicle unit={unit} onDone={() => setAddingVehicle(false)} /> : <button onClick={() => setAddingVehicle(true)}>＋ Add vehicle</button>}

      <h4>Subordinates ({kids.length})</h4>
      <ul className="kids">
        {kids.map((k) => (
          <li key={k.id} onClick={() => s.select(k.id)}>
            <SymbolImg sidc={k.sidc} size={20} /> <span className="grow">{k.name}</span> <TotalsLine t={s.tree.rolled.get(k.id)!} />
          </li>
        ))}
      </ul>
      <button onClick={addChild}>＋ Add subordinate</button>

      <h4>Notes</h4>
      <TextField multiline value={unit.notes} placeholder="Notes…" onCommit={(notes) => upd({ notes })} />

      <div className="danger">
        <button
          onClick={() => {
            const n = kids.length;
            if (confirm(n ? `Delete "${unit.name}" and its ${n} subordinate unit(s)?` : `Delete "${unit.name}"?`)) s.deleteUnit(unit.id);
          }}
        >
          Delete unit
        </button>
      </div>

      {pickSymbol && <SymbolPicker side={unit.side} sidc={unit.sidc} onSave={(sidc) => upd({ sidc })} onClose={() => setPickSymbol(false)} />}
    </div>
  );
}
