import { useStore } from "../store";
import { SIDE_LABEL } from "../types";

/** "Blank unit" or one of the saved templates; `null` means blank. */
export function TemplateSelect({ value, onChange }: { value: number | null; onChange: (id: number | null) => void }) {
  const { templates } = useStore();
  if (templates.length === 0) return null;
  return (
    <select
      className="template-select"
      title="Create new units from a saved template"
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
    >
      <option value="">Blank unit</option>
      {templates.map((t) => (
        <option key={t.id} value={t.id}>{t.name} ({t.unit_count} unit{t.unit_count === 1 ? "" : "s"})</option>
      ))}
    </select>
  );
}

export function TemplateList() {
  const s = useStore();
  if (s.templates.length === 0) return null;
  return (
    <section className="side-group templates">
      <header><b>Templates</b> <small>shared by all operations</small></header>
      <ul>
        {s.templates.map((t) => (
          <li key={t.id}>
            <span className="grow">{t.name}</span>
            <small>{t.unit_count} unit{t.unit_count === 1 ? "" : "s"} · saved from {SIDE_LABEL[t.side]}</small>
            <button
              title="Rename template"
              onClick={() => {
                const name = prompt("Template name", t.name);
                if (name?.trim()) s.renameTemplate(t.id, name.trim());
              }}
            >
              ✎
            </button>
            <button className="x" title="Delete template" onClick={() => confirm(`Delete template "${t.name}"?`) && s.deleteTemplate(t.id)}>✕</button>
          </li>
        ))}
      </ul>
    </section>
  );
}
