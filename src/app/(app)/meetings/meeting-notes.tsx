"use client";

import { X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { KindIcon } from "@/app/(board)/workflows/[id]/kind-icons";
import { FILE_ACCEPT, FILE_KINDS_HINT } from "@/app/(app)/materials/labels";
import { NoteEditor, type NoteDraft } from "@/components/note-editor";
import { Button } from "@/components/ui/button";
import {
  MAX_MEETING_FILES,
  MAX_MEETING_NOTE,
} from "@/modules/activities/meeting-notes-schema";
import type { ActivityFile } from "@/modules/integrations/meetings";
import { attachmentKind, MAX_FILE_BYTES } from "@/modules/workflows/drawing";
import { tidyMarks, trimNote } from "@/modules/workflows/note-marks";
import { removeMeetingFileAction, saveMeetingNotesAction } from "./actions";

const FAILED = "That did not go through. Try again.";
const LEAVE = "Discard your changes to these notes?";

const FILE_REFUSALS = {
  too_large: "That file is larger than 4 MB.",
  kind: "Only PDFs, pictures and Word, Excel and PowerPoint files are kept.",
  full: "Your 200 MB of file storage is used up. Remove a file you no longer need first.",
  rate: "Too many uploads in a minute. Try again shortly.",
  limit: `A meeting holds at most ${MAX_MEETING_FILES} files. Remove one you no longer need first.`,
} as const;

const sizeOf = (bytes: number) =>
  bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

// Compared as they would be stored: the spaces around the words don't count as a change.
const key = (draft: NoteDraft) => {
  const { body, marks } = trimNote(draft.body, draft.marks);
  return JSON.stringify([body, tidyMarks(marks, body.length)]);
};

// While the notes hold a change, leaving the page by a link or closing the tab asks first.
function useLeaveGuard(changed: boolean) {
  useEffect(() => {
    if (!changed) return;
    const onClick = (event: MouseEvent) => {
      const link = (event.target as Element | null)?.closest?.("a[href]");
      if (!link || link.getAttribute("target") === "_blank") return;
      if (window.confirm(LEAVE)) return;
      event.preventDefault();
      event.stopPropagation();
    };
    const onUnload = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("click", onClick, true);
    window.addEventListener("beforeunload", onUnload);
    return () => {
      window.removeEventListener("click", onClick, true);
      window.removeEventListener("beforeunload", onUnload);
    };
  }, [changed]);
}

// What the owner writes and keeps inside a meeting: formatted notes, edited where they
// are read, and files. Both are kept on the meeting's activity, made by the first save.
export function MeetingNotes({
  eventId,
  notes,
}: {
  eventId: string;
  notes: { id: string; body: string | null; marks: NoteDraft["marks"]; files: ActivityFile[] } | null;
}) {
  const router = useRouter();
  const [saved, setSaved] = useState<NoteDraft>({
    body: notes?.body ?? "",
    marks: notes?.marks ?? [],
  });
  const [draft, setDraft] = useState<NoteDraft>(saved);
  // Bumped to put the saved notes back in the editor.
  const [resets, setResets] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const changed = key(draft) !== key(saved);
  useLeaveGuard(changed);

  return (
    <div className="grid gap-6 border-t pt-4">
      <section aria-labelledby="meeting-notes" className="grid gap-2">
        <h2 id="meeting-notes" className="font-medium">
          Notes
        </h2>
        <form
          aria-label="Meeting notes"
          className="grid gap-2"
          onSubmit={async (event) => {
            event.preventDefault();
            setBusy(true);
            setMessage(null);
            const outcome = await saveMeetingNotesAction({ eventId, ...draft }).catch(
              () => ({ ok: false, message: FAILED }) as const,
            );
            setBusy(false);
            if (!outcome.ok) return setMessage(outcome.message);
            setSaved(trimNote(draft.body, draft.marks));
            setStatus("Notes saved.");
            router.refresh();
          }}
        >
          {/* Escape inside the notes stays in them and doesn't close the panel. */}
          <div data-inline-editor>
            <NoteEditor
              key={resets}
              initial={saved}
              onChange={(next) => {
                setDraft(next);
                setStatus(null);
              }}
              max={MAX_MEETING_NOTE}
              label="Meeting notes"
              fill
            />
          </div>
          {changed && (
            <div className="flex gap-1.5">
              <Button type="submit" size="sm" disabled={busy}>
                Save
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  setDraft(saved);
                  setMessage(null);
                  setResets((count) => count + 1);
                }}
              >
                Cancel
              </Button>
            </div>
          )}
          {message && (
            <p role="alert" className="text-xs text-destructive">
              {message}
            </p>
          )}
          <p role="status" className="text-xs text-muted-foreground empty:hidden">
            {status}
          </p>
        </form>
      </section>
      <MeetingFiles
        eventId={eventId}
        activityId={notes?.id ?? null}
        files={notes?.files ?? []}
      />
    </div>
  );
}

function MeetingFiles({
  eventId,
  activityId,
  files,
}: {
  eventId: string;
  activityId: string | null;
  files: ActivityFile[];
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const send = async (file: File) => {
    if (file.size > MAX_FILE_BYTES) return setMessage(FILE_REFUSALS.too_large);
    setBusy(true);
    setUploading(true);
    setMessage(null);
    const body = new FormData();
    body.set("file", file);
    const response = await fetch(`/api/meetings/${eventId}/files`, { method: "POST", body }).catch(
      () => null,
    );
    if (response?.ok) {
      router.refresh();
    } else {
      // The hosting turns an oversized request away itself, with no reason given.
      const { reason } =
        response?.status === 413
          ? { reason: "too_large" }
          : await (response?.json() ?? Promise.resolve({ reason: null })).catch(() => ({
              reason: null,
            }));
      setMessage(FILE_REFUSALS[reason as keyof typeof FILE_REFUSALS] ?? FAILED);
    }
    setBusy(false);
    setUploading(false);
  };

  return (
    <section aria-labelledby="meeting-files" className="grid gap-2">
      <h2 id="meeting-files" className="font-medium">
        Files
      </h2>
      {files.length > 0 && activityId && (
        <ul className="grid gap-2">
          {files.map((file) => (
            <li key={file.id} className="flex min-w-0 items-center gap-2">
              <KindIcon
                kind={attachmentKind({ url: null, contentType: file.contentType })}
                className="size-4 shrink-0 text-muted-foreground"
              />
              <a
                href={`/api/activities/${activityId}/files/${file.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="min-w-0 truncate font-medium underline-offset-4 hover:underline"
              >
                {file.title}
              </a>
              <span className="shrink-0 text-xs text-muted-foreground">{sizeOf(file.size)}</span>
              <button
                type="button"
                aria-label={`Remove ${file.title}`}
                disabled={busy}
                className="ml-auto shrink-0 rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                onClick={async () => {
                  setBusy(true);
                  setMessage(null);
                  await removeMeetingFileAction(eventId, file.id).catch(() =>
                    setMessage(FAILED),
                  );
                  setBusy(false);
                  router.refresh();
                }}
              >
                <X aria-hidden className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <input
        ref={input}
        type="file"
        accept={FILE_ACCEPT}
        className="sr-only"
        tabIndex={-1}
        aria-label="Choose a file"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = "";
          if (file) void send(file);
        }}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => input.current?.click()}
        >
          {uploading ? "Uploading…" : "Add file"}
        </Button>
        <span className="text-xs text-muted-foreground">{FILE_KINDS_HINT}</span>
      </div>
      {message && (
        <p role="alert" className="text-xs text-destructive">
          {message}
        </p>
      )}
    </section>
  );
}
