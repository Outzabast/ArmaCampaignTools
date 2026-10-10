import { useState } from "react";
import { useOperation } from "../opContext";
import { ReportCard } from "./report";

const TEMPLATE = `## Background
- 

## Friendly forces
- 

## Enemy forces
- 

## Civilians / neutrals
- 

## Objectives
- 

## Special rules / ROE
- 
`;

/** Operation-level situation: the back story and standing context every snapshot builds on. */
export function SituationPanel() {
  const { operation: op, saveSituation } = useOperation();
  const [error, setError] = useState<string | null>(null);

  const save = async (author: string, body: string) => {
    try {
      await saveSituation(author, body);
      setError(null);
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    }
  };

  return (
    <div className="sitrep-panel">
      <small className="hint sitrep-intro">
        The back story for this operation: how we got here, who is involved and what each side is trying to achieve.
        Day-by-day updates go in the SITREPs on each frontline snapshot.
      </small>
      {error && <div className="error" onClick={() => setError(null)}>{error} <small>(click to dismiss)</small></div>}
      <ReportCard
        title="Operation situation"
        color="var(--accent)"
        draftKey={`c2.situationDraft.${op.id}`}
        report={op.situation ? { author: op.situation_author, body: op.situation, updated_at: op.situation_updated_at ?? "" } : undefined}
        onSave={save}
        onDelete={() => void save("", "")}
        template={TEMPLATE}
        placeholder="Background, forces, objectives, special rules."
        emptyText="No situation written yet."
        writeLabel="Write situation"
        modalTitle={`Situation — ${op.name}`}
      />
    </div>
  );
}
