"use client";

import { X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useRef, useState } from "react";
import type { RecordFormState } from "@/app/(app)/form-state";
import {
  SelectField,
  TextareaField,
  TextField,
  type Option,
} from "@/components/fields";
import { FormButtons, FormOutcome } from "@/components/form-outcome";
import { Button } from "@/components/ui/button";
import { MAX_FILE_BYTES } from "@/modules/workflows/drawing";
import { CREATE_REFUSALS, FILE_ACCEPT, FILE_KINDS_HINT, materialHref } from "./labels";

const FAILED = "That did not go through. Try again.";

// A material made with a file goes up as one request, since a server action
// takes a megabyte at most; the server makes it only if the file is kept.
async function createWithFile(data: FormData, file: File) {
  if (file.size > MAX_FILE_BYTES) return { message: CREATE_REFUSALS.too_large };
  const body = new FormData();
  for (const field of ["name", "type", "description", "label"]) {
    body.set(field, String(data.get(field) ?? ""));
  }
  body.set("file", file);
  const response = await fetch("/api/materials", { method: "POST", body }).catch(() => null);
  if (!response) return { message: FAILED };
  if (response.ok) return (await response.json()) as { id: string };
  // The hosting turns an oversized request away itself, with no reason given.
  if (response.status === 413) return { message: CREATE_REFUSALS.too_large };
  const { reason, message } = await response
    .json()
    .catch(() => ({ reason: null, message: null }));
  return {
    message:
      reason === "invalid"
        ? (message ?? FAILED)
        : (CREATE_REFUSALS[reason as keyof typeof CREATE_REFUSALS] ?? FAILED),
  };
}

export function MaterialForm({
  action,
  initial,
  types,
  firstVersion,
  submitLabel,
  cancelHref,
}: {
  action: (
    state: RecordFormState,
    formData: FormData,
  ) => Promise<RecordFormState>;
  initial: Record<string, string>;
  types: Option[];
  // A new material may start with a link or an uploaded file.
  firstVersion?: boolean;
  submitLabel: string;
  cancelHref: string;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(action, null);
  const values = state?.values ?? initial;
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const picker = useRef<HTMLInputElement>(null);

  return (
    // Remounting on new values is what makes selects show them after a rejected submit.
    <form
      key={JSON.stringify(values)}
      action={formAction}
      onSubmit={(event) => {
        // Without a file the form goes to its action as before.
        if (!file) return;
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        setBusy(true);
        setMessage(null);
        void createWithFile(data, file).then((outcome) => {
          if ("id" in outcome) {
            router.push(materialHref(outcome.id));
            return;
          }
          setBusy(false);
          setMessage(outcome.message);
        });
      }}
      className="grid gap-4"
    >
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_12rem]">
        <TextField
          name="name"
          label="Name"
          placeholder="Rate card"
          defaultValue={values.name}
          maxLength={200}
          required
        />
        <SelectField
          name="type"
          label="Type"
          options={types}
          defaultValue={values.type}
        />
      </div>
      <TextareaField
        name="description"
        label="Description"
        hint="What it is and when you send it."
        defaultValue={values.description}
        maxLength={2000}
      />
      {firstVersion && (
        <div className="grid items-start gap-4 sm:grid-cols-[minmax(0,1fr)_12rem]">
          <div className="grid gap-2">
            {file ? (
              <div className="grid gap-1.5">
                <span className="text-sm font-medium">File</span>
                <div className="flex min-w-0 items-center gap-2 rounded-md border px-3 py-1.5 text-sm">
                  <span className="min-w-0 flex-1 truncate">{file.name}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    aria-label={`Remove ${file.name}`}
                    onClick={() => {
                      setMessage(null);
                      setFile(null);
                    }}
                  >
                    <X aria-hidden />
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <TextField
                  name="url"
                  label="Link (optional)"
                  placeholder="https://"
                  hint="Where it lives now, such as a Google Drive or Canva link."
                  defaultValue={values.url}
                  maxLength={2000}
                />
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm text-muted-foreground">or</span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => picker.current?.click()}
                  >
                    Upload a file
                  </Button>
                  <span className="text-xs text-muted-foreground">{FILE_KINDS_HINT}</span>
                </div>
              </>
            )}
            <input
              ref={picker}
              type="file"
              aria-label="File to upload"
              className="sr-only"
              accept={FILE_ACCEPT}
              onChange={(event) => {
                const [chosen] = event.currentTarget.files ?? [];
                // Emptied, so choosing the same file again is still a change.
                event.currentTarget.value = "";
                if (!chosen) return;
                setMessage(chosen.size > MAX_FILE_BYTES ? CREATE_REFUSALS.too_large : null);
                setFile(chosen);
              }}
            />
          </div>
          <TextField
            name="label"
            label="Version"
            placeholder="v1"
            defaultValue={values.label}
            maxLength={100}
          />
        </div>
      )}

      {message ? (
        <p role="alert" className="text-sm text-destructive">
          {message}
        </p>
      ) : (
        <FormOutcome state={state} />
      )}
      <FormButtons
        state={state}
        pending={pending || busy}
        submitLabel={submitLabel}
        cancelHref={cancelHref}
      />
    </form>
  );
}
