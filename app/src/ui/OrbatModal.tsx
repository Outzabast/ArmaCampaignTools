import { useStore } from "../store";
import { rolledVehicles, personnelTotal } from "../orbat/rollup";
import { SIDE_LABEL, type Unit } from "../types";
import { Modal, SymbolImg } from "./common";

function Row({ unit, depth }: { unit: Unit; depth: number }) {
  const s = useStore();
  const t = s.tree.rolled.get(unit.id)!;
  const kids = s.tree.children.get(unit.id) ?? [];
  return (
    <>
      <tr className={s.selectedId === unit.id ? "selected" : ""} onClick={() => s.select(unit.id)}>
        <td style={{ paddingLeft: 8 + depth * 18 }}>
          <SymbolImg sidc={unit.sidc} size={22} /> {unit.name}
        </td>
        <td className="num ok">{t.active}</td>
        <td className="num warn">{t.wounded}</td>
        <td className="num bad">{t.kia}</td>
        <td className="num muted">{t.mia}</td>
        <td className="num ok">{t.vOp}</td>
        <td className="num warn">{t.vDmg}</td>
        <td className="num bad">{t.vKia}</td>
        <td className="num muted">{t.vAbn}</td>
        <td className="num bad">{t.vCap}</td>
      </tr>
      {kids.map((k) => <Row key={k.id} unit={k} depth={depth + 1} />)}
    </>
  );
}

/** Full ORBAT for one formation: the unit that was double-clicked on the map is the root. */
export function OrbatModal({ unitId, onClose }: { unitId: number; onClose: () => void }) {
  const s = useStore();
  const root = s.units.find((u) => u.id === unitId);
  if (!root) return null;
  const t = s.tree.rolled.get(root.id)!;
  const vehicles = rolledVehicles(s.tree, root.id, s.unitVehicles, s.vehicleTypes);

  return (
    <Modal title={`ORBAT — ${root.name} (${SIDE_LABEL[root.side]})`} onClose={onClose} wide>
      <table className="orbat-table">
        <thead>
          <tr>
            <th rowSpan={2}>Unit</th>
            <th colSpan={4}>Personnel</th>
            <th colSpan={5}>Vehicles</th>
          </tr>
          <tr>
            <th>Active</th><th>Wounded</th><th>KIA</th><th>MIA</th>
            <th>Oper.</th><th>Damaged</th><th>Destroyed</th><th>Aband.</th><th>Captured</th>
          </tr>
        </thead>
        <tbody>
          <Row unit={root} depth={0} />
        </tbody>
        <tfoot>
          <tr>
            <td>Total ({personnelTotal(t)} personnel)</td>
            <td className="num ok">{t.active}</td><td className="num warn">{t.wounded}</td>
            <td className="num bad">{t.kia}</td><td className="num muted">{t.mia}</td>
            <td className="num ok">{t.vOp}</td><td className="num warn">{t.vDmg}</td><td className="num bad">{t.vKia}</td>
            <td className="num muted">{t.vAbn}</td><td className="num bad">{t.vCap}</td>
          </tr>
        </tfoot>
      </table>

      {vehicles.length > 0 && (
        <>
          <h4>Vehicles by type</h4>
          <table className="orbat-table">
            <thead><tr><th>Type</th><th>Class</th><th>Oper.</th><th>Damaged</th><th>Destroyed</th><th>Aband.</th><th>Captured</th></tr></thead>
            <tbody>
              {vehicles.map((r) => (
                <tr key={r.type.id}>
                  <td>{r.type.name}</td>
                  <td><span className={`cat cat-${r.type.category}`}>{r.type.category}</span></td>
                  <td className="num ok">{r.operational}</td>
                  <td className="num warn">{r.damaged}</td>
                  <td className="num bad">{r.destroyed}</td>
                  <td className="num muted">{r.abandoned}</td>
                  <td className="num bad">{r.captured}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      <small className="hint">Click a row to edit that unit in the side panel.</small>
    </Modal>
  );
}
