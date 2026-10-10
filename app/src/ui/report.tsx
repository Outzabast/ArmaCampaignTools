import { Fragment, useRef, useState, type ReactNode } from "react";
import { Modal } from "./common";

/** Shared pieces for free-text reports (snapshot SITREPs, the operation situation): light formatting, an editor
 *  with a few helpers, and a view/edit card with locally kept drafts. */

export interface ReportValue {
  author: string;
  body: string;
  updated_at: string; // UTC, "YYYY-MM-DD HH:MM:SS"
}

const fmtUpdated = (utc: string) => {
  const d = new Date(utc.replace(" ", "T") + "Z");
  return isNaN(d.getTime()) ? utc : d.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
};

// ---- light formatting: "#"/"##" headings, "-"/"*" and "1." lists, **bold**, *italic* ----

function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|\*[^*\s][^*]*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") && part.length > 4 ? <b key={i}>{part.slice(2, -2)}</b>
    : part.startsWith("*") && part.endsWith("*") && part.length > 2 ? <i key={i}>{part.slice(1, -1)}</i>
    : <Fragment key={i}>{part}</Fragment>,
  );
}

export function ReportText({ body }: { body: string }) {
  const out: ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let para: string[] = [];
  const flush = () => {
    if (para.length) out.push(<p key={out.length}>{para.map((l, i) => <Fragment key={i}>{i > 0 && <br />}{inline(l)}</Fragment>)}</p>);
    para = [];
    if (list) {
      const items = list.items.map((it, i) => <li key={i}>{inline(it)}</li>);
      out.push(list.ordered ? <ol key={out.length}>{items}</ol> : <ul key={out.length}>{items}</ul>);
    }
    list = null;
  };
  for (const raw of body.split("\n")) {
    const line = raw.trimEnd();
    const h = line.match(/^(#{1,3})\s+(.*)$/);
    const bullet = line.match(/^\s*[-*]\s+(.*)$/);
    const num = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (h) {
      flush();
      out.push(h[1].length === 1 ? <h3 key={out.length}>{inline(h[2])}</h3> : <h4 key={out.length}>{inline(h[2])}</h4>);
    } else if (bullet || num) {
      const ordered = !!num;
      if (para.length || (list && list.ordered !== ordered)) flush();
      list ??= { ordered, items: [] };
      list.items.push((bullet ?? num)![1]);
    } else if (!line.trim()) {
      flush();
    } else {
      if (list) flush();
      para.push(line);
    }
  }
  flush();
  return <div className="sitrep-text">{out}</div>;
}

// ---- editor ----

/** Unsaved drafts survive switching snapshots/tabs or reloading the page until saved or discarded. */
const readDraft = (key: string): { author: string; body: string } | null => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};
const writeDraft = (key: string, d: { author: string; body: string } | null) => {
  try {
    if (d) localStorage.setItem(key, JSON.stringify(d));
    else localStorage.removeItem(key);
  } catch {
    /* storage unavailable: draft just isn't kept */
  }
};

interface EditorProps {
  author: string;
  body: string;
  onChange: (d: { author: string; body: string }) => void;
  template: string;
  placeholder: string;
  previousBody?: string;
  tall?: boolean;
}

function Editor({ author, body, onChange, template, placeholder, previousBody, tall }: EditorProps) {
  const ta = useRef<HTMLTextAreaElement>(null);
  const [preview, setPreview] = useState(false);

  // Applies an edit to the selected lines (or wraps the selection) and keeps the caret sensible.
  const edit = (fn: (text: string, start: number, end: number) => { text: string; start: number; end: number }) => {
    const el = ta.current;
    if (!el) return;
    const r = fn(body, el.selectionStart, el.selectionEnd);
    onChange({ author, body: r.text });
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(r.start, r.end);
    });
  };
  const prefixLines = (prefix: string) =>
    edit((t, s, e) => {
      const ls = t.lastIndexOf("\n", s - 1) + 1;
      const block = t.slice(ls, e);
      const lines = block.split("\n");
      const on = lines.every((l) => l.startsWith(prefix));
      const next = lines.map((l) => (on ? l.slice(prefix.length) : prefix + l)).join("\n");
      return { text: t.slice(0, ls) + next + t.slice(e), start: ls, end: ls + next.length };
    });
  const wrap = (mark: string) =>
    edit((t, s, e) => {
      const sel = t.slice(s, e) || "text";
      return { text: t.slice(0, s) + mark + sel + mark + t.slice(e), start: s + mark.length, end: s + mark.length + sel.length };
    });

  return (
    <div className="sitrep-editor">
      <label>Written by <input value={author} placeholder="Zeus / callsign" onChange={(e) => onChange({ author: e.target.value, body })} /></label>
      <div className="sitrep-tools">
        <button title="Heading" disabled={preview} onClick={() => prefixLines("## ")}>H</button>
        <button title="Bold" disabled={preview} onClick={() => wrap("**")}><b>B</b></button>
        <button title="Italic" disabled={preview} onClick={() => wrap("*")}><i>I</i></button>
        <button title="Bullet list" disabled={preview} onClick={() => prefixLines("- ")}>• List</button>
        <span className="grow" />
        <button
          title="Insert the standard headings"
          disabled={preview}
          onClick={() => onChange({ author, body: body.trim() ? `${body.trimEnd()}\n\n${template}` : template })}
        >
          Template
        </button>
        {previousBody && (
          <button title="Start from the previous snapshot's report" disabled={preview} onClick={() => onChange({ author, body: previousBody })}>
            Copy previous
          </button>
        )}
        <button className={preview ? "active" : ""} onClick={() => setPreview(!preview)}>{preview ? "Edit" : "Preview"}</button>
      </div>
      {preview ? (
        body.trim() ? <ReportText body={body} /> : <div className="empty-note">Nothing written yet.</div>
      ) : (
        <textarea
          ref={ta}
          value={body}
          rows={tall ? 24 : 12}
          placeholder={`${placeholder}\nUse Template for standard headings.`}
          onChange={(e) => onChange({ author, body: e.target.value })}
          onKeyDown={(e) => {
            // Enter inside a list continues it.
            if (e.key !== "Enter" || e.shiftKey) return;
            const el = e.currentTarget;
            const ls = body.lastIndexOf("\n", el.selectionStart - 1) + 1;
            const m = body.slice(ls, el.selectionStart).match(/^(\s*[-*]\s+)(.*)$/);
            if (!m) return;
            e.preventDefault();
            if (!m[2].trim()) {
              // Empty bullet: end the list.
              edit((t, s) => ({ text: t.slice(0, ls) + t.slice(s), start: ls, end: ls }));
            } else {
              edit((t, s, en) => ({ text: t.slice(0, s) + "\n" + m[1] + t.slice(en), start: s + 1 + m[1].length, end: s + 1 + m[1].length }));
            }
          }}
        />
      )}
      <small className="hint">## heading · - bullet · **bold** · *italic*</small>
    </div>
  );
}

