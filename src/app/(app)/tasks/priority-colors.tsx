"use client";

import { useCallback, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCloseOutside } from "@/components/record-picker";
import { setPriorityColorAction } from "@/app/(app)/settings/actions";
import {
  hexColor,
  type PriorityColors,
  type TaskPriority,
} from "@/modules/settings/priority-colors";
import { PRIORITY_LABELS } from "./priority-tag";

// One swatch per priority. Each opens a small window to set that priority's colour for
// every task; it is saved at once, apart from the task.
export function PriorityColorSwatches({ colors }: { colors: PriorityColors }) {
  const [shown, setShown] = useState(colors);
  const [open, setOpen] = useState<TaskPriority | null>(null);
  // Around the swatches too, so moving to another swatch doesn't count as outside.
  const root = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(null), []);
  useCloseOutside(root, open !== null, close);

  return (
    <div ref={root} className="grid gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">Tag colours</span>
        {(Object.keys(PRIORITY_LABELS) as TaskPriority[]).map((priority) => (
          <button
            key={priority}
            type="button"
            aria-label={`${PRIORITY_LABELS[priority]} colour: ${shown[priority]}. Change`}
            aria-expanded={open === priority}
            onClick={() => setOpen(open === priority ? null : priority)}
            className="flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs hover:bg-muted"
          >
            <span
              aria-hidden
              className="size-3.5 rounded-full border"
              style={{ backgroundColor: shown[priority] }}
            />
            {PRIORITY_LABELS[priority]}
          </button>
        ))}
      </div>
      {open && (
        <ColorWindow
          key={open}
          priority={open}
          color={shown[open]}
          onClose={close}
          onSaved={(color) => {
            setShown((current) => ({ ...current, [open]: color }));
            setOpen(null);
          }}
        />
      )}
    </div>
  );
}

function ColorWindow({
  priority,
  color,
  onClose,
  onSaved,
}: {
  priority: TaskPriority;
  color: string;
  onClose: () => void;
  onSaved: (color: string) => void;
}) {
  const [hex, setHex] = useState(color);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();
  const valid = hexColor.safeParse(hex);
  const label = PRIORITY_LABELS[priority];

  const save = () => {
    if (!valid.success) {
      setError(valid.error.issues[0].message);
      return;
    }
    startSaving(async () => {
      const result = await setPriorityColorAction(priority, valid.data);
      if (result.ok) onSaved(valid.data);
      else setError(result.message);
    });
  };

  return (
    <div
      role="group"
      aria-label={`${label} colour`}
      className="grid max-w-xs gap-3 rounded-lg border bg-popover p-3 shadow-sm"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          onClose();
        }
        // Enter saves the colour, never the task around it.
        if (event.key === "Enter") {
          event.preventDefault();
          save();
        }
      }}
    >
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={`Pick ${label} colour`}
          value={valid.success ? valid.data : color}
          onChange={(event) => {
            setHex(event.target.value);
            setError(null);
          }}
          className="h-9 w-12 cursor-pointer rounded border bg-transparent"
        />
        <Input
          aria-label={`${label} hex colour`}
          value={hex}
          maxLength={7}
          spellCheck={false}
          autoFocus
          onChange={(event) => {
            setHex(event.target.value);
            setError(null);
          }}
          className="font-mono"
        />
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="button" size="sm" disabled={saving} onClick={save}>
          {saving ? "Saving…" : "Save colour"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
