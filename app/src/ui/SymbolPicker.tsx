import { useMemo, useState } from "react";
import { ECHELONS, HQTFD, STATUS, SYMBOL_SETS } from "../orbat/catalog";
import { buildSidc, isValidSidc, parseSidc, withSide } from "../orbat/sidc";
import type { Side } from "../types";
import { Modal, SymbolImg } from "./common";

interface Props {
  side: Side;
  sidc: string;
  onSave: (sidc: string) => void;
  onClose: () => void;
}

export function SymbolPicker({ side, sidc, onSave, onClose }: Props) {
  const initial = parseSidc(sidc);
  const knownSet = SYMBOL_SETS.find((s) => s.code === initial.symbolSet);
  const knownEntity = knownSet?.entities.some(([c]) => c === initial.entity);

  const [raw, setRaw] = useState(!knownSet || !knownEntity);
  const [rawText, setRawText] = useState(sidc);
  const [symbolSet, setSymbolSet] = useState(knownSet?.code ?? "10");
  const [entity, setEntity] = useState(initial.entity);
  const [echelon, setEchelon] = useState(initial.echelon);
  const [hqtfd, setHqtfd] = useState(initial.hqtfd);
  const [status, setStatus] = useState(initial.status);

  const set = SYMBOL_SETS.find((s) => s.code === symbolSet)!;
  const result = useMemo(
    () => (raw ? withSide(rawText, side) : buildSidc({ side, symbolSet, status, hqtfd, echelon: symbolSet === "10" ? echelon : "00", entity })),
    [raw, rawText, side, symbolSet, status, hqtfd, echelon, entity],
  );
  const valid = isValidSidc(result);

  const changeSet = (code: string) => {
    setSymbolSet(code);
    setEntity(SYMBOL_SETS.find((s) => s.code === code)!.entities[0][0]);
  };

  return (
    <Modal title="Unit symbol" onClose={onClose}>
      <div className="picker">
        <div className="picker-preview">
          {valid ? <SymbolImg sidc={result} size={64} /> : <span className="sym-bad">Invalid SIDC</span>}
          <code>{result}</code>
        </div>

        <div className="seg">
          <button className={!raw ? "active" : ""} onClick={() => setRaw(false)}>Builder</button>
          <button className={raw ? "active" : ""} onClick={() => { setRawText(result); setRaw(true); }}>Raw SIDC</button>
        </div>

        {raw ? (
          <label>
            20-digit SIDC (APP-6D / 2525D) — e.g. paste from the Unit Generator
            <input value={rawText} onChange={(e) => setRawText(e.target.value.trim())} maxLength={20} />
            <small>The affiliation digit is overwritten to match the unit's side.</small>
          </label>
        ) : (
          <>
            <label>
              Category
              <select value={symbolSet} onChange={(e) => changeSet(e.target.value)}>
                {SYMBOL_SETS.map((s) => <option key={s.code} value={s.code}>{s.label}</option>)}
              </select>
            </label>
            <label>
              Type
              <select value={entity} onChange={(e) => setEntity(e.target.value)}>
                {!set.entities.some(([c]) => c === entity) && <option value={entity}>Current ({entity})</option>}
                {set.entities.map(([c, l]) => <option key={c} value={c}>{l}</option>)}
              </select>
            </label>
            {symbolSet === "10" && (
              <label>
                Size
                <select value={echelon} onChange={(e) => setEchelon(e.target.value)}>
                  {ECHELONS.map(([c, l]) => <option key={c} value={c}>{l}</option>)}
                </select>
              </label>
            )}
            <div className="row2">
              <label>
                Modifier
                <select value={hqtfd} onChange={(e) => setHqtfd(e.target.value)}>
                  {HQTFD.map(([c, l]) => <option key={c} value={c}>{l}</option>)}
                </select>
              </label>
              <label>
                Status
                <select value={status} onChange={(e) => setStatus(e.target.value)}>
                  {STATUS.map(([c, l]) => <option key={c} value={c}>{l}</option>)}
                </select>
              </label>
            </div>
          </>
        )}

        <div className="modal-actions">
          <button onClick={onClose}>Cancel</button>
          <button className="primary" disabled={!valid} onClick={() => { onSave(result); onClose(); }}>Use symbol</button>
        </div>
      </div>
    </Modal>
  );
}
