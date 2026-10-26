"use client";

import { MoreVertical, Pencil, Plus, Trash2, X } from "lucide-react";
import { useActionState, useState } from "react";
import { SelectField, TextareaField, TextField } from "@/components/fields";
import { FormMessage } from "@/components/form-message";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { RecordFormState } from "@/app/(app)/form-state";
import {
  createCustomFieldAction,
  deleteCustomFieldAction,
  removeFieldOptionAction,
  updateCustomFieldAction,
} from "../fields/actions";
import { FieldList, ROW_CONTROL, type FieldListItem } from "./field-list";
import { FieldsSection } from "./fields-section";

export type CustomFieldRow = FieldListItem & {
  id: string;
  // What a field of options already offers, and how many records hold each;
  // empty for the other kinds.
  options: string[];
  uses: Record<string, number>;
  isSelect: boolean;
};

type RecordWords = { record: string; records: string };

const TYPES = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "select", label: "Dropdown" },
  { value: "date", label: "Date" },
];

// Closes its dialog once the action has saved; a refusal stays on the form.
function useSaving(
  action: (
    state: RecordFormState,
    formData: FormData,
  ) => Promise<RecordFormState>,
  onSaved: () => void,
) {
  return useActionState(
    async (previous: RecordFormState, formData: FormData) => {
      const result = await action(previous, formData);
      if (result?.ok) onSaved();
      return result;
    },
    null,
  );
}

function NewFieldForm({
  entityType,
  onSaved,
}: {
  entityType: string;
  onSaved: () => void;
}) {
  const [state, formAction, pending] = useSaving(
    createCustomFieldAction.bind(null, entityType),
    onSaved,
  );
  const [type, setType] = useState("text");
  const values = state?.values ?? { label: "", options: "" };

  return (
    <form
      key={JSON.stringify(values)}
      action={formAction}
      className="grid gap-4"
    >
      <TextField
        name="label"
        label="Name"
        defaultValue={values.label}
        maxLength={60}
        required
      />
      <SelectField
        name="type"
        label="Kind"
        options={TYPES}
        value={type}
        onChange={(event) => setType(event.target.value)}
      />
      {type === "select" && (
        <TextareaField
          name="options"
          label="Options"
          hint="One on each line."
          rows={4}
          defaultValue={values.options}
          required
        />
      )}
      <FormMessage state={state} />
      <Button type="submit" disabled={pending} className="justify-self-start">
        {pending ? "Saving…" : "Add field"}
      </Button>
    </form>
  );
}

// Removing asks first, in the row itself, saying how many records lose the value.
function OptionRow({
  fieldId,
  option,
  uses,
  removable,
  words,
}: {
  fieldId: string;
  option: string;
  uses: number;
  removable: boolean;
  words: RecordWords;
}) {
  const [asking, setAsking] = useState(false);
  const [state, formAction, pending] = useActionState(
    removeFieldOptionAction.bind(null, fieldId),
    null,
  );
  const held = `${uses} ${uses === 1 ? words.record : words.records}`;

  return (
    <li className="grid gap-2 py-2">
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 break-words">{option}</span>
        {uses > 0 && (
          <span className="text-xs text-muted-foreground">{held}</span>
        )}
        {removable && !asking && (
          <button
            type="button"
            aria-label={`Remove ${option}`}
            className={ROW_CONTROL}
            onClick={() => setAsking(true)}
          >
            <X aria-hidden className="size-4" />
          </button>
        )}
      </div>
      {asking && (
        <form action={formAction} className="grid gap-2 rounded-md bg-muted p-3">
          <input type="hidden" name="option" value={option} />
          <p className="text-sm">
            {uses > 0
              ? `Removing ${option} also clears it from ${held}.`
              : `No ${words.record} has ${option} yet.`}
          </p>
          <FormMessage state={state?.ok ? null : state} />
          <div className="flex gap-2">
            <Button
              type="submit"
              size="sm"
              variant="destructive"
              disabled={pending}
            >
              {pending ? "Removing…" : `Remove ${option}`}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setAsking(false)}
            >
              Keep it
            </Button>
          </div>
        </form>
      )}
    </li>
  );
}

