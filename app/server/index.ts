import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import * as d from "./db.ts";

const PORT = Number(process.env.PORT ?? 3001);

async function readJson(req: IncomingMessage): Promise<d.Row> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

function send(res: ServerResponse, status: number, body?: unknown) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(body === undefined ? "" : JSON.stringify(body));
}

type Handler = (m: RegExpMatchArray, body: d.Row) => unknown;
const routes: [string, RegExp, Handler][] = [];
const route = (method: string, path: string, h: Handler) =>
  routes.push([method, new RegExp(`^${path.replace(/:(\w+)/g, "(?<$1>[^/]+)")}$`), h]);

route("GET", "/api/operations", () => d.listOperations());
route("POST", "/api/operations", (_, b) => d.createOperation(b));
route("PATCH", "/api/operations/:id", (m, b) => d.updateOperation(Number(m.groups!.id), b));
route("DELETE", "/api/operations/:id", (m) => d.deleteOperation(Number(m.groups!.id)));
route("GET", "/api/operations/:id/state", (m) => d.snapshot(Number(m.groups!.id)));

route("POST", "/api/operations/:id/units", (m, b) => {
  if (!(d.SIDES as readonly string[]).includes(b.side as string)) throw new Error("bad side");
  return d.createUnit(Number(m.groups!.id), b);
});
route("PATCH", "/api/units/:id", (m, b) => d.updateUnit(Number(m.groups!.id), b));
route("DELETE", "/api/units/:id", (m) => d.deleteUnit(Number(m.groups!.id)));

route("POST", "/api/vehicle-types", (_, b) => {
  if (!b.name || !(d.VEHICLE_CATEGORIES as readonly string[]).includes(b.category as string)) throw new Error("bad vehicle type");
  return d.createVehicleType(String(b.name).trim(), b.category as string);
});
route("PATCH", "/api/vehicle-types/:id", (m, b) => d.updateVehicleType(Number(m.groups!.id), b));
route("DELETE", "/api/vehicle-types/:id", (m) => d.deleteVehicleType(Number(m.groups!.id)));

route("PUT", "/api/units/:id/vehicles/:typeId", (m, b) =>
  d.setUnitVehicle(Number(m.groups!.id), Number(m.groups!.typeId), b));
route("DELETE", "/api/units/:id/vehicles/:typeId", (m) =>
  d.removeUnitVehicle(Number(m.groups!.id), Number(m.groups!.typeId)));

route("POST", "/api/operations/:id/frontlines", (m, b) => {
  if (!b.taken_at) throw new Error("taken_at required");
  return d.createFrontline(Number(m.groups!.id), b);
});
route("PATCH", "/api/frontlines/:id", (m, b) => d.updateFrontline(Number(m.groups!.id), b));
route("DELETE", "/api/frontlines/:id", (m) => d.deleteFrontline(Number(m.groups!.id)));

createServer(async (req, res) => {
  const path = (req.url ?? "").split("?")[0];
  for (const [method, re, handler] of routes) {
    if (req.method !== method) continue;
    const m = path.match(re);
    if (!m) continue;
    try {
      const out = handler(m, method === "GET" || method === "DELETE" ? {} : await readJson(req));
      return send(res, out === undefined ? 204 : 200, out);
    } catch (e) {
      return send(res, 400, { error: (e as Error).message });
    }
  }
  send(res, 404, { error: "not found" });
}).listen(PORT, "127.0.0.1", () => console.log(`C2 API on http://127.0.0.1:${PORT}`));
