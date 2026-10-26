"use client";

import { Pencil } from "lucide-react";
import { useActionState, useLayoutEffect, useRef, useState } from "react";
import { FormMessage } from "@/components/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import type { CustomFieldType, EntityType } from "@/modules/fields/schema";
import type { RecordFormState } from "@/app/(app)/form-state";
import { setCustomValueAction } from "./actions";

export type InlineField = {
  key: string;
  label: string;
  type: CustomFieldType;
  options: string[];
};

// A custom field's value in Details, which becomes its input when pressed.
export function InlineCustomValue({
  record,
  field,
  value,
  shown,
}: {
  record: { entityType: EntityType; id: string };
  field: InlineField;
  value: string;
  shown: string | null;
}) {
  const [editing, setEditing] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const returning = useRef(false);

  // Before the panel, finding focus lost with the input, takes it for itself.
  useLayoutEffect(() => {
    if (!editing && returning.current) {
      returning.current = false;
      button.current?.focus();
    }
  }, [editing]);

  const close = () => {
    returning.current = true;
    setEditing(false);
  };

  if (editing) {
    return (
      <Editor
        record={record}
        field={field}
        value={value}
        onDone={close}
      />
    );
  }

  return (
    <button
      ref={button}
      type="button"
      aria-label={`Edit ${field.label}`}
      onClick={() => setEditing(true)}
      className="group -mx-1 inline-flex max-w-full items-center gap-1.5 rounded px-1 text-left outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <span className="min-w-0 break-words">
        {shown ?? <span className="font-normal text-muted-foreground">—</span>}
      </span>
      <Pencil
        aria-hidden
        className="size-3.5 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100"
      />
    </button>
  );
}

function Editor({
  record,
  field,
  value,
  onDone,
}: {
  record: { entityType: EntityType; id: string };
  field: InlineField;
  value: string;
  onDone: () => void;
}) {
  const [state, formAction, pending] = useActionState(
    async (previous: RecordFormState, formData: FormData) => {
      const result = await setCustomValueAction(
        record.entityType,
        record.id,
        field.key,
        previous,
        formData,
      );
      if (result?.ok) onDone();
      return result;
    },
    null,
  );
  const typed = state?.ok === false ? state.values?.value : undefined;
  const input = {
    name: "value",
    "aria-label": field.label,
    defaultValue: typed ?? value,
    autoFocus: true,
    "aria-invalid": state?.ok === false || undefined,
  };

  return (
    // The record's panel leaves an Escape from in here to this form (record-sheet.tsx).
    <form
      action={formAction}
      data-inline-editor
      className="grid gap-1.5 font-normal"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onDone();
        }
      }}
    >
      {field.type === "select" ? (
        <NativeSelect size="sm" className="w-full" {...input}>
          <NativeSelectOption value="">Not set</NativeSelectOption>
          {field.options.map((option) => (
            <NativeSelectOption key={option} value={option}>
              {option}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      ) : (
        <Input
          type={field.type}
          step={field.type === "number" ? "any" : undefined}
          className="h-7"
          {...input}
        />
      )}
      <div className="flex gap-1">
        <Button type="submit" size="sm" disabled={pending}>
          Save
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>
          Cancel
        </Button>
      </div>
      {state?.ok === false && <FormMessage state={state} />}
    </form>
  );
}
