import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const DB_PATH = process.env.C2_DB ?? fileURLToPath(new URL("../data/c2.db", import.meta.url));
mkdirSync(dirname(DB_PATH), { recursive: true });

export const db = new DatabaseSync(DB_PATH);
// DELETE journal (not WAL): every committed write lives in the single c2.db file, so it can be committed to git and
// copied to another machine without -wal/-shm side files.
db.exec("PRAGMA journal_mode = DELETE; PRAGMA foreign_keys = ON;");

db.exec(`
CREATE TABLE IF NOT EXISTS operations (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  map_id     TEXT NOT NULL DEFAULT 'vt7',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS units (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  operation_id  INTEGER REFERENCES operations(id) ON DELETE CASCADE,
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
  operation_id INTEGER REFERENCES operations(id) ON DELETE CASCADE,
  label      TEXT NOT NULL DEFAULT '',
  taken_at   TEXT NOT NULL,
  shapes     TEXT NOT NULL DEFAULT '[]'
);
`);

// Databases created before operations existed: add the column and move their data into a first operation.
const hasColumn = (table: string, col: string) =>
  (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).some((r) => r.name === col);
for (const t of ["units", "frontlines"]) {
  if (!hasColumn(t, "operation_id")) {
    db.exec(`ALTER TABLE ${t} ADD COLUMN operation_id INTEGER REFERENCES operations(id) ON DELETE CASCADE`);
  }
}
const orphans = db.prepare(
  "SELECT (SELECT COUNT(*) FROM units WHERE operation_id IS NULL) + (SELECT COUNT(*) FROM frontlines WHERE operation_id IS NULL) AS n",
).get() as { n: number };
if (orphans.n > 0) {
  const { lastInsertRowid } = db.prepare("INSERT INTO operations (name) VALUES ('Operation 1')").run();
  db.prepare("UPDATE units SET operation_id = ? WHERE operation_id IS NULL").run(lastInsertRowid);
  db.prepare("UPDATE frontlines SET operation_id = ? WHERE operation_id IS NULL").run(lastInsertRowid);
}

export const SIDES = ["friend", "hostile", "neutral", "unknown"] as const;
export const VEHICLE_CATEGORIES = [
  "wheeled", "tracked", "rotary", "fixed-wing", "naval", "static", "other",
] as const;

export type Row = Record<string, unknown>;

const UNIT_FIELDS = [
  "parent_id", "side", "name", "designation", "sidc", "x", "y",
  "pers_active", "pers_wounded", "pers_kia", "pers_mia", "notes", "sort",
] as const;

export function listOperations() {
  return db
    .prepare(
      `SELECT o.*,
         (SELECT COUNT(*) FROM units u WHERE u.operation_id = o.id) AS unit_count,
         (SELECT COUNT(*) FROM frontlines f WHERE f.operation_id = o.id) AS snapshot_count
       FROM operations o ORDER BY o.id`,
    )
    .all();
}

const getOperation = (id: number | bigint) => db.prepare("SELECT * FROM operations WHERE id = ?").get(id);

export function createOperation(b: Row) {
  const name = String(b.name ?? "").trim();
  if (!name) throw new Error("name required");
  const info = db.prepare("INSERT INTO operations (name, map_id) VALUES (?, ?)").run(name, String(b.map_id ?? "vt7"));
  return getOperation(info.lastInsertRowid);
}

export function updateOperation(id: number, b: Row) {
  if (typeof b.name === "string" && b.name.trim()) db.prepare("UPDATE operations SET name = ? WHERE id = ?").run(b.name.trim(), id);
  return getOperation(id);
}

// Cascades to the operation's units (and their vehicle counts) and frontline snapshots. The vehicle library is shared.
export function deleteOperation(id: number) {
  db.prepare("DELETE FROM operations WHERE id = ?").run(id);
}

export function snapshot(operationId: number) {
  if (!getOperation(operationId)) throw new Error("unknown operation");
  return {
    units: db.prepare("SELECT * FROM units WHERE operation_id = ? ORDER BY sort, id").all(operationId),
    vehicleTypes: db.prepare("SELECT * FROM vehicle_types ORDER BY category, name").all(),
    unitVehicles: db
      .prepare("SELECT uv.* FROM unit_vehicles uv JOIN units u ON u.id = uv.unit_id WHERE u.operation_id = ?")
      .all(operationId),
    frontlines: db
      .prepare("SELECT * FROM frontlines WHERE operation_id = ? ORDER BY taken_at, id")
      .all(operationId)
      .map(parseFrontline),
  };
}

export function createUnit(operationId: number, b: Row) {
  const cols = ["operation_id", ...UNIT_FIELDS.filter((f) => b[f] !== undefined)];
  const info = db
    .prepare(`INSERT INTO units (${cols.join(",")}) VALUES (${cols.map(() => "?").join(",")})`)
    .run(operationId, ...(cols.slice(1).map((c) => b[c]) as never[]));
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
export function createFrontline(operationId: number, b: Row) {
  let shapes = b.shapes ?? [];
  if (b.copy_from !== undefined) {
    const src = db.prepare("SELECT shapes FROM frontlines WHERE id = ?").get(Number(b.copy_from)) as Row | undefined;
    if (src) shapes = JSON.parse(src.shapes as string);
  }
  const info = db
    .prepare("INSERT INTO frontlines (operation_id, label, taken_at, shapes) VALUES (?, ?, ?, ?)")
    .run(operationId, String(b.label ?? ""), String(b.taken_at), JSON.stringify(shapes));
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
