import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api } from "./api";
import { defaultSidc } from "./orbat/sidc";
import { buildTree, descendantIds, type Tree } from "./orbat/rollup";
import type { Frontline, Shape, Side, Sitrep, Unit, UnitTemplate, UnitVehicle, VehicleCategory, VehicleCounts, VehicleType } from "./types";

interface Store {
  /** Positions (x, y) are those of the active snapshot, when there is one. */
  units: Unit[];
  vehicleTypes: VehicleType[];
  unitVehicles: UnitVehicle[];
  tree: Tree;
  frontlines: Frontline[];
  /** Snapshot being shown/edited; falls back to the newest one. */
  activeFront: Frontline | null;
  setActiveFront: (id: number) => void;
  createFrontline: (taken_at: string, label: string, copyFrom?: number) => Promise<void>;
  updateFrontlineMeta: (id: number, patch: { label?: string; taken_at?: string }) => Promise<void>;
  deleteFrontline: (id: number) => Promise<void>;
  /** Optimistic: updates the UI immediately and saves to the API a moment later. */
  saveShapes: (id: number, shapes: Shape[]) => void;
  sitreps: Sitrep[];
  /** An empty body clears that side's SITREP. */
  saveSitrep: (frontlineId: number, side: Side, author: string, body: string) => Promise<boolean>;
  deleteSitrep: (frontlineId: number, side: Side) => Promise<void>;
  error: string | null;
  clearError: () => void;

  selectedId: number | null;
  select: (id: number | null) => void;
  orbatViewId: number | null;
  openOrbat: (id: number | null) => void;

  /** With `template_id`, builds that template's whole subtree; the template's root becomes the returned unit. */
  createUnit: (u: Partial<Unit> & { side: Side; template_id?: number }) => Promise<Unit | undefined>;
  /** A position change goes to the active snapshot (and to the unit itself when that is the newest snapshot). */
  updateUnit: (id: number, patch: Partial<Unit>) => Promise<void>;
  /** Moves a unit and its whole subtree under another unit (null = top level), placing it last among its new siblings. */
  moveUnit: (id: number, parentId: number | null) => Promise<void>;
  deleteUnit: (id: number) => Promise<void>;
  createVehicleType: (name: string, category: VehicleCategory) => Promise<VehicleType | undefined>;
  updateVehicleType: (id: number, patch: Partial<VehicleType>) => Promise<void>;
  deleteVehicleType: (id: number) => Promise<void>;
  setUnitVehicle: (unitId: number, typeId: number, v: VehicleCounts) => Promise<void>;
  removeUnitVehicle: (unitId: number, typeId: number) => Promise<void>;
  templates: UnitTemplate[];
  saveTemplate: (unitId: number, name: string) => Promise<void>;
  renameTemplate: (id: number, name: string) => Promise<void>;
  deleteTemplate: (id: number) => Promise<void>;
}

const Ctx = createContext<Store | null>(null);
export const useStore = () => useContext(Ctx)!;