// ---- view / edit card ----

export interface ReportCardProps {
  title: ReactNode;
  /** Left accent colour of the header. */
  color: string;
  /** localStorage key for the unsaved draft; must be unique per document. */
  draftKey: string;
  report?: ReportValue;
  /** Resolves true once saved; an empty body clears the report. */
  onSave: (author: string, body: string) => Promise<boolean>;
  onDelete: () => void;
  template: string;
  placeholder: string;
  emptyText: string;
  writeLabel: string;
  modalTitle: string;
  /** An earlier version to look back at / start from. */
  previous?: { label: string; body?: string };
}

export function ReportCard(p: ReportCardProps) {
  const { report, previous } = p;
  const [draft, setDraftRaw] = useState(() => readDraft(p.draftKey));
  const [expanded, setExpanded] = useState(false);
  const [showPrev, setShowPrev] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  const setDraft = (d: { author: string; body: string } | null) => {
    setDraftRaw(d);
    writeDraft(p.draftKey, d);
  };
  const editing = draft !== null;
  const dirty = editing && (draft.body !== (report?.body ?? "") || draft.author.trim() !== (report?.author ?? ""));

  const startEdit = () => setDraft({ author: report?.author ?? "", body: report?.body ?? "" });
  const save = async () => {
    if (!draft) return;
    setSaving(true);
    const ok = await p.onSave(draft.author, draft.body);
    setSaving(false);
    if (ok) {
      setDraft(null);
      setExpanded(false);
    }
  };

  const content = (
    <>
      {editing ? (
        <>
          <Editor
            author={draft.author}
            body={draft.body}
            onChange={setDraft}
            template={p.template}
            placeholder={p.placeholder}
            previousBody={previous?.body}
            tall={expanded}
          />
          <div className="btnrow">
            <button className="primary" disabled={saving || !dirty} onClick={save}>{saving ? "Saving…" : draft.body.trim() || !report ? "Save" : "Save (clears it)"}</button>
            <button onClick={() => setDraft(null)}>{dirty ? "Discard changes" : "Close"}</button>
          </div>
        </>
      ) : report ? (
        <>
          <ReportText body={report.body} />
          <div className="btnrow">
            <button onClick={startEdit}>Edit</button>
            {confirmClear ? (
              <>
                <button className="danger-btn" onClick={() => { setConfirmClear(false); p.onDelete(); }}>Yes, delete</button>
                <button onClick={() => setConfirmClear(false)}>Keep</button>
              </>
            ) : (
              <button onClick={() => setConfirmClear(true)}>Delete</button>
            )}
          </div>
        </>
      ) : (
        <div className="sitrep-none">
          <span className="muted">{p.emptyText}</span>
          <button className="primary" onClick={startEdit}>{p.writeLabel}</button>
        </div>
      )}

      {previous && !editing && (
        <div className="sitrep-prev">
          <button className="linkish" onClick={() => setShowPrev(!showPrev)}>
            {showPrev ? "▾" : "▸"} {previous.label}{previous.body ? "" : " (none)"}
          </button>
          {showPrev && previous.body && <ReportText body={previous.body} />}
        </div>
      )}
    </>
  );

  return (
    <section className="sitrep-card">
      <header style={{ borderLeftColor: p.color }}>
        <b>{p.title}</b>
        <small className="grow">
          {report ? <>{report.author && <>{report.author} · </>}updated {fmtUpdated(report.updated_at)}</> : ""}
          {editing && dirty && <span className="warn"> · unsaved draft</span>}
        </small>
        {!expanded && (report || editing) && <button className="x" title="Open in a larger window" onClick={() => setExpanded(true)}>⤢</button>}
      </header>
      {expanded ? (
        <>
          <div className="empty-note">Open in the larger window.</div>
          <Modal wide title={p.modalTitle} onClose={() => setExpanded(false)}>
            <div className="sitrep-modal">{content}</div>
          </Modal>
        </>
      ) : (
        <div className="sitrep-body">{content}</div>
      )}
    </section>
  );
}
