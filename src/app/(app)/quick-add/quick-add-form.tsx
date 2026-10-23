"use client";

import { useActionState, useState } from "react";
import { FormOutcome } from "@/components/form-outcome";
import { SelectField, TextField, type Option } from "@/components/fields";
import { RecordPicker } from "@/components/record-picker";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { searchOrganizationsAction } from "../people/organizations/actions";
import { quickAddAction } from "./actions";

const MODES = [
  { value: "new", label: "New company" },
  { value: "existing", label: "Existing company" },
  { value: "none", label: "No company" },
] as const;
type Mode = (typeof MODES)[number]["value"];

export function QuickAddForm({
  workflows,
  followUpDate,
}: {
  workflows: Option[];
  followUpDate: string;
}) {
  const [state, formAction, pending] = useActionState(quickAddAction, null);
  const values = state?.values ?? {};
  const [mode, setMode] = useState<Mode>(
    (MODES.find(({ value }) => value === values.companyMode)?.value) ?? "new",
  );
  const value = (name: string, fallback = "") => values[name] ?? fallback;

  return (
    <form key={JSON.stringify(values)} action={formAction} className="grid gap-6">
      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-3 text-sm font-semibold">Person</legend>
        <TextField
          name="firstName"
          label="First name"
          defaultValue={value("firstName")}
          autoComplete="off"
          required
        />
        <TextField name="lastName" label="Last name" defaultValue={value("lastName")} autoComplete="off" />
        <TextField
          name="email"
          label="Email"
          type="email"
          defaultValue={value("email")}
          autoComplete="off"
        />
        <TextField name="jobTitle" label="Job title" defaultValue={value("jobTitle")} />
      </fieldset>

      <fieldset className="grid gap-4">
        <legend className="mb-3 text-sm font-semibold">Company</legend>
        <div
          role="radiogroup"
          aria-label="Where they work"
          className="grid w-full grid-cols-3 gap-1 rounded-lg bg-muted p-1 sm:inline-flex sm:w-fit"
        >
          {MODES.map((option) => (
            <label
              key={option.value}
              className={cn(
                "flex cursor-pointer items-center justify-center rounded-md px-2 py-1.5 text-center text-xs leading-tight has-focus-visible:ring-2 has-focus-visible:ring-ring sm:px-3 sm:text-sm sm:whitespace-nowrap",
                mode === option.value
                  ? "bg-background font-medium shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <input
                type="radio"
                name="companyMode"
                value={option.value}
                checked={mode === option.value}
                onChange={() => setMode(option.value)}
                className="sr-only"
              />
              {option.label}
            </label>
          ))}
        </div>
        {mode === "new" && (
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              name="companyName"
              label="Company name"
              placeholder="Stripe"
              defaultValue={value("companyName")}
              required
            />
            <TextField
              name="companyWebsite"
              label="Domain"
              placeholder="stripe.com"
              hint="The website is read for the logo and details."
              defaultValue={value("companyWebsite")}
            />
          </div>
        )}
        {mode === "existing" && (
          <RecordPicker
            name="organizationId"
            labelName="organizationLabel"
            noun="company"
            plural="companies"
            initial={
              values.organizationId
                ? { id: values.organizationId, label: value("organizationLabel") }
                : null
            }
            search={searchOrganizationsAction}
          />
        )}
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-3 text-sm font-semibold">Next steps</legend>
        <SelectField
          name="workflowId"
          label="Start a workflow"
          options={workflows}
          blank="None"
          defaultValue={value("workflowId")}
          hint={mode === "none" ? "Started on the person." : "Started on the company."}
        />
        <TextField
          name="followUpDate"
          label="Follow up on"
          type="date"
          defaultValue={value("followUpDate", followUpDate)}
          hint="Clear it to make no task."
        />
        <div className="sm:col-span-2">
          <TextField
            name="followUpTitle"
            label="Follow-up task"
            placeholder="Follow up with …"
            defaultValue={value("followUpTitle")}
            maxLength={200}
          />
        </div>
      </fieldset>

      <FormOutcome state={state} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Add"}
        </Button>
        {/* After the main button, so pressing Enter in a field never confirms a look-alike. */}
        {state?.canConfirm && (
          <Button type="submit" name="confirmSimilar" value="yes" variant="outline" disabled={pending}>
            Add anyway
          </Button>
        )}
      </div>
    </form>
  );
}
