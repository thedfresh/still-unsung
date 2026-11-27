"use client";

import { RecordPicker } from "@/components/admin/record-picker";
import { Button, Field } from "@/components/admin/ui/components";
import { Part } from "@/components/admin/ui/gallery-part";
import { CHOICE_CLASS, CHOICE_INPUT_CLASS, INPUT_CLASS } from "@/components/admin/ui/styles";

/** The form parts of the gallery. A client file, because the record picker takes a handler. */
export function FieldsPart() {
  return (
    <Part id="fields" title="Form fields">
      <form className="flex max-w-md flex-col gap-4" aria-label="Sample form" onSubmit={(event) => event.preventDefault()}>
        <Field label="Text field" hint="A hint says what to enter.">
          <input name="text" className={INPUT_CLASS} />
        </Field>
        <Field label="Field with an error" error="Enter a title.">
          <input name="bad" aria-invalid="true" className={INPUT_CLASS} />
        </Field>
        <Field label="Disabled field">
          <input name="off" disabled defaultValue="Cannot change" className={INPUT_CLASS} />
        </Field>
        <Field label="Text area">
          <textarea name="area" rows={3} className={INPUT_CLASS} />
        </Field>
        <Field label="Select">
          <select name="select" className={INPUT_CLASS}>
            <option>First choice</option>
            <option>Second choice</option>
          </select>
        </Field>
        <fieldset className="flex flex-col">
          <legend className="text-small font-semibold text-body">Checkbox and radio</legend>
          <label className={CHOICE_CLASS}>
            <input type="checkbox" name="check" className={CHOICE_INPUT_CLASS} />A checkbox
          </label>
          <label className={CHOICE_CLASS}>
            <input type="radio" name="radio" defaultChecked className={CHOICE_INPUT_CLASS} />
            First radio
          </label>
          <label className={CHOICE_CLASS}>
            <input type="radio" name="radio" className={CHOICE_INPUT_CLASS} />
            Second radio
          </label>
        </fieldset>
        <RecordPicker kind="work" label="Sample work" value={null} onChange={() => {}} emptyText="No work picked" />
        <Button type="submit" variant="primary" className="self-start">
          Submit sample
        </Button>
      </form>
    </Part>
  );
}
