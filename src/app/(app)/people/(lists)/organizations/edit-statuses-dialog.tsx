"use client";

import { Plus, Trash2 } from "lucide-react";
import { useActionState, useState, useTransition } from "react";
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
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import type { CompanyStatus } from "@/modules/statuses/queries";
import type { StatusColor } from "@/modules/statuses/schema";
import type { RecordFormState } from "@/app/(app)/form-state";
import {
  createCompanyStatusAction,
  deleteCompanyStatusAction,
  renameCompanyStatusAction,
  setCompanyStatusColorAction,
} from "../../statuses/actions";
import {
  STATUS_COLOR_OPTIONS,
  statusColorName,
  StatusDot,
} from "../status-badge";

// A status's dot, which opens the nine colours it can take.
function ColorMenu({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: StatusColor;
  disabled?: boolean;
  onChange: (color: StatusColor) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`${label}: ${statusColorName(value)}`}
        disabled={disabled}
        className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md border hover:bg-muted disabled:opacity-60"
      >
        <StatusDot color={value} className="size-3" />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-auto min-w-36">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Colour</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={value}
            onValueChange={(next: StatusColor) => onChange(next)}
          >
            {STATUS_COLOR_OPTIONS.map((option) => (
              <DropdownMenuRadioItem
                key={option.value}
                value={option.value}
                closeOnClick
              >
                <StatusDot color={option.value} />
                {option.label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
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
  // The box is never rebuilt, so a refused name stays in it with the cursor.
  // It follows the name the server holds whenever that changes.
  const [name, setName] = useState(status.label);
  const [held, setHeld] = useState(status.label);
  if (held !== status.label) {
    setHeld(status.label);
    setName(status.label);
  }

  return (
    <li className="grid gap-1">
      <div className="flex items-center gap-2">
        <ColorMenu
          label={`Colour of ${status.label}`}
          value={status.color}
          disabled={recolouring}
          onChange={(color) =>
            startTransition(() =>
              setCompanyStatusColorAction(status.key, color),
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
  const [color, setColor] = useState<StatusColor>("gray");
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
      <div className="flex items-center gap-2">
        <ColorMenu label="Colour of the new status" value={color} onChange={setColor} />
        <form action={formAction} className="flex min-w-0 flex-1 gap-2">
          <input type="hidden" name="color" value={color} />
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
      </div>
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
              Pick a colour for each. The first five are built in and keep their
              names; add your own below them.
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
