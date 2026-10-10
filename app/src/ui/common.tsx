import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { symbolImage } from "../orbat/sidc";
import type { Side } from "../types";

export const SIDE_COLOR: Record<Side, string> = {
  friend: "#4aa8e8",
  hostile: "#e5534b",
  neutral: "#4cbf6b",
  unknown: "#e8c74a",
};

export type Placing = { kind: "new"; side: Side } | { kind: "existing"; unitId: number } | null;

export type Tab = "situation" | "orbat" | "vehicles" | "frontline";

export type MenuItem =
  | { header: string }
  | { separator: true }
  | { label: string; onClick: () => void; danger?: boolean; disabled?: boolean };

interface Ui {
  /** Opens the right-click menu at a map-container pixel position. */
  openMenu: (items: MenuItem[], at: { x: number; y: number }) => void;
  showTab: (t: Tab) => void;
  placing: Placing;
  setPlacing: (p: Placing) => void;
  center: (unitId: number) => void;
  visibleSides: Set<Side>;
  toggleSide: (s: Side) => void;
}
export const UiCtx = createContext<Ui | null>(null);
export const useUi = () => useContext(UiCtx)!;

export function SymbolImg({ sidc, size = 24 }: { sidc: string; size?: number }) {
  try {
    const img = symbolImage(sidc, { size });
    return <img className="sym" src={img.uri} width={img.width} height={img.height} alt="" draggable={false} />;
  } catch {
    return <span className="sym-bad">?</span>;
  }
}

export function Modal({ title, onClose, wide, children }: { title: string; onClose: () => void; wide?: boolean; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal${wide ? " wide" : ""}`}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

/** Integer stepper. Typing commits on blur/Enter, the buttons commit immediately. */
export function Counter({ label, value, onChange, tone }: { label: string; value: number; onChange: (v: number) => void; tone?: string }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = (raw: string) => {
    const n = Math.max(0, Math.floor(Number(raw)));
    if (Number.isFinite(n) && n !== value) onChange(n);
    else setDraft(String(value));
  };
  return (
    <label className={`counter ${tone ?? ""}`}>
      <span>{label}</span>
      <div>
        <button type="button" onClick={() => value > 0 && onChange(value - 1)}>−</button>
        <input
          value={draft}
          inputMode="numeric"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => commit(draft)}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        />
        <button type="button" onClick={() => onChange(value + 1)}>+</button>
      </div>
    </label>
  );
}

/** Text input that saves on blur / Enter rather than on every keystroke. */
export function TextField({ value, onCommit, placeholder, multiline }: { value: string; onCommit: (v: string) => void; placeholder?: string; multiline?: boolean }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => draft !== value && onCommit(draft);
  return multiline ? (
    <textarea value={draft} placeholder={placeholder} rows={3} onChange={(e) => setDraft(e.target.value)} onBlur={commit} />
  ) : (
    <input
      value={draft}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
    />
  );
}
