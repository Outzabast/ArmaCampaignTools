import type { Frontline, Operation, Pt, Shape, Side, Sitrep, Unit, UnitTemplate, UnitVehicle, VehicleCategory, VehicleCounts, VehicleType } from "./types";

export interface State {
  units: Unit[];
  vehicleTypes: VehicleType[];
  unitVehicles: UnitVehicle[];
  frontlines: Frontline[];
  sitreps: Sitrep[];
  templates: UnitTemplate[];
}

async function call<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `${method} ${url} failed (${res.status})`);
  return res.status === 204 ? (undefined as T) : res.json();
}

export const api = {
  operations: () => call<Operation[]>("GET", "/api/operations"),
  createOperation: (name: string, map_id: string) => call<Operation>("POST", "/api/operations", { name, map_id }),
  renameOperation: (id: number, name: string) => call<Operation>("PATCH", `/api/operations/${id}`, { name }),
  setSituation: (id: number, situation: string, situation_author: string) =>
    call<Operation>("PATCH", `/api/operations/${id}`, { situation, situation_author }),
  deleteOperation: (id: number) => call<void>("DELETE", `/api/operations/${id}`),
  state: (op: number) => call<State>("GET", `/api/operations/${op}/state`),
  createUnit: (op: number, u: Partial<Unit> & { template_id?: number }) => call<Unit>("POST", `/api/operations/${op}/units`, u),
  saveTemplate: (unitId: number, name: string) => call<UnitTemplate[]>("POST", `/api/units/${unitId}/template`, { name }),
  renameTemplate: (id: number, name: string) => call<void>("PATCH", `/api/templates/${id}`, { name }),
  deleteTemplate: (id: number) => call<void>("DELETE", `/api/templates/${id}`),
  updateUnit: (id: number, patch: Partial<Unit>) => call<Unit>("PATCH", `/api/units/${id}`, patch),
  deleteUnit: (id: number) => call<void>("DELETE", `/api/units/${id}`),
  createVehicleType: (name: string, category: VehicleCategory) =>
    call<VehicleType>("POST", "/api/vehicle-types", { name, category }),
  updateVehicleType: (id: number, patch: Partial<VehicleType>) => call<VehicleType>("PATCH", `/api/vehicle-types/${id}`, patch),
  deleteVehicleType: (id: number) => call<void>("DELETE", `/api/vehicle-types/${id}`),
  setUnitVehicle: (unitId: number, typeId: number, v: VehicleCounts) =>
    call<UnitVehicle>("PUT", `/api/units/${unitId}/vehicles/${typeId}`, v),
  createFrontline: (op: number, b: { taken_at: string; label?: string; copy_from?: number; shapes?: Shape[] }) =>
    call<Frontline>("POST", `/api/operations/${op}/frontlines`, b),
  /** `positions` is merged per unit; null takes that unit off the map in this snapshot. */
  updateFrontline: (
    id: number,
    patch: Partial<Pick<Frontline, "label" | "taken_at" | "shapes">> & { positions?: Record<string, Pt | null> },
  ) =>
    call<Frontline>("PATCH", `/api/frontlines/${id}`, patch),
  deleteFrontline: (id: number) => call<void>("DELETE", `/api/frontlines/${id}`),
  setSitrep: (frontlineId: number, side: Side, b: { author: string; body: string }) =>
    call<Sitrep | undefined>("PUT", `/api/frontlines/${frontlineId}/sitreps/${side}`, b),
  deleteSitrep: (frontlineId: number, side: Side) => call<void>("DELETE", `/api/frontlines/${frontlineId}/sitreps/${side}`),
  removeUnitVehicle: (unitId: number, typeId: number) => call<void>("DELETE", `/api/units/${unitId}/vehicles/${typeId}`),
};
