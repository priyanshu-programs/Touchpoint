import { Pencil, X } from "lucide-react";
import { useState } from "react";
import { LinkedText } from "@/components/linked-text";
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
import {
  addNoteAction,
  editNoteAction,
  removeNoteAction,
  type NoteOutcome,
} from "@/app/(app)/workflows/actions";
import { NoteEditor, type NoteDraft } from "./note-editor";

const FAILED = "That did not go through. Try again.";
const EMPTY: NoteDraft = { body: "", marks: [] };
const UNSAVED =
  "The drawing has to be saved before anything goes on a box. Reload the page and try again.";

// The whiteboard is only ever drawn in the browser, so its clock is the one meant.
const when = (at: string) =>
  formatDateTime(new Date(at), Intl.DateTimeFormat().resolvedOptions().timeZone);

// The notes left on the selected box, in its card: each as one line of plain text
// under the time it was written, opening whole, formatted and to be edited, in a
// side panel, and each can be taken off.
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
  const [editing, setEditing] = useState<NoteDraft | null>(null);
  // Read from the notes, so the panel shows a note as last saved and closes if it goes.
  const open = notes.find(({ id }) => id === openId) ?? null;

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
                  onClick={() => {
                    setMessage(null);
                    setEditing(null);
                    setOpenId(note.id);
                  }}
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
          if (next) return;
          setOpenId(null);
          setEditing(null);
          setMessage(null);
        }}
      >
        <SheetContent className="gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-md">
          <SheetHeader className="pr-12">
            <SheetTitle>Note</SheetTitle>
            <SheetDescription>
              {open && <time dateTime={open.createdAt}>{when(open.createdAt)}</time>}
            </SheetDescription>
          </SheetHeader>
          {open && editing ? (
            <form
              aria-label="Edit the note"
              className="grid min-h-0 flex-1 content-start gap-2 overflow-y-auto px-4 pb-4"
              onSubmit={async (event) => {
                event.preventDefault();
                const saved = await run(() => editNoteAction(boardId, open.id, editing));
                if (saved) setEditing(null);
              }}
            >
              <NoteEditor initial={open} onChange={setEditing} autoFocus />
              <div className="flex gap-1.5">
                <Button type="submit" size="sm" disabled={busy}>
                  Save
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(null)}>
                  Cancel
                </Button>
              </div>
            </form>
          ) : (
            open && (
              <div className="grid min-h-0 flex-1 content-start gap-3 overflow-y-auto px-4 pb-4">
                <p className="break-words whitespace-pre-wrap">
                  <LinkedText text={open.body} marks={open.marks} />
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  className="justify-self-start"
                  onClick={() => {
                    setMessage(null);
                    setEditing({ body: open.body, marks: open.marks });
                  }}
                >
                  <Pencil aria-hidden />
                  Edit
                </Button>
              </div>
            )
          )}
          {message && open && (
            <p role="alert" className="px-4 pb-4 text-xs text-destructive">
              {message}
            </p>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
