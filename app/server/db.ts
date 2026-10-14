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
-- One optional situation report per side per frontline snapshot; a missing row means that side has not reported.
CREATE TABLE IF NOT EXISTS sitreps (
  frontline_id INTEGER NOT NULL REFERENCES frontlines(id) ON DELETE CASCADE,
  side         TEXT    NOT NULL CHECK (side IN ('friend','hostile','neutral','unknown')),
  author       TEXT    NOT NULL DEFAULT '',
  body         TEXT    NOT NULL DEFAULT '',
  updated_at   TEXT    NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (frontline_id, side)
);
-- Reusable ORBAT subtrees, shared across operations like the vehicle library. "tree" is a TemplateNode (JSON).
CREATE TABLE IF NOT EXISTS unit_templates (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  side       TEXT NOT NULL CHECK (side IN ('friend','hostile','neutral','unknown')),
  tree       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
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
// Operation situation / background, written by the Zeus team.
if (!hasColumn("operations", "situation")) {
  db.exec(`ALTER TABLE operations ADD COLUMN situation TEXT NOT NULL DEFAULT '';
           ALTER TABLE operations ADD COLUMN situation_author TEXT NOT NULL DEFAULT '';
           ALTER TABLE operations ADD COLUMN situation_updated_at TEXT`);
}

// Vehicle losses besides destruction.
if (!hasColumn("unit_vehicles", "abandoned")) {
  db.exec(`ALTER TABLE unit_vehicles ADD COLUMN abandoned INTEGER NOT NULL DEFAULT 0;
           ALTER TABLE unit_vehicles ADD COLUMN captured INTEGER NOT NULL DEFAULT 0`);
}

// Unit positions per frontline snapshot, as {unitId: [x, y]}; a unit missing from the map is off the map in that snapshot.
// Snapshots taken before this existed start with the units' current positions.
if (!hasColumn("frontlines", "positions")) {
  db.exec("ALTER TABLE frontlines ADD COLUMN positions TEXT NOT NULL DEFAULT '{}'");
  for (const f of db.prepare("SELECT id, operation_id FROM frontlines").all() as Row[]) {
    db.prepare("UPDATE frontlines SET positions = ? WHERE id = ?").run(JSON.stringify(currentPositions(f.operation_id as number)), f.id as number);
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
  if (typeof b.situation === "string") {
    const has = b.situation.trim() !== "";
    db.prepare(
      `UPDATE operations SET situation = ?, situation_author = ?, situation_updated_at = ${has ? "datetime('now')" : "NULL"} WHERE id = ?`,
    ).run(has ? b.situation : "", has ? String(b.situation_author ?? "").trim() : "", id);
  }
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
    sitreps: db
      .prepare("SELECT s.* FROM sitreps s JOIN frontlines f ON f.id = s.frontline_id WHERE f.operation_id = ?")
      .all(operationId),
    templates: listTemplates(),
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
  if (b.parent_id !== undefined && b.parent_id !== null) checkReparent(id, Number(b.parent_id));
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

/** A unit may only move under a unit of the same operation and side, and never under itself or its own subordinates. */
function checkReparent(id: number, parentId: number) {
  const get = db.prepare("SELECT id, parent_id, operation_id, side FROM units WHERE id = ?");
  const unit = get.get(id) as Row | undefined;
  const parent = get.get(parentId) as Row | undefined;
  if (!unit || !parent) throw new Error("unit not found");
  if (parent.operation_id !== unit.operation_id) throw new Error("cannot move a unit to another operation");
  if (parent.side !== unit.side) throw new Error("cannot move a unit under a unit of another side");
  for (let p: Row | undefined = parent; p; p = p.parent_id === null ? undefined : (get.get(p.parent_id) as Row | undefined)) {
    if (p.id === id) throw new Error("cannot move a unit under itself or its own subordinates");
  }
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

const VEHICLE_STATUSES = ["operational", "damaged", "destroyed", "abandoned", "captured"] as const;

export function setUnitVehicle(unitId: number, typeId: number, b: Row) {
  db.prepare(
    `INSERT INTO unit_vehicles (unit_id, vehicle_type_id, ${VEHICLE_STATUSES.join(", ")}) VALUES (?,?,?,?,?,?,?)
     ON CONFLICT(unit_id, vehicle_type_id) DO UPDATE SET
       ${VEHICLE_STATUSES.map((c) => `${c} = excluded.${c}`).join(", ")}`,
  ).run(unitId, typeId, ...VEHICLE_STATUSES.map((c) => Number(b[c] ?? 0)));
  return db.prepare("SELECT * FROM unit_vehicles WHERE unit_id = ? AND vehicle_type_id = ?").get(unitId, typeId);
}

export function removeUnitVehicle(unitId: number, typeId: number) {
  db.prepare("DELETE FROM unit_vehicles WHERE unit_id = ? AND vehicle_type_id = ?").run(unitId, typeId);
}

/** A template is a unit subtree at full strength: every casualty counts as active, every vehicle as operational. */
interface TemplateNode {
  name: string;
  designation: string;
  sidc: string;
  personnel: number;
  notes: string;
  vehicles: { vehicle_type_id: number; count: number }[];
  children: TemplateNode[];
}

const SIDC_DIGIT: Record<string, string> = { friend: "3", hostile: "6", neutral: "4", unknown: "1" };

function listTemplates() {
  return (db.prepare("SELECT * FROM unit_templates ORDER BY name, id").all() as Row[]).map((r) => {
    const tree = JSON.parse(r.tree as string) as TemplateNode;
    const count = (n: TemplateNode): number => 1 + n.children.reduce((a, c) => a + count(c), 0);
    return { id: r.id, name: r.name, side: r.side, created_at: r.created_at, unit_count: count(tree) };
  });
}

export function createTemplate(unitId: number, b: Row) {
  const root = db.prepare("SELECT * FROM units WHERE id = ?").get(unitId) as Row | undefined;
  if (!root) throw new Error("unknown unit");
  const kids = db.prepare("SELECT * FROM units WHERE parent_id = ? ORDER BY sort, id");
  const vehicles = db.prepare("SELECT * FROM unit_vehicles WHERE unit_id = ?");
  const capture = (u: Row): TemplateNode => ({
    name: u.name as string,
    designation: u.designation as string,
    sidc: u.sidc as string,
    personnel: Number(u.pers_active) + Number(u.pers_wounded) + Number(u.pers_kia) + Number(u.pers_mia),
    notes: u.notes as string,
    vehicles: (vehicles.all(u.id) as Row[])
      .map((v) => ({ vehicle_type_id: Number(v.vehicle_type_id), count: VEHICLE_STATUSES.reduce((a, c) => a + Number(v[c]), 0) }))
      .filter((v) => v.count > 0),
    children: (kids.all(u.id) as Row[]).map(capture),
  });
  const name = String(b.name ?? "").trim() || (root.name as string);
  db.prepare("INSERT INTO unit_templates (name, side, tree) VALUES (?, ?, ?)").run(name, root.side as string, JSON.stringify(capture(root)));
  return listTemplates();
}

export function renameTemplate(id: number, b: Row) {
  const name = String(b.name ?? "").trim();
  if (name) db.prepare("UPDATE unit_templates SET name = ? WHERE id = ?").run(name, id);
}

export function deleteTemplate(id: number) {
  db.prepare("DELETE FROM unit_templates WHERE id = ?").run(id);
}

/** Builds a template's whole subtree in one transaction. The root takes the given side, parent and map position. */
export function instantiateTemplate(operationId: number, templateId: number, b: Row) {
  const row = db.prepare("SELECT tree FROM unit_templates WHERE id = ?").get(templateId) as Row | undefined;
  if (!row) throw new Error("unknown template");
  const side = String(b.side);
  const digit = SIDC_DIGIT[side];
  const knownTypes = new Set((db.prepare("SELECT id FROM vehicle_types").all() as Row[]).map((r) => Number(r.id)));
  const insUnit = db.prepare(
    `INSERT INTO units (operation_id, parent_id, side, name, designation, sidc, x, y, pers_active, notes, sort)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const insVehicle = db.prepare("INSERT INTO unit_vehicles (unit_id, vehicle_type_id, operational) VALUES (?, ?, ?)");
  const build = (n: TemplateNode, parentId: number | bigint | null, sort: number, pos: [unknown, unknown]): number | bigint => {
    const sidc = n.sidc.substring(0, 3) + digit + n.sidc.substring(4);
    const id = insUnit.run(operationId, parentId, side, n.name, n.designation, sidc, ...(pos as never[]), n.personnel, n.notes, sort).lastInsertRowid;
    // A vehicle type deleted from the library since the template was saved is skipped.
    for (const v of n.vehicles) if (knownTypes.has(v.vehicle_type_id)) insVehicle.run(id, v.vehicle_type_id, v.count);
    n.children.forEach((c, i) => build(c, id, i, [null, null]));
    return id;
  };
  db.exec("BEGIN");
  try {
    const tree = JSON.parse(row.tree as string) as TemplateNode;
    const rootId = build(tree, (b.parent_id as number | null) ?? null, Number(b.sort ?? 0), [b.x ?? null, b.y ?? null]);
    db.exec("COMMIT");
    return db.prepare("SELECT * FROM units WHERE id = ?").get(rootId);
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

function parseFrontline(r: Row) {
  return { ...r, shapes: JSON.parse(r.shapes as string), positions: JSON.parse(r.positions as string) };
}

function currentPositions(operationId: number) {
  const rows = db.prepare("SELECT id, x, y FROM units WHERE operation_id = ? AND x IS NOT NULL AND y IS NOT NULL").all(operationId) as Row[];
  return Object.fromEntries(rows.map((u) => [u.id, [u.x, u.y]]));
}

const getFrontline = (id: number | bigint) => parseFrontline(db.prepare("SELECT * FROM frontlines WHERE id = ?").get(id)!);

/**
 * New snapshot; `copy_from` clones another snapshot's shapes and unit positions so each update starts from the previous
 * one. Without it, units start where they currently are.
 */
export function createFrontline(operationId: number, b: Row) {
  let shapes = b.shapes ?? [];
  let positions = JSON.stringify(currentPositions(operationId));
  if (b.copy_from !== undefined) {
    const src = db.prepare("SELECT shapes, positions FROM frontlines WHERE id = ?").get(Number(b.copy_from)) as Row | undefined;
    if (src) {
      shapes = JSON.parse(src.shapes as string);
      positions = src.positions as string;
    }
  }
  const info = db
    .prepare("INSERT INTO frontlines (operation_id, label, taken_at, shapes, positions) VALUES (?, ?, ?, ?, ?)")
    .run(operationId, String(b.label ?? ""), String(b.taken_at), JSON.stringify(shapes), positions);
  return getFrontline(info.lastInsertRowid);
}

export function updateFrontline(id: number, b: Row) {
  if (typeof b.label === "string") db.prepare("UPDATE frontlines SET label = ? WHERE id = ?").run(b.label, id);
  if (typeof b.taken_at === "string") db.prepare("UPDATE frontlines SET taken_at = ? WHERE id = ?").run(b.taken_at, id);
  if (Array.isArray(b.shapes)) db.prepare("UPDATE frontlines SET shapes = ? WHERE id = ?").run(JSON.stringify(b.shapes), id);
  // Merged per unit so concurrent moves of different units don't overwrite each other; null takes a unit off the map.
  if (b.positions && typeof b.positions === "object") {
    const row = db.prepare("SELECT positions FROM frontlines WHERE id = ?").get(id) as Row | undefined;
    if (row) {
      const positions = JSON.parse(row.positions as string);
      for (const [unitId, pos] of Object.entries(b.positions as Row)) {
        if (pos === null) delete positions[unitId];
        else positions[unitId] = pos;
      }
      db.prepare("UPDATE frontlines SET positions = ? WHERE id = ?").run(JSON.stringify(positions), id);
    }
  }
  return getFrontline(id);
}

export function deleteFrontline(id: number) {
  db.prepare("DELETE FROM frontlines WHERE id = ?").run(id);
}

/** Upserts a side's SITREP for a snapshot; an empty body removes it (the side goes back to "no report"). */
export function setSitrep(frontlineId: number, side: string, b: Row) {
  const body = String(b.body ?? "");
  if (!body.trim()) {
    deleteSitrep(frontlineId, side);
    return undefined;
  }
  db.prepare(
    `INSERT INTO sitreps (frontline_id, side, author, body, updated_at) VALUES (?, ?, ?, ?, datetime('now'))
     ON CONFLICT(frontline_id, side) DO UPDATE SET author = excluded.author, body = excluded.body, updated_at = excluded.updated_at`,
  ).run(frontlineId, side, String(b.author ?? "").trim(), body);
  return db.prepare("SELECT * FROM sitreps WHERE frontline_id = ? AND side = ?").get(frontlineId, side);
}

export function deleteSitrep(frontlineId: number, side: string) {
  db.prepare("DELETE FROM sitreps WHERE frontline_id = ? AND side = ?").run(frontlineId, side);
}
