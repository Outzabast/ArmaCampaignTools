import L from "leaflet";
import { FACTOR, WORLD_TOP } from "./config";

// Leaflet's "lat" is Arma Y (north) and "lng" is Arma X (east). Pixel y grows downward, tile row 0 is north.
export const ArmaCRS: L.CRS = L.Util.extend({}, L.CRS.Simple, {
  transformation: new L.Transformation(FACTOR, 0, -FACTOR, FACTOR * WORLD_TOP),
});

export const toLatLng = (x: number, y: number) => L.latLng(y, x);
export const fromLatLng = (ll: L.LatLng) => ({ x: ll.lng, y: ll.lat });

/** Grid azimuth in degrees (0 = north, clockwise) from a to b. */
export function azimuth(a: L.LatLng, b: L.LatLng): number {
  const deg = (Math.atan2(b.lng - a.lng, b.lat - a.lat) * 180) / Math.PI;
  return (deg + 360) % 360;
}

export const distance = (a: L.LatLng, b: L.LatLng) => Math.hypot(b.lng - a.lng, b.lat - a.lat);

export function formatDistance(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${Math.round(m)} m`;
}

export function formatAzimuth(deg: number): string {
  const mils = Math.round((deg * 6400) / 360) % 6400;
  return `${deg.toFixed(1)}° / ${mils} mil`;
}
