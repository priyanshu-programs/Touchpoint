import { X } from "lucide-react";
import { useState } from "react";
import { LinkedText } from "@/components/linked-text";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatDateTime } from "@/lib/time";
import { MAX_NOTE_LENGTH, type BoxNote } from "@/modules/workflows/drawing";
import {
  addNoteAction,
  removeNoteAction,
  type NoteOutcome,
} from "@/app/(app)/workflows/actions";

const FAILED = "That did not go through. Try again.";
const UNSAVED =
  "The drawing has to be saved before anything goes on a box. Reload the page and try again.";

// The whiteboard is only ever drawn in the browser, so its clock is the one meant.
const when = (at: string) =>
  formatDateTime(new Date(at), Intl.DateTimeFormat().resolvedOptions().timeZone);

// The notes left on the selected box, in its card: each as plain text under the
// time it was written, and each can be taken off.
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
          {notes.map(({ id, body, createdAt }) => (
            <li key={id} className="flex items-start gap-1.5">
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted-foreground">
                  <time dateTime={createdAt}>{when(createdAt)}</time>
                </p>
                <p className="break-words whitespace-pre-wrap">
                  <LinkedText text={body} />
                </p>
              </div>
              <button
                type="button"
                aria-label={`Remove the note from ${when(createdAt)}`}
                disabled={busy}
                className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                onClick={() =>
                  run(async () => ({
                    ok: true,
                    notes: await removeNoteAction(boardId, id),
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
            const body = String(new FormData(event.currentTarget).get("body") ?? "");
            // A box drawn a moment ago is not in the stored drawing until it is saved.
            const added = await run(async () =>
              (await stored())
                ? addNoteAction({ boardId, elementId }, body)
                : { ok: false, message: UNSAVED },
            );
            if (added) setWriting(false);
          }}
        >
          <div className="grid gap-1.5">
            <Label htmlFor="note-body">Note</Label>
            <Textarea
              id="note-body"
              name="body"
              required
              autoFocus
              rows={3}
              maxLength={MAX_NOTE_LENGTH}
              className="max-h-40"
            />
          </div>
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
          onClick={() => setWriting(true)}
        >
          Add note
        </Button>
      )}
      {message && (
        <p role="alert" className="text-xs text-destructive">
          {message}
        </p>
      )}
    </div>
  );
}
