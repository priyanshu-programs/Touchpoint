"use client";

import { useState, type FormEvent } from "react";
import { searchContactsAction } from "@/app/(app)/people/contacts/actions";
import { searchOrganizationsAction } from "@/app/(app)/people/organizations/actions";
import { taskFormOptions } from "@/app/(app)/tasks/form-options";
import { SelectField, TextareaField, TextField } from "@/components/fields";
import { RecordPicker } from "@/components/record-picker";
import { Button } from "@/components/ui/button";
import type { TaskDraft, TaskStep } from "@/modules/assistant/actions";

const QUESTIONS: Record<TaskStep, string> = {
  deadline: "When is it due?",
  priority: "How important is it?",
  reminder: "Should Touchpoint remind you?",
  repeat: "Does it repeat?",
  who: "Who is it with?",
  notes: "Any notes?",
};

const FIELDS = [
  "notes",
  "priority",
  "dueDate",
  "dueTime",
  "repeat",
  "repeatEvery",
  "remindAt",
  "contactId",
  "organizationId",
];

// A task card's questions, one at a time, for what the chat didn't already say. Nothing
// is added until Save task or Skip all, which send every answer given so far.
export function TaskQuestions({
  draft,
  pending,
  onSave,
}: {
  draft: TaskDraft;
  pending: boolean;
  onSave: (details: Record<string, string>) => void;
}) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [index, setIndex] = useState(0);
  const value = (field: keyof TaskDraft["values"]) => answers[field] ?? draft.values[field];
  // A task repeats from its deadline, so with none there's nothing to ask.
  const steps = draft.ask.filter((step) => step !== "repeat" || value("dueDate"));
  const step = steps[index];

  function answer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    advance(
      Object.fromEntries(
        FIELDS.flatMap((field) => {
          const typed = form.get(field);
          return typeof typed === "string" ? [[field, typed]] : [];
        }),
      ),
    );
  }

  function advance(given: Record<string, string>, skipAll = false) {
    const next = { ...answers, ...given };
    setAnswers(next);
    if (skipAll || index + 1 >= steps.length) {
      setIndex(steps.length);
      onSave(next);
    } else {
      setIndex(index + 1);
    }
  }

  if (!step) {
    return (
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" disabled={pending} onClick={() => onSave(answers)}>
          Save task
        </Button>
        {steps.length > 0 && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => setIndex(0)}
          >
            Back to the questions
          </Button>
        )}
      </div>
    );
  }

  const last = index + 1 === steps.length;
  return (
    <form
      key={step}
      aria-label={QUESTIONS[step]}
      className="grid gap-3"
      onSubmit={answer}
    >
      <p className="font-medium">{QUESTIONS[step]}</p>
      {step === "deadline" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField name="dueDate" label="Deadline date" type="date" defaultValue={value("dueDate")} />
          <TextField
            name="dueTime"
            label="Deadline time"
            type="time"
            hint="Leave empty for an all-day task."
            defaultValue={value("dueTime")}
          />
        </div>
      )}
      {step === "priority" && (
        <SelectField
          name="priority"
          label="Priority"
          options={taskFormOptions.priorities}
          defaultValue={value("priority")}
        />
      )}
      {step === "reminder" && (
        <TextField
          name="remindAt"
          label="Reminder"
          type="datetime-local"
          hint="Shown on Today once the time has passed."
          defaultValue={value("remindAt")}
        />
      )}
      {step === "repeat" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <SelectField
            name="repeat"
            label="Repeats"
            options={taskFormOptions.repeats}
            blank="Does not repeat"
            defaultValue={value("repeat")}
          />
          <TextField
            name="repeatEvery"
            label="Repeat every"
            type="number"
            min={1}
            max={99}
            hint="2 with Weekly means every two weeks."
            defaultValue={value("repeatEvery")}
          />
        </div>
      )}
      {step === "who" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <RecordPicker
            name="contactId"
            labelName="contactName"
            noun="contact"
            initial={
              value("contactId")
                ? { id: value("contactId"), label: draft.contactName ?? "" }
                : null
            }
            search={searchContactsAction}
          />
          <RecordPicker
            name="organizationId"
            labelName="organizationName"
            noun="company"
            plural="companies"
            initial={
              value("organizationId")
                ? { id: value("organizationId"), label: draft.organizationName ?? "" }
                : null
            }
            search={searchOrganizationsAction}
          />
        </div>
      )}
      {step === "notes" && <TextareaField name="notes" label="Notes" defaultValue={value("notes")} />}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {last ? "Save task" : "Next"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => advance({})}
        >
          Skip this step
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() => advance({}, true)}
        >
          Skip all
        </Button>
        <span className="text-muted-foreground">
          {index + 1} of {steps.length}
        </span>
      </div>
    </form>
  );
}
