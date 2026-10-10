import L from "leaflet";
import { FACTOR } from "./config";
import type { Pt } from "../types";

interface XY {
  x: number;
  y: number;
}

function distToSegment(p: XY, a: XY, b: XY): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Ramer–Douglas–Peucker. Returns the indices of the points to keep (always includes first and last). */
export function rdpIndices(pts: XY[], tolerance: number): number[] {
  if (pts.length <= 2) return pts.map((_, i) => i);
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [lo, hi] = stack.pop()!;
    let worst = -1;
    let worstDist = tolerance;
    for (let i = lo + 1; i < hi; i++) {
      const d = distToSegment(pts[i], pts[lo], pts[hi]);
      if (d > worstDist) {
        worst = i;
        worstDist = d;
      }
    }
    if (worst >= 0) {
      keep[worst] = 1;
      stack.push([lo, worst], [worst, hi]);
    }
  }
  return pts.flatMap((_, i) => (keep[i] ? [i] : []));
}

/** World meters represented by one screen pixel at the map's current zoom. */
export const metersPerPixel = (map: L.Map) => 1 / (FACTOR * Math.pow(2, map.getZoom()));

/** Reduce a shape's vertex count. Zones are treated as closed rings so the seam point isn't special. */
export function simplifyPoints(points: Pt[], toleranceMeters: number, closed: boolean): Pt[] {
  const ring = closed ? [...points, points[0]] : points;
  const xy = ring.map(([x, y]) => ({ x, y }));
  const out = rdpIndices(xy, toleranceMeters).map((i) => points[i % points.length]);
  const result = closed && out.length > 1 && out[0] === out[out.length - 1] ? out.slice(0, -1) : out;
  const min = closed ? 3 : 2;
  return result.length >= min ? result : points;
}
