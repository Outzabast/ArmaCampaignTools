import { useCallback, useEffect, useState } from "react";
import { api } from "./api";
import { MAPS, mapName } from "./map/config";
import { StoreProvider } from "./store";
import type { Operation } from "./types";
import { App } from "./App";
import { OpCtx } from "./opContext";

const LAST_KEY = "c2.operation";
const readLast = () => {
  try {
    const n = Number(localStorage.getItem(LAST_KEY));
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
};
const writeLast = (id: number | null) => {
  try {
    if (id === null) localStorage.removeItem(LAST_KEY);
    else localStorage.setItem(LAST_KEY, String(id));
  } catch {
    /* storage unavailable: just don't remember */
  }
};

/** Top level: operation list, or the app for the open operation. */
export function Root() {
  const [ops, setOps] = useState<Operation[] | null>(null);
  const [openId, setOpenId] = useState<number | null>(readLast);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setOps(await api.operations());
      setError(null);
    } catch (e) {
      setError(`Cannot reach the API: ${(e as Error).message}`);
    }
  }, []);
  useEffect(() => void reload(), [reload]);

  const open = (id: number | null) => {
    setOpenId(id);
    writeLast(id);
    if (id === null) void reload(); // refresh counts shown in the list
  };

  const guard = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      await reload();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  if (ops === null) return <div className="ops-screen"><div className="ops-card">{error ?? "Loading…"}{error && <button onClick={reload}>Retry</button>}</div></div>;

  const current = ops.find((o) => o.id === openId);
  if (current) {
    return (
      <OpCtx.Provider
        value={{
          operation: current,
          switchOperation: () => open(null),
          saveSituation: async (author, body) => {
            await api.setSituation(current.id, body, author);
            await reload();
          },
        }}
      >
        <StoreProvider key={current.id} operationId={current.id}>
          <App />
        </StoreProvider>
      </OpCtx.Provider>
    );
  }

  return (
    <OperationPicker
      ops={ops}
      error={error}
      onOpen={open}
      onCreate={async (name, map) => {
        try {
          const op = await api.createOperation(name, map);
          await reload();
          open(op.id);
        } catch (e) {
          setError((e as Error).message);
        }
      }}
      onRename={(id, name) => guard(() => api.renameOperation(id, name))}
      onDelete={(id) => guard(() => api.deleteOperation(id))}
    />
  );
}

interface PickerProps {
  ops: Operation[];
  error: string | null;
  onOpen: (id: number) => void;
  onCreate: (name: string, mapId: string) => void;
  onRename: (id: number, name: string) => void;
  onDelete: (id: number) => void;
}

function OperationPicker({ ops, error, onOpen, onCreate, onRename, onDelete }: PickerProps) {
  const [name, setName] = useState("");
  const [mapId, setMapId] = useState(MAPS[0].id);
  const create = () => name.trim() && (onCreate(name.trim(), mapId), setName(""));

  return (
    <div className="ops-screen">
      <div className="ops-card">
        <h1>Operations</h1>
        <p className="muted">Each operation has its own units, ORBAT and frontline history. Vehicle types are shared.</p>
        {error && <div className="error">{error}</div>}

        {ops.length === 0 && <div className="empty-note">No operations yet. Create your first one below.</div>}
        <ul className="ops-list">
          {ops.map((o) => (
            <li key={o.id}>
              <div className="grow" onClick={() => onOpen(o.id)}>
                <b>{o.name}</b>
                <small>
                  {mapName(o.map_id)} · {o.unit_count} unit{o.unit_count === 1 ? "" : "s"} · {o.snapshot_count} frontline snapshot{o.snapshot_count === 1 ? "" : "s"}
                </small>
              </div>
              <button className="primary" onClick={() => onOpen(o.id)}>Open</button>
              <button
                onClick={() => {
                  const n = prompt("Rename operation", o.name);
                  if (n && n.trim()) onRename(o.id, n.trim());
                }}
              >
                Rename
              </button>
              <button
                className="x"
                title="Delete operation"
                onClick={() =>
                  confirm(`Delete "${o.name}" with its ${o.unit_count} unit(s) and ${o.snapshot_count} frontline snapshot(s)? This cannot be undone. Vehicle types are kept.`) && onDelete(o.id)
                }
              >
                ✕
              </button>
            </li>
          ))}
        </ul>

        <h3>New operation</h3>
        <div className="row2">
          <input autoFocus placeholder="Operation name" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && create()} />
          <select value={mapId} onChange={(e) => setMapId(e.target.value)} disabled={MAPS.length < 2} title="Map">
            {MAPS.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
          <button className="primary" disabled={!name.trim()} onClick={create}>Create</button>
        </div>
      </div>
    </div>
  );
}
