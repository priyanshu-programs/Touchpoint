"use client";

import { Plus, Trash2 } from "lucide-react";
import {
  useActionState,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  useTransition,
} from "react";
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
import { Input } from "@/components/ui/input";
import type { CompanyStatus } from "@/modules/statuses/queries";
import type { RecordFormState } from "@/app/(app)/form-state";
import {
  createCompanyStatusAction,
  deleteCompanyStatusAction,
  renameCompanyStatusAction,
  setCompanyStatusColorAction,
} from "../../statuses/actions";

// What a new status starts in: the colour of Other.
const NEW_STATUS_COLOR = "#a1a1aa";

// State that starts as what the server holds and goes back to it whenever that
// changes. The control it feeds is never rebuilt, so it keeps the cursor.
function useFollowing(saved: string) {
  const [value, setValue] = useState(saved);
  const [held, setHeld] = useState(saved);
  if (held !== saved) {
    setHeld(saved);
    setValue(saved);
  }
  return [value, setValue] as const;
}

// A status's colour: a round swatch that opens the browser's own picker, so any
// colour can be chosen. `onChange` hears every colour dragged over; `onCommit`
// only the one the owner settles on, which React's own change event cannot tell apart.
function ColorPicker({
  label,
  value,
  name,
  disabled,
  onChange,
  onCommit,
}: {
  label: string;
  value: string;
  name?: string;
  disabled?: boolean;
  onChange: (color: string) => void;
  onCommit?: (color: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const settle = useEffectEvent((color: string) => onCommit?.(color));
  useEffect(() => {
    const element = input.current!;
    const heard = () => settle(element.value);
    element.addEventListener("change", heard);
    return () => element.removeEventListener("change", heard);
  }, []);

  return (
    <input
      ref={input}
      type="color"
      name={name}
      aria-label={label}
      title={value}
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
      className="size-8 shrink-0 cursor-pointer appearance-none rounded-md border bg-transparent p-1.5 hover:bg-muted disabled:opacity-60 [&::-moz-color-swatch]:rounded-full [&::-moz-color-swatch]:border-0 [&::-webkit-color-swatch]:rounded-full [&::-webkit-color-swatch]:border-0 [&::-webkit-color-swatch-wrapper]:p-0"
    />
  );
}

function StatusRow({
  status,
  onDelete,
}: {
  status: CompanyStatus;
  onDelete: () => void;
}) {
  const [recolouring, startTransition] = useTransition();
  const [state, renameAction, renaming] = useActionState(
    renameCompanyStatusAction.bind(null, status.key),
    null,
  );
  // A refused name stays in its box, with the cursor.
  const [name, setName] = useFollowing(status.label);
  const [color, setColor] = useFollowing(status.color);

  return (
    <li className="grid gap-1">
      <div className="flex items-center gap-2">
        <ColorPicker
          label={`Colour of ${status.label}`}
          value={color}
          disabled={recolouring}
          onChange={setColor}
          onCommit={(picked) =>
            startTransition(() =>
              setCompanyStatusColorAction(status.key, picked),
            )
          }
        />
        {status.builtIn ? (
          <>
            <span className="min-w-0 flex-1 truncate">{status.label}</span>
            <span className="text-xs text-muted-foreground">Built in</span>
          </>
        ) : (
          <>
            <form action={renameAction} className="flex min-w-0 flex-1 gap-2">
              <Input
                name="label"
                aria-label={`Name of ${status.label}`}
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={40}
                required
              />
              <Button type="submit" variant="ghost" size="sm" disabled={renaming}>
                Save
              </Button>
            </form>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={`Delete ${status.label}`}
              onClick={onDelete}
            >
              <Trash2 aria-hidden />
            </Button>
          </>
        )}
      </div>
      {state?.ok === false && <FormMessage state={state} />}
    </li>
  );
}

function NewStatusForm() {
  const [color, setColor] = useState(NEW_STATUS_COLOR);
  const [label, setLabel] = useState("");
  // Empty again once a status is added; a refused name stays, with the cursor.
  const [state, formAction, pending] = useActionState(
    async (previous: RecordFormState, formData: FormData) => {
      const result = await createCompanyStatusAction(previous, formData);
      if (result?.ok) setLabel("");
      return result;
    },
    null,
  );

  return (
    <div className="grid gap-1 border-t pt-4">
      <form action={formAction} className="flex items-center gap-2">
        <ColorPicker
          label="Colour of the new status"
          name="color"
          value={color}
          onChange={setColor}
        />
        <Input
          name="label"
          aria-label="New status"
          placeholder="New status"
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          maxLength={40}
          required
        />
        <Button type="submit" size="sm" disabled={pending}>
          <Plus aria-hidden />
          Add
        </Button>
      </form>
      <FormMessage state={state} />
    </div>
  );
}

// The statuses a company can have: a colour for each, and the owner's own
// added, renamed and deleted.
export function EditStatusesDialog({
  open,
  onOpenChange,
  statuses,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  statuses: CompanyStatus[];
}) {
  // Stays set while the confirmation closes, so its words do not go blank on the way out.
  const [chosen, setChosen] = useState<CompanyStatus | null>(null);
  const [confirming, setConfirming] = useState(false);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Company statuses</DialogTitle>
            <DialogDescription>
              Pick any colour for each. The first five are built in and keep
              their names; add your own below them.
            </DialogDescription>
          </DialogHeader>
          <ul aria-label="Statuses" className="grid max-h-[50vh] gap-2 overflow-y-auto">
            {statuses.map((status) => (
              <StatusRow
                key={status.key}
                status={status}
                onDelete={() => {
                  setChosen(status);
                  setConfirming(true);
                }}
              />
            ))}
          </ul>
          <NewStatusForm />
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {chosen?.label}?</AlertDialogTitle>
            <AlertDialogDescription>
              Every company with this status becomes Other. This cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <form
              action={async (formData) => {
                await deleteCompanyStatusAction(formData);
                setConfirming(false);
              }}
            >
              <input type="hidden" name="key" value={chosen?.key ?? ""} />
              <AlertDialogAction
                type="submit"
                variant="destructive"
                className="w-full"
              >
                Delete status
              </AlertDialogAction>
            </form>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
