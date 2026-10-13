"use client";

import { Plus, X } from "lucide-react";
import { useRef, useState, useTransition, type FormEvent } from "react";
import { SelectField, TextareaField, TextField } from "@/components/fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import type { ChecklistItem, StageKind, StageTask } from "@/db/schema";
import { saveStageAction } from "./actions";

export type StageValues = {
  id: string;
  name: string;
  kind: StageKind;
  description: string | null;
  slaDays: number | null;
  checklist: ChecklistItem[];
  defaultTasks: StageTask[];
};

const KINDS = [
  { value: "normal", label: "A step along the way" },
  { value: "won", label: "Ends the workflow: won" },
  { value: "lost", label: "Ends the workflow: lost" },
  { value: "done", label: "Ends the workflow: done" },
];

const PRIORITIES = [
  { value: "low", label: "Low" },
  { value: "normal", label: "Normal" },
  { value: "high", label: "High" },
];

// `key` tells the rows apart while they are typed in; only an item that was
// already saved has an id.
type ItemRow = { key: string; id?: string; label: string; required: boolean };
type TaskRow = {
  key: string;
  title: string;
  offsetDays: string;
  priority: string;
};

const GROUP = "grid gap-2";
const LEGEND = "text-sm font-medium";
const NOTE = "text-sm text-muted-foreground";

// One stage of a workflow, new or existing. The whole stage is held here and sent
// in one piece, since its checklist and tasks are lists that grow and shrink.
export function StageForm({
  templateId,
  stage,
  onSaved,
}: {
  templateId: string;
  stage: StageValues | null;
  onSaved: () => void;
}) {
  const [name, setName] = useState(stage?.name ?? "");
  const [kind, setKind] = useState<string>(stage?.kind ?? "normal");
  const [description, setDescription] = useState(stage?.description ?? "");
  const [slaDays, setSlaDays] = useState(stage?.slaDays?.toString() ?? "");
  const [checklist, setChecklist] = useState<ItemRow[]>(() =>
    (stage?.checklist ?? []).map((item) => ({ key: item.id, ...item })),
  );
  const [tasks, setTasks] = useState<TaskRow[]>(() =>
    (stage?.defaultTasks ?? []).map((task, index) => ({
      key: `saved-${index}`,
      title: task.title,
      offsetDays: String(task.offsetDays),
      priority: task.priority,
    })),
  );
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const added = useRef(0);
  const newKey = () => `new-${(added.current += 1)}`;
  // Nothing leads on from an end stage, so it has nothing to tick and no deadline.
  const isStep = kind === "normal";

  function submit(event: FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      const result = await saveStageAction(templateId, stage?.id ?? null, {
        name,
        description,
        kind,
        slaDays: isStep ? slaDays : "",
        // A row added and left empty was never meant.
        checklist: isStep
          ? checklist
              .filter((item) => item.label.trim())
              .map(({ id, label, required }) => ({
                ...(id && { id }),
                label,
                required,
              }))
          : [],
        defaultTasks: tasks
          .filter((task) => task.title.trim())
          .map(({ title, offsetDays, priority }) => ({
            title,
            offsetDays,
            priority,
          })),
      });
      if (result?.ok) onSaved();
      else setError(result?.message ?? "");
    });
  }

  const changeItem = (key: string, change: Partial<ItemRow>) =>
    setChecklist((rows) =>
      rows.map((row) => (row.key === key ? { ...row, ...change } : row)),
    );
  const changeTask = (key: string, change: Partial<TaskRow>) =>
    setTasks((rows) =>
      rows.map((row) => (row.key === key ? { ...row, ...change } : row)),
    );

  return (
    <form onSubmit={submit} className="grid gap-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          name="stage-name"
          label="Name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={80}
          required
        />
        <SelectField
          name="stage-kind"
          label="Kind"
          options={KINDS}
          value={kind}
          onChange={(event) => setKind(event.target.value)}
        />
      </div>
      <TextareaField
        name="stage-description"
        label="Description"
        rows={2}
        value={description}
        onChange={(event) => setDescription(event.target.value)}
      />

      {isStep && (
        <>
          <TextField
            name="stage-deadline"
            label="Deadline in days"
            hint="A workflow that stays here longer is flagged. Leave empty for none."
            type="number"
            min={1}
            max={365}
            value={slaDays}
            onChange={(event) => setSlaDays(event.target.value)}
          />

          <fieldset className={GROUP}>
            <legend className={LEGEND}>Checklist</legend>
            <p className={NOTE}>
              What gets done in this stage. A required item has to be ticked
              before moving on.
            </p>
            {checklist.map((item, index) => (
              <div key={item.key} className="flex items-center gap-2">
                <Input
                  aria-label={`Checklist item ${index + 1}`}
                  value={item.label}
                  onChange={(event) =>
                    changeItem(item.key, { label: event.target.value })
                  }
                  maxLength={200}
                  className="min-w-0 flex-1"
                />
                <label className="flex items-center gap-1.5 text-sm whitespace-nowrap">
                  <input
                    type="checkbox"
                    aria-label={`Checklist item ${index + 1} is required`}
                    className="size-4 cursor-pointer accent-primary"
                    checked={item.required}
                    onChange={(event) =>
                      changeItem(item.key, { required: event.target.checked })
                    }
                  />
                  Required
                </label>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove checklist item ${index + 1}`}
                  onClick={() =>
                    setChecklist((rows) =>
                      rows.filter((row) => row.key !== item.key),
                    )
                  }
                >
                  <X aria-hidden />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="justify-self-start"
              onClick={() =>
                setChecklist((rows) => [
                  ...rows,
                  { key: newKey(), label: "", required: false },
                ])
              }
            >
              <Plus aria-hidden />
              Add item
            </Button>
          </fieldset>
        </>
      )}

      <fieldset className={GROUP}>
        <legend className={LEGEND}>Tasks</legend>
        <p className={NOTE}>
          Created when a workflow enters this stage, due that many days later.
        </p>
        {tasks.map((task, index) => (
          <div key={task.key} className="flex flex-wrap items-center gap-2">
            <Input
              aria-label={`Task ${index + 1}`}
              value={task.title}
              onChange={(event) =>
                changeTask(task.key, { title: event.target.value })
              }
              maxLength={300}
              className="min-w-40 flex-1"
            />
            <Input
              aria-label={`Task ${index + 1} is due after days`}
              type="number"
              min={0}
              max={365}
              value={task.offsetDays}
              onChange={(event) =>
                changeTask(task.key, { offsetDays: event.target.value })
              }
              className="w-20"
            />
            <NativeSelect
              aria-label={`Priority of task ${index + 1}`}
              value={task.priority}
              onChange={(event) =>
                changeTask(task.key, { priority: event.target.value })
              }
            >
              {PRIORITIES.map((priority) => (
                <NativeSelectOption key={priority.value} value={priority.value}>
                  {priority.label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={`Remove task ${index + 1}`}
              onClick={() =>
                setTasks((rows) => rows.filter((row) => row.key !== task.key))
              }
            >
              <X aria-hidden />
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="justify-self-start"
          onClick={() =>
            setTasks((rows) => [
              ...rows,
              { key: newKey(), title: "", offsetDays: "0", priority: "normal" },
            ])
          }
        >
          <Plus aria-hidden />
          Add task
        </Button>
      </fieldset>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" disabled={pending} className="justify-self-start">
        {pending ? "Saving…" : stage ? "Save stage" : "Add stage"}
      </Button>
    </form>
  );
}
