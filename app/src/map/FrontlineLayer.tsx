import { useEffect, useRef, type MutableRefObject } from "react";
import L from "leaflet";
import type { Frontline, Pt, Shape, ShapeKind } from "../types";

export const SHAPE_COLOR: Record<ShapeKind, string> = {
  friend: "#2f7de1",
  hostile: "#e03a32",
  contested: "#f0a020",
  front: "#111111",
};

export type DrawTool = { type: "zone"; kind: ShapeKind } | { type: "line"; kind: ShapeKind };

const PANE = "frontline";
const MIN_POINTS = { zone: 3, line: 2 } as const;

const ll = (p: Pt) => L.latLng(p[1], p[0]);
const toPt = (l: L.LatLng): Pt => [Math.round(l.lng * 10) / 10, Math.round(l.lat * 10) / 10];
const newId = () => Math.random().toString(36).slice(2, 10);

/** Shoelace area of a zone in km². */
export function areaKm2(points: Pt[]): number {
  let a = 0;
  for (let i = 0; i < points.length; i++) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[(i + 1) % points.length];
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a) / 2 / 1e6;
}

function pathOptions(s: Shape, selected: boolean, interactive: boolean): L.PathOptions {
  const color = SHAPE_COLOR[s.kind];
  const base: L.PathOptions = { pane: PANE, interactive, bubblingMouseEvents: false };
  if (s.type === "zone") {
    return { ...base, color, weight: selected ? 4 : 2, fillColor: color, fillOpacity: s.kind === "contested" ? 0.22 : 0.26, dashArray: s.kind === "contested" ? "8 6" : undefined };
  }
  return { ...base, color, weight: selected ? 6 : 4, opacity: 1 };
}

const vertexIcon = L.divIcon({ className: "fl-vertex", iconSize: [12, 12] });
const midIcon = L.divIcon({ className: "fl-mid", iconSize: [8, 8] });

export interface DrawControl {
  finish: () => void;
  undo: () => void;
}

interface Props {
  controlRef: MutableRefObject<DrawControl | null>;
  onProgress: (points: number) => void;
  map: L.Map | null;
  frontline: Frontline | null;
  previous: Frontline | null;
  visible: boolean;
  showPrevious: boolean;
  editing: boolean;
  tool: DrawTool | null;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onChange: (shapes: Shape[]) => void;
  onToolDone: () => void;
}

