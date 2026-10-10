export type Side = "friend" | "hostile" | "neutral" | "unknown";
export const SIDES: Side[] = ["friend", "hostile", "neutral", "unknown"];
export const SIDE_LABEL: Record<Side, string> = {
  friend: "Friendly",
  hostile: "Hostile",
  neutral: "Neutral / Civilian",
  unknown: "Unknown",
};

export const VEHICLE_CATEGORIES = ["wheeled", "tracked", "rotary", "fixed-wing", "naval", "static", "other"] as const;
export type VehicleCategory = (typeof VEHICLE_CATEGORIES)[number];

export interface Unit {
  id: number;
  parent_id: number | null;
  side: Side;
  name: string;
  designation: string;
  sidc: string;
  x: number | null;
  y: number | null;
  pers_active: number;
  pers_wounded: number;
  pers_kia: number;
  pers_mia: number;
  notes: string;
  sort: number;
}

export interface VehicleType {
  id: number;
  name: string;
  category: VehicleCategory;
}

export interface UnitVehicle {
  unit_id: number;
  vehicle_type_id: number;
  operational: number;
  damaged: number;
  destroyed: number;
}

export type ShapeKind = "friend" | "hostile" | "contested" | "front";
export type Pt = [x: number, y: number];

/** zones are filled polygons, lines are open polylines (front line). Points are Arma world meters. */
export interface Shape {
  id: string;
  type: "zone" | "line";
  kind: ShapeKind;
  label: string;
  points: Pt[];
}

export interface Frontline {
  id: number;
  label: string;
  taken_at: string; // local date-time, YYYY-MM-DDTHH:mm
  shapes: Shape[];
}

export interface Sitrep {
  frontline_id: number;
  side: Side;
  author: string;
  body: string;
  updated_at: string; // UTC, "YYYY-MM-DD HH:MM:SS"
}

export interface Operation {
  id: number;
  name: string;
  map_id: string;
  created_at: string;
  situation: string;
  situation_author: string;
  situation_updated_at: string | null;
  unit_count: number;
  snapshot_count: number;
}
