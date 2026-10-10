// Dev helper: renders every catalog entry so the SIDC -> symbol mapping can be eyeballed.
import ms from "milsymbol";
import fs from "node:fs";
import { SYMBOL_SETS } from "../src/orbat/catalog.ts";

let html = "<body style='font:11px sans-serif;display:flex;flex-wrap:wrap;width:1500px'>";
for (const s of SYMBOL_SETS) {
  for (const [code, label] of s.entities) {
    const ech = s.code === "10" ? "15" : "00";
    const sidc = `1003${s.code}00${ech}${code}0000`;
    html += `<div style='width:140px;height:92px;text-align:center'>${new ms.Symbol(sidc, { size: 34 }).asSVG()}<br>${s.code}-${code}<br>${label}</div>`;
  }
}
fs.writeFileSync(process.argv[2], html);
