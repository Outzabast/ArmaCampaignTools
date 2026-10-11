import type { Unit, UnitVehicle, VehicleCounts, VehicleType } from "../types";

export interface Totals {
  active: number;
  wounded: number;
  kia: number;
  mia: number;
  vOp: number;
  vDmg: number;
  vKia: number;
  vAbn: number;
  vCap: number;
}

export const emptyTotals = (): Totals => ({ active: 0, wounded: 0, kia: 0, mia: 0, vOp: 0, vDmg: 0, vKia: 0, vAbn: 0, vCap: 0 });

export function addTotals(a: Totals, b: Totals): Totals {
  return {
    active: a.active + b.active,
    wounded: a.wounded + b.wounded,
    kia: a.kia + b.kia,
    mia: a.mia + b.mia,
    vOp: a.vOp + b.vOp,
    vDmg: a.vDmg + b.vDmg,
    vKia: a.vKia + b.vKia,
    vAbn: a.vAbn + b.vAbn,
    vCap: a.vCap + b.vCap,
  };
}

export const personnelTotal = (t: Totals) => t.active + t.wounded + t.kia + t.mia;
export const vehicleTotal = (t: Totals) => t.vOp + t.vDmg + t.vKia + t.vAbn + t.vCap;

export interface Tree {
  children: Map<number | null, Unit[]>;
  own: Map<number, Totals>;
  rolled: Map<number, Totals>;
}

/** Own counts per unit and counts rolled up through all subordinates. */
export function buildTree(units: Unit[], unitVehicles: UnitVehicle[]): Tree {
  const children = new Map<number | null, Unit[]>();
  for (const u of units) {
    const list = children.get(u.parent_id) ?? [];
    list.push(u);
    children.set(u.parent_id, list);
  }
  const own = new Map<number, Totals>();
  for (const u of units) {
    own.set(u.id, { ...emptyTotals(), active: u.pers_active, wounded: u.pers_wounded, kia: u.pers_kia, mia: u.pers_mia });
  }
  for (const v of unitVehicles) {
    const t = own.get(v.unit_id);
    if (t) {
      t.vOp += v.operational;
      t.vDmg += v.damaged;
      t.vKia += v.destroyed;
      t.vAbn += v.abandoned;
      t.vCap += v.captured;
    }
  }
  const rolled = new Map<number, Totals>();
  const visit = (u: Unit): Totals => {
    let t = own.get(u.id)!;
    for (const c of children.get(u.id) ?? []) t = addTotals(t, visit(c));
    rolled.set(u.id, t);
    return t;
  };
  for (const root of children.get(null) ?? []) visit(root);
  return { children, own, rolled };
}

export function descendantIds(tree: Tree, id: number): number[] {
  const out: number[] = [];
  const walk = (i: number) => {
    for (const c of tree.children.get(i) ?? []) {
      out.push(c.id);
      walk(c.id);
    }
  };
  walk(id);
  return out;
}

export interface VehicleRow extends VehicleCounts {
  type: VehicleType;
}

/** Vehicles of a unit and all its subordinates, merged per vehicle type. */
export function rolledVehicles(tree: Tree, unitId: number, unitVehicles: UnitVehicle[], types: VehicleType[]): VehicleRow[] {
  const ids = new Set([unitId, ...descendantIds(tree, unitId)]);
  const byType = new Map<number, VehicleRow>();
  const typeById = new Map(types.map((t) => [t.id, t]));
  for (const v of unitVehicles) {
    if (!ids.has(v.unit_id)) continue;
    const type = typeById.get(v.vehicle_type_id);
    if (!type) continue;
    const row = byType.get(type.id) ?? { type, operational: 0, damaged: 0, destroyed: 0, abandoned: 0, captured: 0 };
    row.operational += v.operational;
    row.damaged += v.damaged;
    row.destroyed += v.destroyed;
    row.abandoned += v.abandoned;
    row.captured += v.captured;
    byType.set(type.id, row);
  }
  return [...byType.values()].sort((a, b) => a.type.category.localeCompare(b.type.category) || a.type.name.localeCompare(b.type.name));
}
