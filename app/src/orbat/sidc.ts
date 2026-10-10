import ms from "milsymbol";
import type { Side } from "../types";

const SI: Record<Side, string> = { friend: "3", hostile: "6", neutral: "4", unknown: "1" };

export interface SidcParts {
  side: Side;
  symbolSet: string;
  status: string;
  hqtfd: string;
  echelon: string;
  entity: string;
}

/** 20-digit APP-6D/2525D: ver(2) ctx(1) SI(1) set(2) status(1) HQTFD(1) echelon(2) entity(6) mod1(2) mod2(2). */
export function buildSidc(p: SidcParts): string {
  return `100${SI[p.side]}${p.symbolSet}${p.status}${p.hqtfd}${p.echelon}${p.entity}0000`;
}

export function parseSidc(sidc: string): Omit<SidcParts, "side"> {
  return {
    symbolSet: sidc.substring(4, 6),
    status: sidc.substring(6, 7),
    hqtfd: sidc.substring(7, 8),
    echelon: sidc.substring(8, 10),
    entity: sidc.substring(10, 16),
  };
}

export const isValidSidc = (s: string) => /^\d{20}$/.test(s);

export function withSide(sidc: string, side: Side): string {
  return sidc.substring(0, 3) + SI[side] + sidc.substring(4);
}

export function defaultSidc(side: Side) {
  return buildSidc({ side, symbolSet: "10", status: "0", hqtfd: "0", echelon: "15", entity: "121100" });
}

const cache = new Map<string, ReturnType<typeof render>>();

function render(sidc: string, size: number, designation: string) {
  const sym = new ms.Symbol(sidc, { size, uniqueDesignation: designation, outlineWidth: 3, outlineColor: "#ffffff" });
  const { width, height } = sym.getSize();
  const anchor = sym.getAnchor();
  return { uri: sym.toDataURL(), width, height, anchor };
}

/** Data-URI image of a symbol plus size and anchor, so Leaflet markers can sit centred on the frame. */
export function symbolImage(sidc: string, opts: { size?: number; designation?: string } = {}) {
  const size = opts.size ?? 30;
  const designation = opts.designation ?? "";
  const key = `${sidc}|${size}|${designation}`;
  let hit = cache.get(key);
  if (!hit) {
    hit = render(sidc, size, designation);
    cache.set(key, hit);
  }
  return hit;
}
