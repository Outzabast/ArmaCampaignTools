import { useState } from "react";
import { useStore } from "../store";
import { VEHICLE_CATEGORIES, type VehicleCategory } from "../types";
import { TextField } from "./common";

/** The shared catalogue of vehicle types. Create once here (or on the fly from a unit) and reuse everywhere. */
export function VehicleLibrary() {
  const s = useStore();
  const [name, setName] = useState("");
  const [category, setCategory] = useState<VehicleCategory>("wheeled");

  const uses = (typeId: number) => s.unitVehicles.filter((v) => v.vehicle_type_id === typeId).length;
  const add = async () => {
    if (!name.trim()) return;
    await s.createVehicleType(name.trim(), category);
    setName("");
  };

  return (
    <div className="library">
      <div className="row2 add-type">
        <input placeholder="New vehicle type…" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
        <select value={category} onChange={(e) => setCategory(e.target.value as VehicleCategory)}>
          {VEHICLE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
        </select>
        <button className="primary" onClick={add}>Add</button>
      </div>
      {VEHICLE_CATEGORIES.map((cat) => {
        const types = s.vehicleTypes.filter((t) => t.category === cat);
        if (!types.length) return null;
        return (
          <section key={cat}>
            <h4><span className={`cat cat-${cat}`}>{cat}</span></h4>
            {types.map((t) => (
              <div className="lib-row" key={t.id}>
                <TextField value={t.name} onCommit={(n) => n.trim() && s.updateVehicleType(t.id, { name: n.trim() })} />
                <select value={t.category} onChange={(e) => s.updateVehicleType(t.id, { category: e.target.value as VehicleCategory })}>
                  {VEHICLE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                </select>
                <small>{uses(t.id)} unit(s)</small>
                <button
                  className="x"
                  title="Delete type"
                  onClick={() => confirm(uses(t.id) ? `Delete "${t.name}"? It will be removed from ${uses(t.id)} unit(s).` : `Delete "${t.name}"?`) && s.deleteVehicleType(t.id)}
                >
                  ✕
                </button>
              </div>
            ))}
          </section>
        );
      })}
      {s.vehicleTypes.length === 0 && <div className="empty-note">No vehicle types yet.</div>}
    </div>
  );
}
