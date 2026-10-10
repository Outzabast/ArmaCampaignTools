import type { Frontline, Shape, Unit, UnitVehicle, VehicleCategory, VehicleType } from "./types";

export interface State {
  units: Unit[];
  vehicleTypes: VehicleType[];
  unitVehicles: UnitVehicle[];
  frontlines: Frontline[];
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
  state: () => call<State>("GET", "/api/state"),
  createUnit: (u: Partial<Unit>) => call<Unit>("POST", "/api/units", u),
  updateUnit: (id: number, patch: Partial<Unit>) => call<Unit>("PATCH", `/api/units/${id}`, patch),
  deleteUnit: (id: number) => call<void>("DELETE", `/api/units/${id}`),
  createVehicleType: (name: string, category: VehicleCategory) =>
    call<VehicleType>("POST", "/api/vehicle-types", { name, category }),
  updateVehicleType: (id: number, patch: Partial<VehicleType>) => call<VehicleType>("PATCH", `/api/vehicle-types/${id}`, patch),
  deleteVehicleType: (id: number) => call<void>("DELETE", `/api/vehicle-types/${id}`),
  setUnitVehicle: (unitId: number, typeId: number, v: Pick<UnitVehicle, "operational" | "damaged" | "destroyed">) =>
    call<UnitVehicle>("PUT", `/api/units/${unitId}/vehicles/${typeId}`, v),
  createFrontline: (b: { taken_at: string; label?: string; copy_from?: number; shapes?: Shape[] }) =>
    call<Frontline>("POST", "/api/frontlines", b),
  updateFrontline: (id: number, patch: Partial<Pick<Frontline, "label" | "taken_at" | "shapes">>) =>
    call<Frontline>("PATCH", `/api/frontlines/${id}`, patch),
  deleteFrontline: (id: number) => call<void>("DELETE", `/api/frontlines/${id}`),
  removeUnitVehicle: (unitId: number, typeId: number) => call<void>("DELETE", `/api/units/${unitId}/vehicles/${typeId}`),
};