function EditFieldForm({
  field,
  words,
  onSaved,
}: {
  field: CustomFieldRow;
  words: RecordWords;
  onSaved: () => void;
}) {
  const [state, formAction, pending] = useSaving(
    updateCustomFieldAction.bind(null, field.id),
    onSaved,
  );
  const values = state?.values ?? { label: field.label, options: "" };

  return (
    <div className="grid gap-6">
      <form
        key={JSON.stringify(values)}
        action={formAction}
        className="grid gap-4"
      >
        <TextField
          name="label"
          label="Name"
          defaultValue={values.label}
          maxLength={60}
          required
        />
        {field.isSelect && (
          <TextareaField
            name="options"
            label="More options"
            hint="One on each line."
            rows={3}
            defaultValue={values.options}
          />
        )}
        <FormMessage state={state} />
        <Button type="submit" disabled={pending} className="justify-self-start">
          {pending ? "Saving…" : "Save field"}
        </Button>
      </form>
      {field.isSelect && (
        <section aria-labelledby={`options-${field.id}`} className="grid gap-1">
          <h3 id={`options-${field.id}`} className="text-sm font-medium">
            Options
          </h3>
          <ul className="divide-y text-sm">
            {field.options.map((option) => (
              <OptionRow
                key={option}
                fieldId={field.id}
                option={option}
                uses={field.uses[option] ?? 0}
                removable={field.options.length > 1}
                words={words}
              />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

// The fields the owner added to every company or every person: created here,
// arranged like the standard ones, renamed and deleted from each row's menu.
export function CustomFields({
  entityType,
  record,
  records,
  fields,
  saveAction,
}: {
  entityType: string;
  record: string;
  records: string;
  fields: CustomFieldRow[];
  saveAction: (fields: { key: string; hidden: boolean }[]) => Promise<void>;
}) {
  // The field a dialog is about stays set while the dialog closes, so its
  // words do not go blank on the way out. While it is open, the field is read
  // from the list again, so an option removed shows as gone.
  const [open, setOpen] = useState<"new" | "edit" | "delete" | null>(null);
  const [picked, setPicked] = useState<CustomFieldRow | null>(null);
  const chosen = fields.find(({ id }) => id === picked?.id) ?? picked;
  const close = (isOpen: boolean) => !isOpen && setOpen(null);
  const choose = (field: CustomFieldRow, dialog: "edit" | "delete") => {
    setPicked(field);
    setOpen(dialog);
  };

  const newField = (
    <Button onClick={() => setOpen("new")}>
      <Plus aria-hidden />
      New field
    </Button>
  );

  return (
    <>
      {fields.length === 0 ? (
        <div className="grid justify-items-center gap-3 px-4 py-16 text-center">
          <span
            aria-hidden
            className="flex size-10 items-center justify-center rounded-lg bg-muted"
          >
            <Plus className="size-4" />
          </span>
          <div className="grid gap-1">
            <h3 className="text-base font-medium">No custom fields yet</h3>
            <p className="text-sm text-muted-foreground">
              Add fields of your own for what the standard ones leave out.
            </p>
          </div>
          {newField}
        </div>
      ) : (
        <>
          <FieldsSection
            title="Custom fields"
            note={`${fields.length} · yours to rename and delete`}
            open
          >
            <FieldList
              // Its rows are kept in state, so a field added, renamed or deleted
              // on the server needs the list built again.
              key={fields.map(({ id, label, detail }) => id + label + detail).join()}
              fields={fields}
              action={saveAction}
              menu={(field) => (
                <DropdownMenu>
                  <DropdownMenuTrigger
                    aria-label={`Actions for ${field.label}`}
                    className={ROW_CONTROL}
                  >
                    <MoreVertical aria-hidden className="size-4" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-auto min-w-36">
                    <DropdownMenuItem onClick={() => choose(field, "edit")}>
                      <Pencil aria-hidden />
                      Edit
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={() => choose(field, "delete")}
                    >
                      <Trash2 aria-hidden />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            />
          </FieldsSection>
          <div className="px-4 py-3">{newField}</div>
        </>
      )}

      <Dialog open={open === "new"} onOpenChange={close}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New field</DialogTitle>
            <DialogDescription>
              Every {record} gets it. Fill it in when you edit one.
            </DialogDescription>
          </DialogHeader>
          <NewFieldForm entityType={entityType} onSaved={() => setOpen(null)} />
        </DialogContent>
      </Dialog>

      <Dialog open={open === "edit"} onOpenChange={close}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit field</DialogTitle>
            <DialogDescription>
              Renaming keeps every value already filled in.
            </DialogDescription>
          </DialogHeader>
          {chosen && (
            <EditFieldForm
              key={chosen.id}
              field={chosen}
              words={{ record, records }}
              onSaved={() => setOpen(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={open === "delete"} onOpenChange={close}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {chosen?.label}?</AlertDialogTitle>
            <AlertDialogDescription>
              The field is removed from every {record}, along with whatever was
              filled in for it. This cannot be undone. To keep the values out of
              sight instead, hide the field with its eye.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <form
              action={async (formData) => {
                await deleteCustomFieldAction(formData);
                setOpen(null);
              }}
            >
              <input type="hidden" name="id" value={chosen?.id ?? ""} />
              <AlertDialogAction
                type="submit"
                variant="destructive"
                className="w-full"
              >
                Delete field
              </AlertDialogAction>
            </form>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
