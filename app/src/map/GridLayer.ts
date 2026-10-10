import L from "leaflet";
import { WORLD_SIZE } from "./config";

const STEPS = [10, 20, 50, 100, 200, 500, 1000, 2000, 5000];
const MIN_PX = 70; // keep grid lines at least this far apart on screen

/** Canvas grid in Arma meters. Labels are meters/100 (the 3-digit grid numbers Arma shows). */
export class ArmaGrid extends L.Layer {
  private canvas?: HTMLCanvasElement;

  onAdd(map: L.Map): this {
    const canvas = (this.canvas = L.DomUtil.create("canvas", "arma-grid leaflet-zoom-hide") as HTMLCanvasElement);
    canvas.style.pointerEvents = "none";
    map.getPanes().overlayPane.appendChild(canvas);
    map.on("move zoom viewreset resize", this.redraw, this);
    this.redraw();
    return this;
  }

  onRemove(map: L.Map): this {
    map.off("move zoom viewreset resize", this.redraw, this);
    this.canvas?.remove();
    return this;
  }

  private redraw = () => {
    const map = this._map;
    const canvas = this.canvas;
    if (!map || !canvas) return;

    const size = map.getSize();
    const dpr = window.devicePixelRatio || 1;
    L.DomUtil.setPosition(canvas, map.containerPointToLayerPoint([0, 0]));
    canvas.width = size.x * dpr;
    canvas.height = size.y * dpr;
    canvas.style.width = `${size.x}px`;
    canvas.style.height = `${size.y}px`;

    const ctx = canvas.getContext("2d")!;
    ctx.scale(dpr, dpr);

    const bounds = map.getBounds();
    const pxPerMeter = size.x / (bounds.getEast() - bounds.getWest());
    const step = STEPS.find((s) => s * pxPerMeter >= MIN_PX) ?? STEPS[STEPS.length - 1];

    const toPx = (x: number, y: number) => map.latLngToContainerPoint([y, x]);
    const x0 = Math.max(0, Math.floor(bounds.getWest() / step) * step);
    const x1 = Math.min(WORLD_SIZE, bounds.getEast());
    const y0 = Math.max(0, Math.floor(bounds.getSouth() / step) * step);
    const y1 = Math.min(WORLD_SIZE, bounds.getNorth());

    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(0,0,0,0.35)";
    ctx.fillStyle = "rgba(0,0,0,0.85)";
    ctx.font = "11px sans-serif";
    ctx.beginPath();
    for (let x = x0; x <= x1; x += step) {
      const a = toPx(x, 0);
      const b = toPx(x, WORLD_SIZE);
      ctx.moveTo(Math.round(a.x) + 0.5, a.y);
      ctx.lineTo(Math.round(b.x) + 0.5, b.y);
    }
    for (let y = y0; y <= y1; y += step) {
      const a = toPx(0, y);
      const b = toPx(WORLD_SIZE, y);
      ctx.moveTo(a.x, Math.round(a.y) + 0.5);
      ctx.lineTo(b.x, Math.round(b.y) + 0.5);
    }
    ctx.stroke();

    const label = (v: number) => String(Math.floor(v / 100)).padStart(3, "0");
    for (let x = x0; x <= x1; x += step) ctx.fillText(label(x), toPx(x, 0).x + 3, 12);
    for (let y = y0; y <= y1; y += step) ctx.fillText(label(y), 3, toPx(0, y).y - 3);
  };
}