/** State for one operation. Mounted with `key={operationId}` so switching operations starts from a clean slate. */
export function StoreProvider({ operationId, children }: { operationId: number; children: ReactNode }) {
  const [rawUnits, setUnits] = useState<Unit[]>([]);
  const [vehicleTypes, setVehicleTypes] = useState<VehicleType[]>([]);
  const [unitVehicles, setUnitVehicles] = useState<UnitVehicle[]>([]);
  const [frontlines, setFrontlines] = useState<Frontline[]>([]);
  const [sitreps, setSitreps] = useState<Sitrep[]>([]);
  const [templates, setTemplates] = useState<UnitTemplate[]>([]);
  const [activeFrontId, setActiveFrontId] = useState<number | null>(null);
  const pendingSave = useRef<{ timer: number; id: number; shapes: Shape[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [orbatViewId, setOrbatViewId] = useState<number | null>(null);

  const reload = useCallback(async () => {
    const s = await api.state(operationId);
    setUnits(s.units);
    setVehicleTypes(s.vehicleTypes);
    setUnitVehicles(s.unitVehicles);
    setSitreps(s.sitreps);
    setTemplates(s.templates);
    // An unsaved shape edit is newer than what the server just returned.
    const pending = pendingSave.current;
    setFrontlines(pending ? s.frontlines.map((f) => (f.id === pending.id ? { ...f, shapes: pending.shapes } : f)) : s.frontlines);
  }, [operationId]);

  useEffect(() => {
    reload().catch((e) => setError(`Cannot reach the API: ${e.message}`));
  }, [reload]);

  // Every mutation hits the API, then refetches: the dataset is small and this keeps cascades (side change,
  // subtree delete) trivially correct.
  const run = useCallback(
    async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
      try {
        const out = await fn();
        await reload();
        return out;
      } catch (e) {
        setError((e as Error).message);
        return undefined;
      }
    },
    [reload],
  );

  const activeFront = frontlines.find((f) => f.id === activeFrontId) ?? frontlines[frontlines.length - 1] ?? null;
  const latestFront = frontlines[frontlines.length - 1] ?? null;

  // With a snapshot shown, units sit where they were at that snapshot.
  const units = useMemo(() => {
    if (!activeFront) return rawUnits;
    return rawUnits.map((u) => {
      const p = activeFront.positions[u.id];
      return { ...u, x: p ? p[0] : null, y: p ? p[1] : null };
    });
  }, [rawUnits, activeFront]);

  const tree = useMemo(() => buildTree(units, unitVehicles), [units, unitVehicles]);

  const store: Store = {
    units,
    vehicleTypes,
    unitVehicles,
    tree,
    frontlines,
    activeFront,
    setActiveFront: setActiveFrontId,
    createFrontline: async (taken_at, label, copyFrom) => {
      const f = await run(() => api.createFrontline(operationId, { taken_at, label, copy_from: copyFrom }));
      if (f) setActiveFrontId(f.id);
    },
    updateFrontlineMeta: async (id, patch) => void (await run(() => api.updateFrontline(id, patch))),
    deleteFrontline: async (id) => {
      await run(() => api.deleteFrontline(id));
      setActiveFrontId((a) => (a === id ? null : a));
    },
    saveShapes: (id, shapes) => {
      setFrontlines((fs) => fs.map((f) => (f.id === id ? { ...f, shapes } : f)));
      if (pendingSave.current) window.clearTimeout(pendingSave.current.timer);
      const timer = window.setTimeout(async () => {
        pendingSave.current = null;
        try {
          await api.updateFrontline(id, { shapes });
        } catch (e) {
          setError((e as Error).message);
        }
      }, 400);
      pendingSave.current = { timer, id, shapes };
    },
    sitreps,
    saveSitrep: async (id, side, author, body) => {
      try {
        await api.setSitrep(id, side, { author, body });
        await reload();
        return true;
      } catch (e) {
        setError((e as Error).message);
        return false;
      }
    },
    deleteSitrep: async (id, side) => void (await run(() => api.deleteSitrep(id, side))),
    error,
    clearError: () => setError(null),
    selectedId,
    select: setSelectedId,
    orbatViewId,
    openOrbat: setOrbatViewId,

    createUnit: (u) =>
      run(async () => {
        const c = await api.createUnit(operationId, u.template_id !== undefined ? u : { sidc: defaultSidc(u.side), name: "New unit", ...u });
        if (activeFront && u.x != null && u.y != null) await api.updateFrontline(activeFront.id, { positions: { [c.id]: [u.x, u.y] } });
        return c;
      }),
    updateUnit: async (id, patch) => {
      if (!activeFront || !("x" in patch || "y" in patch)) return void (await run(() => api.updateUnit(id, patch)));
      const { x, y, ...rest } = patch;
      const placed = x != null && y != null;
      // The unit's own x/y follow the newest snapshot, so they stay the "current" position new snapshots start from.
      const unitPatch = activeFront.id === latestFront?.id ? { ...rest, x: placed ? x : null, y: placed ? y : null } : rest;
      await run(async () => {
        await api.updateFrontline(activeFront.id, { positions: { [id]: placed ? [x, y] : null } });
        if (Object.keys(unitPatch).length) await api.updateUnit(id, unitPatch);
      });
    },
    moveUnit: async (id, parentId) => {
      const sort = (tree.children.get(parentId) ?? []).reduce((m, u) => Math.max(m, u.sort + 1), 0);
      await run(() => api.updateUnit(id, { parent_id: parentId, sort }));
    },
    deleteUnit: async (id) => {
      const gone = new Set([id, ...descendantIds(tree, id)]);
      await run(() => api.deleteUnit(id));
      setSelectedId((s) => (s !== null && gone.has(s) ? null : s));
      setOrbatViewId((s) => (s !== null && gone.has(s) ? null : s));
    },
    createVehicleType: (name, category) => run(() => api.createVehicleType(name, category)),
    updateVehicleType: async (id, patch) => void (await run(() => api.updateVehicleType(id, patch))),
    deleteVehicleType: async (id) => void (await run(() => api.deleteVehicleType(id))),
    setUnitVehicle: async (u, t, v) => void (await run(() => api.setUnitVehicle(u, t, v))),
    removeUnitVehicle: async (u, t) => void (await run(() => api.removeUnitVehicle(u, t))),
    templates,
    saveTemplate: async (id, name) => void (await run(() => api.saveTemplate(id, name))),
    renameTemplate: async (id, name) => void (await run(() => api.renameTemplate(id, name))),
    deleteTemplate: async (id) => void (await run(() => api.deleteTemplate(id))),
  };

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}
