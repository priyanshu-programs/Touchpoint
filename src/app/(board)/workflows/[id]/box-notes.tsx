import { X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { formatDateTime } from "@/lib/time";
import type { BoxNote } from "@/modules/workflows/drawing";
import { tidyMarks } from "@/modules/workflows/note-marks";
import {
  addNoteAction,
  editNoteAction,
  removeNoteAction,
  type NoteOutcome,
} from "@/app/(app)/workflows/actions";
import { NoteEditor, type NoteDraft } from "@/components/note-editor";

const FAILED = "That did not go through. Try again.";
const EMPTY: NoteDraft = { body: "", marks: [] };
const UNSAVED =
  "The drawing has to be saved before anything goes on a box. Reload the page and try again.";

const tidy = ({ body, marks }: NoteDraft) => JSON.stringify(tidyMarks(marks, body.length));
const same = (a: NoteDraft, b: NoteDraft) => a.body === b.body && tidy(a) === tidy(b);

// The whiteboard is only ever drawn in the browser, so its clock is the one meant.
const when = (at: string) =>
  formatDateTime(new Date(at), Intl.DateTimeFormat().resolvedOptions().timeZone);

// The notes left on the selected box, in its card: each as one line of plain text
// under the time it was written, opening whole and formatted in a side panel where
// it is edited as it stands, and each can be taken off.
export function BoxNotes({
  boardId,
  elementId,
  notes,
  stored,
  onChange,
}: {
  boardId: string;
  elementId: string;
  // The notes on this box.
  notes: readonly BoxNote[];
  // Saves the drawing, and says whether the stored one now has this box.
  stored: () => Promise<boolean>;
  // Given every note on the board after a change.
  onChange: (all: BoxNote[]) => void;
}) {
  const [writing, setWriting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [draft, setDraft] = useState<NoteDraft>(EMPTY);
  const [openId, setOpenId] = useState<string | null>(null);
  // The panel's note as changed and not yet saved.
  const [edited, setEdited] = useState<NoteDraft | null>(null);
  // Bumped to put the saved note back in the panel's editor.
  const [resets, setResets] = useState(0);
  // Where the panel was asked to go (another note, or shut) while it held changes.
  const [leaving, setLeaving] = useState<{ to: string | null } | null>(null);
  // Read from the notes, so the panel shows a note as last saved and closes if it goes.
  const open = notes.find(({ id }) => id === openId) ?? null;
  const changed = open !== null && edited !== null && !same(edited, open);

  const show = (to: string | null) => {
    setOpenId(to);
    setEdited(null);
    setLeaving(null);
    setMessage(null);
    setResets((count) => count + 1);
  };
  const go = (to: string | null) => (changed ? setLeaving({ to }) : show(to));

  const run = async (work: () => Promise<NoteOutcome>) => {
    setBusy(true);
    setMessage(null);
    const outcome = await work().catch(
      (): NoteOutcome => ({ ok: false, message: FAILED }),
    );
    setBusy(false);
    if (outcome.ok) onChange(outcome.notes);
    else setMessage(outcome.message);
    return outcome.ok;
  };

  return (
    <div className="grid min-w-0 gap-2 border-t pt-2">
      <h2 className="font-medium">Notes</h2>
      {notes.length > 0 && (
        <ul className="flex max-h-40 flex-col gap-2 overflow-y-auto">
          {notes.map((note) => (
            <li key={note.id} className="flex items-start gap-1.5">
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted-foreground">
                  <time dateTime={note.createdAt}>{when(note.createdAt)}</time>
                </p>
                {/* Plain text: a link can't sit inside a button, so links show in the panel. */}
                <button
                  type="button"
                  aria-haspopup="dialog"
                  className="block w-full truncate rounded text-left hover:bg-accent"
                  onClick={() => go(note.id)}
                >
                  {note.body}
                </button>
              </div>
              <button
                type="button"
                aria-label={`Remove the note from ${when(note.createdAt)}`}
                disabled={busy}
                className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                onClick={() =>
                  run(async () => ({
                    ok: true,
                    notes: await removeNoteAction(boardId, note.id),
                  }))
                }
              >
                <X aria-hidden className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {writing ? (
        <form
          aria-label="Add a note"
          className="grid gap-2"
          onSubmit={async (event) => {
            event.preventDefault();
            // A box drawn a moment ago is not in the stored drawing until it is saved.
            const added = await run(async () =>
              (await stored())
                ? addNoteAction({ boardId, elementId }, draft)
                : { ok: false, message: UNSAVED },
            );
            if (added) setWriting(false);
          }}
        >
          <NoteEditor initial={EMPTY} onChange={setDraft} autoFocus />
          <div className="flex gap-1.5">
            <Button type="submit" size="sm" disabled={busy}>
              Add
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setWriting(false)}
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <Button
          size="sm"
          variant="outline"
          className="justify-self-start"
          disabled={busy}
          onClick={() => {
            setDraft(EMPTY);
            setWriting(true);
          }}
        >
          Add note
        </Button>
      )}
      {message && !open && (
        <p role="alert" className="text-xs text-destructive">
          {message}
        </p>
      )}
      <Sheet
        open={open !== null}
        onOpenChange={(next) => {
          if (!next) go(null);
        }}
      >
        <SheetContent className="gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-md">
          <SheetHeader className="pr-12">
            <SheetTitle>Note</SheetTitle>
            <SheetDescription>
              {open && <time dateTime={open.createdAt}>{when(open.createdAt)}</time>}
            </SheetDescription>
          </SheetHeader>
          {open && (
            <form
              aria-label="Edit the note"
              className="flex min-h-0 flex-1 flex-col"
              onSubmit={async (event) => {
                event.preventDefault();
                if (!edited) return;
                const saved = await run(() => editNoteAction(boardId, open.id, edited));
                if (saved) show(open.id);
              }}
            >
              <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
                <NoteEditor key={`${open.id}-${resets}`} initial={open} onChange={setEdited} fill />
              </div>
              {(changed || message) && (
                <div className="grid gap-2 border-t px-4 py-3">
                  {message && (
                    <p role="alert" className="text-xs text-destructive">
                      {message}
                    </p>
                  )}
                  {leaving ? (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className="mr-auto text-sm">Discard your changes to this note?</p>
                      <Button
                        type="button"
                        size="sm"
                        variant="destructive"
                        onClick={() => show(leaving.to)}
                      >
                        Discard
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => setLeaving(null)}
                      >
                        Keep editing
                      </Button>
                    </div>
                  ) : (
                    changed && (
                      <div className="flex gap-1.5">
                        <Button type="submit" size="sm" disabled={busy}>
                          Save
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => show(open.id)}
                        >
                          Cancel
                        </Button>
                      </div>
                    )
                  )}
                </div>
              )}
            </form>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