export function FrontlineLayer(p: Props) {
  const shapesRef = useRef<Shape[]>([]);
  shapesRef.current = p.frontline?.shapes ?? [];
  const cb = useRef(p);
  cb.current = p;

  // Dedicated pane keeps the zones under unit markers but above the grid.
  useEffect(() => {
    const map = p.map;
    if (!map) return;
    const pane = map.getPane(PANE) ?? map.createPane(PANE);
    pane.style.zIndex = "450";
  }, [p.map]);

  // Previous snapshot as a faint dashed ghost, to see how the line moved.
  useEffect(() => {
    const map = p.map;
    if (!map || !p.visible || !p.showPrevious || !p.previous) return;
    const group = L.layerGroup().addTo(map);
    for (const s of p.previous.shapes) {
      const opts: L.PolylineOptions = { pane: PANE, interactive: false, color: SHAPE_COLOR[s.kind], weight: 2, dashArray: "3 7", opacity: 0.8, fill: false };
      (s.type === "zone" ? L.polygon(s.points.map(ll), opts) : L.polyline(s.points.map(ll), opts)).addTo(group);
    }
    return () => void group.remove();
  }, [p.map, p.visible, p.showPrevious, p.previous]);

  // Shapes (+ vertex handles for the selected one while editing).
  useEffect(() => {
    const map = p.map;
    if (!map || !p.frontline || !p.visible) return;
    const group = L.layerGroup().addTo(map);
    const interactive = p.editing && !p.tool;
    const shapes = p.frontline.shapes;

    const commit = (id: string, points: Pt[]) =>
      cb.current.onChange(shapesRef.current.map((s) => (s.id === id ? { ...s, points } : s)));

    for (const s of shapes) {
      const selected = s.id === p.selectedId;
      const latlngs = s.points.map(ll);
      const layer =
        s.type === "zone" ? L.polygon(latlngs, pathOptions(s, selected, interactive)) : L.polyline(latlngs, pathOptions(s, selected, interactive));
      if (s.type === "line") {
        // White casing under the line so it reads on any terrain colour.
        L.polyline(latlngs, { pane: PANE, interactive: false, color: "#fff", weight: selected ? 10 : 8, opacity: 0.9 }).addTo(group);
      }
      layer.addTo(group);
      if (s.label) layer.bindTooltip(s.label, { permanent: true, direction: "center", className: "fl-label", pane: "tooltipPane" });
      if (interactive) layer.on("click", () => cb.current.onSelect(s.id));

      if (!(interactive && selected)) continue;

      // Vertex handles: drag to move, right-click to delete, small midpoints to insert.
      const pts: Pt[] = s.points.map((q) => [...q] as Pt);
      const min = MIN_POINTS[s.type];
      const mids: L.Marker[] = [];
      const addMids = () => {
        mids.splice(0).forEach((m) => m.remove());
        const n = s.type === "zone" ? pts.length : pts.length - 1;
        for (let i = 0; i < n; i++) {
          const a = pts[i];
          const b = pts[(i + 1) % pts.length];
          const m = L.marker([(a[1] + b[1]) / 2, (a[0] + b[0]) / 2], { icon: midIcon, pane: "markerPane", zIndexOffset: 500 }).addTo(group);
          m.on("click", (e) => {
            L.DomEvent.stopPropagation(e);
            const next = [...pts.slice(0, i + 1), [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] as Pt, ...pts.slice(i + 1)];
            commit(s.id, next.map((q) => [Math.round(q[0] * 10) / 10, Math.round(q[1] * 10) / 10] as Pt));
          });
          mids.push(m);
        }
      };
      pts.forEach((pt, i) => {
        const m = L.marker(ll(pt), { icon: vertexIcon, draggable: true, pane: "markerPane", zIndexOffset: 600 }).addTo(group);
        m.on("dragstart", () => mids.splice(0).forEach((x) => x.remove()));
        m.on("drag", () => {
          pts[i] = toPt(m.getLatLng());
          layer.setLatLngs(pts.map(ll));
        });
        m.on("dragend", () => commit(s.id, pts));
        m.on("contextmenu", (e) => {
          L.DomEvent.stopPropagation(e);
          if (pts.length > min) commit(s.id, pts.filter((_, j) => j !== i));
        });
      });
      addMids();
    }
    return () => void group.remove();
  }, [p.map, p.frontline, p.visible, p.editing, p.tool, p.selectedId]);

  // Draw tool: click adds points. Finish with double-click, Enter, the HUD button, or (areas) by clicking the first point.
  useEffect(() => {
    const map = p.map;
    const tool = p.tool;
    if (!map || !tool || !p.frontline) return;
    const color = SHAPE_COLOR[tool.kind];
    const min = MIN_POINTS[tool.type];
    const pts: L.LatLng[] = [];
    const dots = L.layerGroup().addTo(map);
    const hint = L.tooltip({ permanent: true, direction: "auto", offset: [16, 0], className: "fl-hint" });
    let preview: L.Polyline | L.Polygon | undefined;
    let cursor: L.LatLng | undefined;

    const hintText = () =>
      pts.length === 0
        ? "Click to place the first point"
        : pts.length < min
          ? `Click to add point ${pts.length + 1} (need at least ${min})`
          : tool.type === "zone"
            ? "Click to add · click the first point, double-click or Enter to finish"
            : "Click to add · double-click or Enter to finish";

    const sync = () => {
      const all = cursor && pts.length ? [...pts, cursor] : pts;
      const style: L.PolylineOptions = { pane: PANE, interactive: false, color, weight: 3, dashArray: "6 6", fillOpacity: 0.15 };
      if (!preview) preview = (tool.type === "zone" ? L.polygon(all, style) : L.polyline(all, style)).addTo(map);
      else preview.setLatLngs(all);
      dots.clearLayers();
      pts.forEach((q, i) => {
        const closable = tool.type === "zone" && i === 0 && pts.length >= min;
        L.circleMarker(q, { pane: PANE, interactive: false, radius: closable ? 9 : 5, color, weight: 3, fillColor: "#fff", fillOpacity: 1 }).addTo(dots);
      });
      if (cursor) hint.setLatLng(cursor).setContent(hintText());
      if (cursor && !map.hasLayer(hint)) hint.addTo(map);
      cb.current.onProgress(pts.length);
    };

    const finish = () => {
      const points = pts.filter((q, i, a) => i === 0 || !q.equals(a[i - 1])).map(toPt);
      if (points.length < min) return; // keep drawing; the HUD says how many are still needed
      const shape: Shape = { id: newId(), type: tool.type, kind: tool.kind, label: "", points };
      cb.current.onChange([...shapesRef.current, shape]);
      cb.current.onSelect(shape.id);
      cb.current.onToolDone();
    };
    const undo = () => {
      pts.pop();
      sync();
    };

    const onClick = (e: L.LeafletMouseEvent) => {
      if (tool.type === "zone" && pts.length >= min && map.latLngToContainerPoint(pts[0]).distanceTo(e.containerPoint) < 14) {
        finish();
        return;
      }
      pts.push(e.latlng);
      cursor = e.latlng;
      sync();
    };
    const onMove = (e: L.LeafletMouseEvent) => {
      cursor = e.latlng;
      sync();
    };
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.matches?.("input, textarea, select")) return;
      if (e.key === "Escape") cb.current.onToolDone();
      else if (e.key === "Enter") finish();
      else if (e.key === "Backspace" || (e.key === "z" && (e.ctrlKey || e.metaKey))) {
        e.preventDefault();
        undo();
      }
    };

    p.controlRef.current = { finish, undo };
    map.doubleClickZoom.disable();
    map.getContainer().style.cursor = "crosshair";
    map.on("click", onClick);
    map.on("mousemove", onMove);
    map.on("dblclick", finish);
    document.addEventListener("keydown", onKey);
    cb.current.onProgress(0);
    return () => {
      p.controlRef.current = null;
      preview?.remove();
      dots.remove();
      hint.remove();
      map.doubleClickZoom.enable();
      map.getContainer().style.cursor = "";
      map.off("click", onClick);
      map.off("mousemove", onMove);
      map.off("dblclick", finish);
      document.removeEventListener("keydown", onKey);
    };
  }, [p.map, p.tool, p.frontline?.id]);

  // Click on empty map clears the shape selection while editing.
  useEffect(() => {
    const map = p.map;
    if (!map || !p.editing || p.tool) return;
    const onClick = () => cb.current.onSelect(null);
    map.on("click", onClick);
    return () => void map.off("click", onClick);
  }, [p.map, p.editing, p.tool]);

  return null;
}

/**
 * Shape under a right-click, if any. Hit-testing is done here (rather than with interactive Leaflet layers) so zones
 * never swallow clicks meant for placing units or measuring.
 */
export function hitTestShape(map: L.Map, shapes: Shape[], at: L.LatLng): Shape | null {
  const px = map.latLngToContainerPoint(at);
  const toPx = (q: Pt) => map.latLngToContainerPoint(ll(q));
  let best: { shape: Shape; score: number } | null = null;
  for (const s of shapes) {
    const pts = s.points.map(toPx);
    let score = Infinity;
    if (s.type === "line") {
      for (let i = 1; i < pts.length; i++) {
        const d = L.LineUtil.pointToSegmentDistance(px, pts[i - 1], pts[i]);
        if (d <= 10) score = Math.min(score, d - 1000); // lines win over areas
      }
    } else if (pointInPolygon(px, pts)) {
      score = areaKm2(s.points); // smallest enclosing area wins
    }
    if (score !== Infinity && (!best || score < best.score)) best = { shape: s, score };
  }
  return best?.shape ?? null;
}

function pointInPolygon(pt: L.Point, poly: L.Point[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > pt.y !== b.y > pt.y && pt.x < ((b.x - a.x) * (pt.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}
