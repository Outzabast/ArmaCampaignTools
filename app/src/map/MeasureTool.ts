import L from "leaflet";
import { azimuth, distance, formatAzimuth, formatDistance } from "./crs";

export type MeasureMode = "off" | "path" | "bearing";

const LIVE_STYLE: L.PolylineOptions = { color: "#ff3b30", weight: 3, dashArray: "6 6" };
const DONE_STYLE: L.PolylineOptions = { color: "#ff3b30", weight: 3 };
const DRAG_PX = 4;

/**
 * Two tools on one engine:
 *  - "path": click to add vertices; live distance to the cursor plus running total.
 *    Double-click / right-click finishes, Esc cancels.
 *  - "bearing": click A then click B, or press-drag from A and release on B.
 *    Shows distance and azimuth (degrees and NATO mils) while moving and on the locked line.
 * Finished measurements stay on the map until clear().
 */
export class MeasureTool {
  private group = L.layerGroup();
  private points: L.LatLng[] = [];
  private live?: L.Polyline;
  private liveTip?: L.Tooltip;
  private mode: MeasureMode = "off";
  private downAt?: L.LatLng;
  private downPx?: L.Point;
  private dragged = false;

  constructor(private map: L.Map) {
    this.group.addTo(map);
  }

  /** `seed` starts the first measurement from that point (used by the right-click menu). */
  setMode(mode: MeasureMode, seed?: L.LatLng) {
    this.cancelCurrent();
    this.mode = mode;
    const m = this.map;
    m.getContainer().style.cursor = mode === "off" ? "" : "crosshair";
    m.off("click", this.onClick, this);
    m.off("mousedown", this.onDown, this);
    m.off("mouseup", this.onUp, this);
    m.off("mousemove", this.onMove, this);
    m.off("dblclick", this.onFinish, this);
    m.off("contextmenu", this.onFinish, this);
    document.removeEventListener("keydown", this.onKey);
    if (mode === "off") {
      m.doubleClickZoom.enable();
      return;
    }
    m.doubleClickZoom.disable();
    m.on("click", this.onClick, this);
    m.on("mousemove", this.onMove, this);
    m.on("dblclick", this.onFinish, this);
    m.on("contextmenu", this.onFinish, this);
    if (mode === "bearing") {
      m.on("mousedown", this.onDown, this);
      m.on("mouseup", this.onUp, this);
    }
    document.addEventListener("keydown", this.onKey);
    if (seed) this.points = [seed];
  }

  get active() {
    return this.mode !== "off";
  }

  clear() {
    this.cancelCurrent();
    this.group.clearLayers();
  }

  private onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") this.cancelCurrent();
  };

  private cancelCurrent() {
    this.live?.remove();
    this.liveTip?.remove();
    this.live = this.liveTip = undefined;
    this.points = [];
    this.downAt = this.downPx = undefined;
    this.dragged = false;
    this.map.dragging.enable();
  }

  // Bearing mode: pressing with no start point yet begins a potential drag; the map must not pan.
  private onDown(e: L.LeafletMouseEvent) {
    if (this.points.length === 0) {
      this.downAt = e.latlng;
      this.downPx = e.containerPoint;
      this.map.dragging.disable();
    }
  }

  private onUp(e: L.LeafletMouseEvent) {
    this.map.dragging.enable();
    if (this.downAt && this.dragged) {
      this.points = [this.downAt];
      this.lockBearing(e.latlng);
    }
    this.downAt = this.downPx = undefined;
    // `dragged` is cleared by the click event that follows mouseup, so that click is ignored.
  }

  private onClick(e: L.LeafletMouseEvent) {
    if (this.dragged) {
      this.dragged = false;
      return;
    }
    if (this.mode === "path") {
      this.points.push(e.latlng);
      this.updateLive(e.latlng);
    } else if (this.points.length === 0) {
      this.points = [e.latlng];
    } else {
      this.lockBearing(e.latlng);
    }
  }

  private onMove(e: L.LeafletMouseEvent) {
    if (this.downAt && this.downPx && !this.dragged && this.downPx.distanceTo(e.containerPoint) > DRAG_PX) {
      this.dragged = true;
      this.points = [this.downAt];
    }
    if (this.points.length) this.updateLive(e.latlng);
  }

  // Right-click / double-click: finish a path, or abandon a half-made bearing.
  private onFinish() {
    if (this.mode === "bearing") {
      this.cancelCurrent();
      return;
    }
    if (this.mode !== "path") return;
    // dblclick delivers two clicks first, which can leave a duplicate vertex.
    const pts = this.points.filter((p, i, a) => i === 0 || !p.equals(a[i - 1]));
    if (pts.length < 2) {
      this.cancelCurrent();
      return;
    }
    this.live?.remove();
    this.liveTip?.remove();
    this.live = this.liveTip = undefined;
    this.points = [];
    L.polyline(pts, DONE_STYLE)
      .bindTooltip(this.pathText(pts), { permanent: true, direction: "right", className: "measure-tip" })
      .addTo(this.group);
  }

  private lockBearing(to: L.LatLng) {
    const a = this.points[0];
    this.live?.remove();
    this.liveTip?.remove();
    this.live = this.liveTip = undefined;
    this.points = [];
    L.polyline([a, to], DONE_STYLE)
      .bindTooltip(this.bearingText(a, to), { permanent: true, direction: "center", className: "measure-tip" })
      .addTo(this.group);
  }

  private updateLive(cursor: L.LatLng) {
    const pts = [...this.points, cursor];
    if (this.live) this.live.setLatLngs(pts);
    else this.live = L.polyline(pts, LIVE_STYLE).addTo(this.map);
    const last = this.points[this.points.length - 1];
    const html = this.mode === "bearing" ? this.bearingText(last, cursor) : this.pathText(this.points, cursor);
    if (this.liveTip) this.liveTip.setLatLng(cursor).setContent(html);
    else {
      this.liveTip = L.tooltip({ permanent: true, direction: "right", className: "measure-tip", offset: [14, 0] })
        .setLatLng(cursor)
        .setContent(html)
        .addTo(this.map);
    }
  }

  private bearingText(a: L.LatLng, b: L.LatLng) {
    return `<b>${formatDistance(distance(a, b))}</b><br>${formatAzimuth(azimuth(a, b))}`;
  }

  private pathText(pts: L.LatLng[], cursor?: L.LatLng) {
    const all = cursor ? [...pts, cursor] : pts;
    let total = 0;
    for (let i = 1; i < all.length; i++) total += distance(all[i - 1], all[i]);
    const prev = all[all.length - 2];
    const last = all[all.length - 1];
    const leg = prev ? `<br>${formatAzimuth(azimuth(prev, last))} (last leg)` : "";
    return `<b>${formatDistance(total)}</b>${leg}`;
  }
}
