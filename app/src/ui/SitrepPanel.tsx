import { useStore } from "../store";
import { SIDE_LABEL, type Frontline, type Side } from "../types";
import { SIDE_COLOR } from "./common";
import { ReportCard } from "./report";

/** The sides whose Zeus/commanders file reports. */
export const SITREP_SIDES: Side[] = ["friend", "hostile"];

const TEMPLATE = `## Situation
-

## Enemy
-

## Friendly
-

## Losses
-

## Intent / next session
-
`;

const snapName = (f: Frontline) => f.label || new Date(f.taken_at).toLocaleDateString([], { dateStyle: "medium" });

export function SitrepPanel({ front, previous }: { front: Frontline; previous: Frontline | null }) {
  const s = useStore();
  const find = (fid: number, side: Side) => s.sitreps.find((r) => r.frontline_id === fid && r.side === side);
  return (
    <div className="sitrep-panel">
      <small className="hint sitrep-intro">
        Each side's Zeus records where things stand at this snapshot: what happened, losses, and the intent for next session.
      </small>
      {SITREP_SIDES.map((side) => (
        <ReportCard
          key={`${front.id}.${side}`}
          title={SIDE_LABEL[side]}
          color={SIDE_COLOR[side]}
          draftKey={`c2.sitrepDraft.${front.id}.${side}`}
          report={find(front.id, side)}
          onSave={(author, body) => s.saveSitrep(front.id, side, author, body)}
          onDelete={() => void s.deleteSitrep(front.id, side)}
          template={TEMPLATE}
          placeholder="What happened, where things stand, what's next."
          emptyText="No report for this snapshot."
          writeLabel="Write SITREP"
          modalTitle={`SITREP — ${SIDE_LABEL[side]} — ${snapName(front)}`}
          previous={previous ? { label: `Previous: ${snapName(previous)}`, body: find(previous.id, side)?.body } : undefined}
        />
      ))}
    </div>
  );
}
