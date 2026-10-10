import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const DB_PATH = process.env.C2_DB ?? fileURLToPath(new URL("../data/c2.db", import.meta.url));
mkdirSync(dirname(DB_PATH), { recursive: true });

export const db = new DatabaseSync(DB_PATH);
db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");

db.exec(`
CREATE TABLE IF NOT EXISTS units (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  parent_id     INTEGER REFERENCES units(id) ON DELETE CASCADE,
  side          TEXT    NOT NULL CHECK (side IN ('friend','hostile','neutral','unknown')),
  name          TEXT    NOT NULL,
  designation   TEXT    NOT NULL DEFAULT '',
  sidc          TEXT    NOT NULL,
  x             REAL,
  y             REAL,
  pers_active   INTEGER NOT NULL DEFAULT 0,
  pers_wounded  INTEGER NOT NULL DEFAULT 0,
  pers_kia      INTEGER NOT NULL DEFAULT 0,
  pers_mia      INTEGER NOT NULL DEFAULT 0,
  notes         TEXT    NOT NULL DEFAULT '',
  sort          INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS vehicle_types (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  name      TEXT NOT NULL UNIQUE,
  category  TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS unit_vehicles (
  unit_id         INTEGER NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  vehicle_type_id INTEGER NOT NULL REFERENCES vehicle_types(id) ON DELETE CASCADE,
  operational     INTEGER NOT NULL DEFAULT 0,
  damaged         INTEGER NOT NULL DEFAULT 0,
  destroyed       INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (unit_id, vehicle_type_id)
);
CREATE TABLE IF NOT EXISTS frontlines (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  label      TEXT NOT NULL DEFAULT '',
  taken_at   TEXT NOT NULL,
  shapes     TEXT NOT NULL DEFAULT '[]'
);
`);

export const SIDES = ["friend", "hostile", "neutral", "unknown"] as const;
export const VEHICLE_CATEGORIES = [
  "wheeled", "tracked", "rotary", "fixed-wing", "naval", "static", "other",
] as const;

export type Row = Record<string, unknown>;

const UNIT_FIELDS = [
  "parent_id", "side", "name", "designation", "sidc", "x", "y",
  "pers_active", "pers_wounded", "pers_kia", "pers_mia", "notes", "sort",
] as const;

export function snapshot() {
  return {
    units: db.prepare("SELECT * FROM units ORDER BY sort, id").all(),
    vehicleTypes: db.prepare("SELECT * FROM vehicle_types ORDER BY category, name").all(),
    unitVehicles: db.prepare("SELECT * FROM unit_vehicles").all(),
    frontlines: db.prepare("SELECT * FROM frontlines ORDER BY taken_at, id").all().map(parseFrontline),
  };
}

export function createUnit(b: Row) {
  const cols = UNIT_FIELDS.filter((f) => b[f] !== undefined);
  const info = db
    .prepare(`INSERT INTO units (${cols.join(",")}) VALUES (${cols.map(() => "?").join(",")})`)
    .run(...(cols.map((c) => b[c]) as never[]));
  return db.prepare("SELECT * FROM units WHERE id = ?").get(info.lastInsertRowid);
}

export function updateUnit(id: number, b: Row) {
  const cols = UNIT_FIELDS.filter((f) => b[f] !== undefined);
  if (cols.length) {
    db.prepare(`UPDATE units SET ${cols.map((c) => `${c} = ?`).join(",")} WHERE id = ?`).run(
      ...(cols.map((c) => b[c]) as never[]),
      id,
    );
  }
  // A side change cascades to the whole subtree so a formation never mixes affiliations.
  if (typeof b.side === "string") {
    const sidcDigit = { friend: "3", hostile: "6", neutral: "4", unknown: "1" }[b.side as string];
    db.prepare(
      `WITH RECURSIVE sub(id) AS (SELECT ? UNION ALL SELECT u.id FROM units u JOIN sub ON u.parent_id = sub.id)
       UPDATE units SET side = ?, sidc = substr(sidc,1,3) || ? || substr(sidc,5) WHERE id IN (SELECT id FROM sub)`,
    ).run(id, b.side, sidcDigit);
  }
  return db.prepare("SELECT * FROM units WHERE id = ?").get(id);
}

export function deleteUnit(id: number) {
  db.prepare("DELETE FROM units WHERE id = ?").run(id);
}

export function createVehicleType(name: string, category: string) {
  db.prepare("INSERT OR IGNORE INTO vehicle_types (name, category) VALUES (?, ?)").run(name, category);
  return db.prepare("SELECT * FROM vehicle_types WHERE name = ?").get(name);
}

export function updateVehicleType(id: number, b: Row) {
  if (typeof b.name === "string") db.prepare("UPDATE vehicle_types SET name = ? WHERE id = ?").run(b.name, id);
  if (typeof b.category === "string") db.prepare("UPDATE vehicle_types SET category = ? WHERE id = ?").run(b.category, id);
  return db.prepare("SELECT * FROM vehicle_types WHERE id = ?").get(id);
}

export function deleteVehicleType(id: number) {
  db.prepare("DELETE FROM vehicle_types WHERE id = ?").run(id);
}

export function setUnitVehicle(unitId: number, typeId: number, b: Row) {
  db.prepare(
    `INSERT INTO unit_vehicles (unit_id, vehicle_type_id, operational, damaged, destroyed) VALUES (?,?,?,?,?)
     ON CONFLICT(unit_id, vehicle_type_id) DO UPDATE SET operational = excluded.operational,
       damaged = excluded.damaged, destroyed = excluded.destroyed`,
  ).run(unitId, typeId, Number(b.operational ?? 0), Number(b.damaged ?? 0), Number(b.destroyed ?? 0));
  return db.prepare("SELECT * FROM unit_vehicles WHERE unit_id = ? AND vehicle_type_id = ?").get(unitId, typeId);
}

export function removeUnitVehicle(unitId: number, typeId: number) {
  db.prepare("DELETE FROM unit_vehicles WHERE unit_id = ? AND vehicle_type_id = ?").run(unitId, typeId);
}

function parseFrontline(r: Row) {
  return { ...r, shapes: JSON.parse(r.shapes as string) };
}

const getFrontline = (id: number | bigint) => parseFrontline(db.prepare("SELECT * FROM frontlines WHERE id = ?").get(id)!);

/** New snapshot; `copy_from` clones another snapshot's shapes so each update starts from the previous line. */
export function createFrontline(b: Row) {
  let shapes = b.shapes ?? [];
  if (b.copy_from !== undefined) {
    const src = db.prepare("SELECT shapes FROM frontlines WHERE id = ?").get(Number(b.copy_from)) as Row | undefined;
    if (src) shapes = JSON.parse(src.shapes as string);
  }
  const info = db
    .prepare("INSERT INTO frontlines (label, taken_at, shapes) VALUES (?, ?, ?)")
    .run(String(b.label ?? ""), String(b.taken_at), JSON.stringify(shapes));
  return getFrontline(info.lastInsertRowid);
}

export function updateFrontline(id: number, b: Row) {
  if (typeof b.label === "string") db.prepare("UPDATE frontlines SET label = ? WHERE id = ?").run(b.label, id);
  if (typeof b.taken_at === "string") db.prepare("UPDATE frontlines SET taken_at = ? WHERE id = ?").run(b.taken_at, id);
  if (Array.isArray(b.shapes)) db.prepare("UPDATE frontlines SET shapes = ? WHERE id = ?").run(JSON.stringify(b.shapes), id);
  return getFrontline(id);
}

export function deleteFrontline(id: number) {
  db.prepare("DELETE FROM frontlines WHERE id = ?").run(id);
}
