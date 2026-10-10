import { useEffect, useRef } from "react";
import L from "leaflet";
import { useStore } from "../store";
import { symbolImage, defaultSidc } from "../orbat/sidc";
import { useUi } from "../ui/common";
import type { Side, Unit } from "../types";

const MAP_SYMBOL_SIZE = 28;

function escapeHtml(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

function makeIcon(u: Unit, selected: boolean) {
  const img = symbolImage(u.sidc, { size: MAP_SYMBOL_SIZE });
  return L.divIcon({
    className: `unit-marker${selected ? " selected" : ""}`,
    iconSize: [img.width, img.height],
    iconAnchor: [img.anchor.x, img.anchor.y],
    html: `<img src="${img.uri}" width="${img.width}" height="${img.height}" draggable="false"><span class="unit-label">${escapeHtml(u.name)}</span>`,
  });
}

/** Draws every unit that has a map position as a draggable NATO marker. */
export function UnitLayer({ map, visibleSides }: { map: L.Map | null; visibleSides: Set<Side> }) {
  const store = useStore();
  const ui = useUi();
  const { units, selectedId, select, openOrbat, updateUnit } = store;
  const markers = useRef(new Map<number, L.Marker>());
  const signature = useRef(new Map<number, string>());
  // Handlers read the latest callbacks without forcing markers to be rebuilt.
  const openMenu = (id: number, e: L.LeafletMouseEvent) => {
    const u = store.units.find((x) => x.id === id);
    if (!u) return;
    const kids = store.tree.children.get(id)?.length ?? 0;
    select(id);
    ui.openMenu(
      [
        { header: u.name },
        { label: "Edit details", onClick: () => ui.showTab("orbat") },
        { label: "View ORBAT", onClick: () => openOrbat(id) },
        { label: "Add subordinate", onClick: async () => {
            const c = await store.createUnit({ side: u.side, parent_id: id, name: "New subordinate", sidc: defaultSidc(u.side) });
            if (c) {
              select(c.id);
              ui.showTab("orbat");
            }
          } },
        { separator: true },
        { label: "Move to another position…", onClick: () => ui.setPlacing({ kind: "existing", unitId: id }) },
        { label: "Remove from map", onClick: () => updateUnit(id, { x: null, y: null }) },
        { separator: true },
        { label: "Delete unit…", danger: true, onClick: () => confirm(kids ? `Delete "${u.name}" and its ${kids} subordinate unit(s)?` : `Delete "${u.name}"?`) && store.deleteUnit(id) },
      ],
      { x: e.containerPoint.x, y: e.containerPoint.y },
    );
  };
  const cb = useRef({ select, openOrbat, updateUnit, openMenu });
  cb.current = { select, openOrbat, updateUnit, openMenu };

  useEffect(() => {
    if (!map) return;
    const live = new Set<number>();
    for (const u of units) {
      if (u.x === null || u.y === null || !visibleSides.has(u.side)) continue;
      live.add(u.id);
      const selected = u.id === selectedId;
      const sig = `${u.sidc}|${u.name}|${selected}`;
      let m = markers.current.get(u.id);
      if (!m) {
        m = L.marker([u.y, u.x], { icon: makeIcon(u, selected), draggable: true, riseOnHover: true }).addTo(map);
        m.on("click", () => cb.current.select(u.id));
        m.on("dblclick", () => {
          cb.current.select(u.id);
          cb.current.openOrbat(u.id);
        });
        m.on("contextmenu", (e) => cb.current.openMenu(u.id, e));
        m.on("dragend", () => {
          const ll = m!.getLatLng();
          cb.current.updateUnit(u.id, { x: Math.round(ll.lng * 10) / 10, y: Math.round(ll.lat * 10) / 10 });
        });
        markers.current.set(u.id, m);
        signature.current.set(u.id, sig);
      } else {
        if (signature.current.get(u.id) !== sig) {
          m.setIcon(makeIcon(u, selected));
          signature.current.set(u.id, sig);
        }
        const ll = m.getLatLng();
        if (ll.lng !== u.x || ll.lat !== u.y) m.setLatLng([u.y, u.x]);
      }
      m.setZIndexOffset(selected ? 1000 : 0);
    }
    for (const [id, m] of markers.current) {
      if (!live.has(id)) {
        m.remove();
        markers.current.delete(id);
        signature.current.delete(id);
      }
    }
  }, [map, units, selectedId, visibleSides]);

  useEffect(
    () => () => {
      for (const m of markers.current.values()) m.remove();
      markers.current.clear();
    },
    [],
  );

  return null;
}
