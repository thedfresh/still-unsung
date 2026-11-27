"use client";

import { CHOICE_CLASS, CHOICE_INPUT_CLASS, FIELD_CLASS, HINT_CLASS, INPUT_CLASS, LABEL_CLASS } from "@/components/admin/ui/styles";
import type { ListConfig, ListField } from "@/lib/lists/config";
import { editableFields, type ListValues } from "@/lib/lists/edits";

const INPUT = INPUT_CLASS;

interface Props {
  config: ListConfig;
  values: ListValues;
  onChange: (values: ListValues) => void;
  /** Makes each control's ID unique on the page. */
  idPrefix: string;
  /** The values as stored, to show a read-only field. Leave out for a new value. */
  stored?: ListValues;
}

function Control({ field, value, id, onChange }: { field: ListField; value: ListValues[string]; id: string; onChange: (value: string | boolean) => void }) {
  if (field.kind === "boolean") {
    return (
      <label className={CHOICE_CLASS}>
        <input type="checkbox" className={CHOICE_INPUT_CLASS} checked={value === true} onChange={(e) => onChange(e.target.checked)} />
        {field.label}
      </label>
    );
  }
  const help = field.help ? `${id}-help` : undefined;
  return (
    <div className={FIELD_CLASS}>
      <label htmlFor={id} className={LABEL_CLASS}>
        {field.label}
        {field.required ? "" : " (optional)"}
      </label>
      {field.kind === "select" ? (
        <select id={id} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} aria-describedby={help} className={INPUT}>
          {field.options?.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      ) : (
        <input id={id} value={String(value ?? "")} maxLength={300} onChange={(e) => onChange(e.target.value)} aria-describedby={help} className={INPUT} />
      )}
      {field.help ? <p id={help} className={HINT_CLASS}>{field.help}</p> : null}
    </div>
  );
}

/** The inputs of one list value, from the list's config. A read-only field shows as text. */
export function ListFields({ config, values, onChange, idPrefix, stored }: Props) {
  return (
    <div className="flex flex-col gap-3">
      {editableFields(config).map((field) => (
        <Control
          key={field.name}
          field={field}
          value={values[field.name]}
          id={`${idPrefix}-${field.name}`}
          onChange={(value) => onChange({ ...values, [field.name]: value })}
        />
      ))}
      {stored
        ? config.fields
            .filter((field) => field.readOnly)
            .map((field) => (
              <p key={field.name}>
                {field.label}: {stored[field.name] ? String(stored[field.name]) : "not set"} (cannot be changed here)
              </p>
            ))
        : null}
    </div>
  );
}
