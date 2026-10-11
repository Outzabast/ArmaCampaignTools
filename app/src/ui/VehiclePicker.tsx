import { useEffect, useMemo, useRef, useState } from "react";
import { VEHICLE_CATEGORIES, type VehicleCategory, type VehicleType } from "../types";

/** Case/punctuation-insensitive form, so "bmp2" matches "BMP-2" and "m1 abrams" matches "M1A2 Abrams". */
export const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Every whitespace-separated word of the query must appear in the name or class. */
export function matchesQuery(t: Pick<VehicleType, "name" | "category">, query: string): boolean {
  const hay = norm(`${t.name} ${t.category}`);
  return query
    .split(/\s+/)
    .map(norm)
    .filter(Boolean)
    .every((tok) => hay.includes(tok));
}

type Row =
  | { kind: "head"; label: string }
  | { kind: "type"; type: VehicleType; taken: boolean }
  | { kind: "create"; name: string };

function Highlight({ text, query }: { text: string; query: string }) {
  const i = query ? text.toLowerCase().indexOf(query.toLowerCase()) : -1;
  if (i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <mark>{text.slice(i, i + query.length)}</mark>
      {text.slice(i + query.length)}
    </>
  );
}

interface Props {
  types: VehicleType[];
  /** Types already on this unit: shown greyed out so it is clear why they can't be picked. */
  taken: Set<number>;
  onPick: (type: VehicleType) => void;
  onCreate: (name: string, category: VehicleCategory) => void;
}

/**
 * Type-ahead picker for the shared vehicle library. Typing filters, class chips narrow further, arrow keys + Enter pick,
 * and a name that doesn't exist yet offers "Create" with the chosen class.
 */
export function VehiclePicker({ types, taken, onPick, onCreate }: Props) {
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState<VehicleCategory | "all">("all");
  const [newCat, setNewCat] = useState<VehicleCategory>("wheeled");
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const activeEl = useRef<HTMLLIElement>(null);
  const q = query.trim();

  useEffect(() => {
    input.current?.focus();
  }, []);
  // Filtering by a class means a new vehicle most likely belongs to that class.
  useEffect(() => {
    if (cat !== "all") setNewCat(cat);
  }, [cat]);

  const counts = useMemo(() => {
    const c = new Map<VehicleCategory, number>();
    for (const t of types) if (matchesQuery(t, q)) c.set(t.category, (c.get(t.category) ?? 0) + 1);
    return c;
  }, [types, q]);

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    const nq = norm(q);
    for (const c of VEHICLE_CATEGORIES) {
      if (cat !== "all" && cat !== c) continue;
      const list = types
        .filter((t) => t.category === c && matchesQuery(t, q))
        // Names that start with the query first, then the rest alphabetically.
        .sort((a, b) => Number(norm(b.name).startsWith(nq)) - Number(norm(a.name).startsWith(nq)) || a.name.localeCompare(b.name));
      if (!list.length) continue;
      out.push({ kind: "head", label: `${c} (${list.length})` });
      for (const t of list) out.push({ kind: "type", type: t, taken: taken.has(t.id) });
    }
    const exists = types.some((t) => norm(t.name) === norm(q));
    if (q && !exists) out.push({ kind: "create", name: q });
    return out;
  }, [types, taken, q, cat]);

  // Indices into `rows` that can actually be chosen (not headers, not already-added types).
  const pickable = useMemo(() => rows.flatMap((r, i) => (r.kind === "head" || (r.kind === "type" && r.taken) ? [] : [i])), [rows]);
  const activeRow = pickable[Math.min(active, pickable.length - 1)] ?? -1;
  useEffect(() => {
    setActive(0);
  }, [q, cat]);
  useEffect(() => {
    activeEl.current?.scrollIntoView({ block: "nearest" });
  }, [activeRow]);

  const choose = (row: Row) => {
    if (row.kind === "type" && !row.taken) onPick(row.type);
    else if (row.kind === "create") onCreate(row.name, newCat);
    else return;
    setQuery("");
    input.current?.focus();
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const step = e.key === "ArrowDown" ? 1 : -1;
      setActive((a) => (Math.min(a, pickable.length - 1) + step + pickable.length) % Math.max(pickable.length, 1));
    } else if (e.key === "Enter" && activeRow >= 0) {
      e.preventDefault();
      choose(rows[activeRow]);
    } else if (e.key === "Escape" && query) {
      e.stopPropagation();
      setQuery("");
    }
  };

  return (
    <div className="vpicker">
      <input
        ref={input}
        value={query}
        placeholder={`Search ${types.length} vehicles…  (e.g. "bmp", "tow", "heli")`}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={onKey}
      />
      <div className="vp-chips">
        <button className={cat === "all" ? "active" : ""} onClick={() => setCat("all")}>All</button>
        {VEHICLE_CATEGORIES.filter((c) => counts.has(c) || cat === c).map((c) => (
          <button key={c} className={cat === c ? "active" : ""} onClick={() => setCat(cat === c ? "all" : c)}>
            {c} <small>{counts.get(c) ?? 0}</small>
          </button>
        ))}
      </div>

      <ul className="vp-list" role="listbox">
        {rows.map((r, i) =>
          r.kind === "head" ? (
            <li key={`h${r.label}`} className="vp-head">{r.label}</li>
          ) : r.kind === "type" ? (
            <li
              key={r.type.id}
              ref={i === activeRow ? activeEl : undefined}
              className={`vp-item${i === activeRow ? " active" : ""}${r.taken ? " taken" : ""}`}
              role="option"
              aria-selected={i === activeRow}
              onMouseEnter={() => !r.taken && setActive(pickable.indexOf(i))}
              onClick={() => choose(r)}
            >
              <span className="grow"><Highlight text={r.type.name} query={q} /></span>
              {r.taken && <small>already on this unit</small>}
            </li>
          ) : (
            <li
              key="create"
              ref={i === activeRow ? activeEl : undefined}
              className={`vp-item vp-create${i === activeRow ? " active" : ""}`}
              role="option"
              aria-selected={i === activeRow}
              onMouseEnter={() => setActive(pickable.indexOf(i))}
              onClick={() => choose(r)}
            >
              <span className="grow">＋ Create “{r.name}”</span>
              <select
                value={newCat}
                title="Class for the new vehicle"
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => setNewCat(e.target.value as VehicleCategory)}
              >
                {VEHICLE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </li>
          ),
        )}
        {rows.length === 0 && <li className="vp-empty">{types.length === 0 ? "No vehicles yet — type a name to create one." : "No matches."}</li>}
      </ul>
    </div>
  );
}
