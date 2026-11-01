"use client";

import { Archive, ArchiveRestore, Trash2 } from "lucide-react";
import {
  createContext,
  use,
  useState,
  useTransition,
  type ReactNode,
} from "react";
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

const SelectionContext = createContext<{
  ids: readonly string[];
  selected: readonly string[];
  set: (ids: readonly string[], on: boolean) => void;
} | null>(null);

const CHECKBOX = "size-4 cursor-pointer accent-primary";
// The whole cell answers, so a near miss does not open the row instead.
const CELL = "flex cursor-pointer items-center py-3 pr-2 pl-4";

// The rows of one page of a list that are ticked, and the bar that acts on them all.
export function Selection({
  ids,
  noun,
  archived,
  archiveAction,
  deleteAction,
  deleteNote,
  children,
}: {
  // The records on this page, in order.
  ids: readonly string[];
  noun: { one: string; many: string };
  // The list is showing archived records, which are restored and not archived.
  archived: boolean;
  archiveAction: (ids: string[], archived: boolean) => Promise<void>;
  // Gives how many were kept, because invoices bill them.
  deleteAction: (ids: string[]) => Promise<number>;
  // What goes with the records and what stays, said before they are deleted.
  deleteNote: string;
  children: ReactNode;
}) {
  const [ticked, setTicked] = useState<ReadonlySet<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [kept, setKept] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // Only what is on the page counts: a row that a filter, another page or an action
  // took away is no longer chosen.
  const selected = ids.filter((id) => ticked.has(id));
  const count = `${selected.length} ${selected.length === 1 ? noun.one : noun.many}`;

  function set(changed: readonly string[], on: boolean) {
    setTicked((before) => {
      const next = new Set(before);
      for (const id of changed) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }

  function run(action: () => Promise<unknown>) {
    startTransition(async () => {
      await action();
      setTicked(new Set());
      setConfirming(false);
    });
  }

  function remove() {
    setKept(null);
    run(async () => {
      const count = await deleteAction(selected);
      if (count > 0) {
        setKept(
          `${count} ${count === 1 ? noun.one : noun.many} kept: invoices bill ${count === 1 ? "it" : "them"}, so archive ${count === 1 ? "it" : "them"} instead.`,
        );
      }
    });
  }

  return (
    <SelectionContext value={{ ids, selected, set }}>
      {children}

      {kept && selected.length === 0 && (
        <div className="pointer-events-none fixed inset-x-0 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-40 flex justify-center px-4 md:bottom-6">
          <div
            role="status"
            className="pointer-events-auto flex items-center gap-2 rounded-xl border bg-popover px-3 py-2 text-sm text-popover-foreground shadow-lg"
          >
            <span>{kept}</span>
            <Button variant="ghost" size="sm" onClick={() => setKept(null)}>
              Close
            </Button>
          </div>
        </div>
      )}

      {selected.length > 0 && (
        // Clear of the bar a phone has along its foot.
        <div className="pointer-events-none fixed inset-x-0 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-40 flex justify-center px-4 md:bottom-6">
          <div
            role="region"
            aria-label="Selected rows"
            className="pointer-events-auto flex flex-wrap items-center justify-center gap-2 rounded-xl border bg-popover px-3 py-2 text-sm text-popover-foreground shadow-lg"
          >
            <span className="px-1 font-medium">{selected.length} selected</span>
            <Button
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => run(() => archiveAction(selected, !archived))}
            >
              {archived ? <ArchiveRestore aria-hidden /> : <Archive aria-hidden />}
              {archived ? "Restore" : "Archive"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => setConfirming(true)}
            >
              <Trash2 aria-hidden />
              Delete
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setTicked(new Set())}
            >
              Clear
            </Button>
          </div>
        </div>
      )}

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {count}?</AlertDialogTitle>
            <AlertDialogDescription>{deleteNote}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={pending}
              onClick={remove}
            >
              {pending ? "Deleting…" : `Delete ${count}`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SelectionContext>
  );
}

export function SelectAll() {
  const { ids, selected, set } = use(SelectionContext)!;
  const all = selected.length === ids.length;

  return (
    <label className={CELL}>
      <input
        type="checkbox"
        aria-label="Select all on this page"
        className={CHECKBOX}
        checked={all}
        ref={(box) => {
          if (box) box.indeterminate = selected.length > 0 && !all;
        }}
        onChange={(event) => set(ids, event.target.checked)}
      />
    </label>
  );
}

export function RowCheckbox({ id, name }: { id: string; name: string }) {
  const { selected, set } = use(SelectionContext)!;

  return (
    <label className={CELL}>
      <input
        type="checkbox"
        aria-label={`Select ${name}`}
        className={CHECKBOX}
        checked={selected.includes(id)}
        onChange={(event) => set([id], event.target.checked)}
      />
    </label>
  );
}
