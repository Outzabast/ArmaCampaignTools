import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { MenuItem } from "./common";

interface Props {
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
}

/** Right-click menu. Positioned in map-container pixels and flipped so it never runs off the edge. */
export function ContextMenu({ x, y, items, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });

  useLayoutEffect(() => {
    const el = ref.current;
    const parent = el?.parentElement;
    if (!el || !parent) return;
    const { width, height } = el.getBoundingClientRect();
    setPos({
      left: x + width > parent.clientWidth ? Math.max(0, x - width) : x,
      top: y + height > parent.clientHeight ? Math.max(0, y - height) : y,
    });
  }, [x, y, items]);

  useEffect(() => {
    const away = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && onClose();
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("mousedown", away, true);
    document.addEventListener("keydown", key);
    window.addEventListener("wheel", onClose, { passive: true });
    return () => {
      document.removeEventListener("mousedown", away, true);
      document.removeEventListener("keydown", key);
      window.removeEventListener("wheel", onClose);
    };
  }, [onClose]);

  return (
    <div ref={ref} className="ctx-menu" style={pos} onContextMenu={(e) => e.preventDefault()}>
      {items.map((it, i) =>
        "header" in it ? (
          <div key={i} className="hdr">{it.header}</div>
        ) : "separator" in it ? (
          <div key={i} className="sep" />
        ) : (
          <button
            key={i}
            className={it.danger ? "danger" : ""}
            disabled={it.disabled}
            onClick={() => {
              onClose();
              it.onClick();
            }}
          >
            {it.label}
          </button>
        ),
      )}
    </div>
  );
}
