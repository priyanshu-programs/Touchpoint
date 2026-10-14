import { FileText, Link2, X } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  MAX_FILE_BYTES,
  type BoxAttachment,
} from "@/modules/workflows/drawing";
import {
  addBoxLinkAction,
  removeAttachmentAction,
  type AttachOutcome,
} from "@/app/(app)/workflows/actions";
import { ATTACH_REFUSALS } from "@/app/(app)/workflows/attach-messages";

const FAILED = "That did not go through. Try again.";
const UNSAVED =
  "The drawing has to be saved before anything goes on a box. Reload the page and try again.";

const sizeOf = (bytes: number) =>
  bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

// The links and files the selected box carries, in its card: each opens in a
// tab of its own, and a link or a file can be added or taken off. The kinds of
// file listed for the picker are a convenience; the server reads the kind from
// the file itself.
export function BoxAttachments({
  boardId,
  elementId,
  attachments,
  stored,
  onChange,
}: {
  boardId: string;
  elementId: string;
  // What this box carries.
  attachments: readonly BoxAttachment[];
  // Saves the drawing, and says whether the stored one now has this box.
  stored: () => Promise<boolean>;
  // Given everything the board carries after a change.
  onChange: (all: BoxAttachment[]) => void;
}) {
  const [linking, setLinking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const picker = useRef<HTMLInputElement>(null);

  const run = async (work: () => Promise<AttachOutcome>) => {
    setBusy(true);
    setMessage(null);
    const outcome = await work().catch(
      (): AttachOutcome => ({ ok: false, message: FAILED }),
    );
    setBusy(false);
    if (outcome.ok) onChange(outcome.attachments);
    else setMessage(outcome.message);
    return outcome.ok;
  };

  // A box drawn a moment ago is not in the stored drawing until it is saved.
  const add = (work: () => Promise<AttachOutcome>) =>
    run(async () =>
      (await stored()) ? work() : { ok: false, message: UNSAVED },
    );

  const upload = (file: File) =>
    add(async () => {
      if (file.size > MAX_FILE_BYTES) {
        return { ok: false, message: ATTACH_REFUSALS.too_large };
      }
      const body = new FormData();
      body.set("elementId", elementId);
      body.set("file", file);
      const response = await fetch(`/api/workflows/${boardId}/attachments`, {
        method: "POST",
        body,
      });
      if (response.ok) return { ok: true, ...(await response.json()) };
      // The hosting turns an oversized request away itself, with no reason given.
      const { reason } =
        response.status === 413
          ? { reason: "too_large" }
          : await response.json().catch(() => ({ reason: null }));
      return {
        ok: false,
        message:
          ATTACH_REFUSALS[reason as keyof typeof ATTACH_REFUSALS] ?? FAILED,
      };
    });

  return (
    <div className="grid min-w-0 gap-2 border-t pt-2">
      <h2 className="font-medium">Links and files</h2>
      {attachments.length > 0 && (
        <ul className="flex max-h-40 flex-col gap-1 overflow-y-auto">
          {attachments.map(({ id, title, url, size }) => (
            <li key={id} className="flex items-center gap-1.5">
              {url ? (
                <Link2 aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
              ) : (
                <FileText
                  aria-hidden
                  className="size-3.5 shrink-0 text-muted-foreground"
                />
              )}
              <a
                href={url ?? `/api/workflows/${boardId}/attachments/${id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="min-w-0 flex-1 truncate underline-offset-2 hover:underline"
              >
                {title}
              </a>
              {size !== null && (
                <span className="shrink-0 text-xs text-muted-foreground">
                  {sizeOf(size)}
                </span>
              )}
              <button
                type="button"
                aria-label={`Remove ${title}`}
                disabled={busy}
                className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                onClick={() =>
                  run(async () => ({
                    ok: true,
                    attachments: await removeAttachmentAction(boardId, id),
                  }))
                }
              >
                <X aria-hidden className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {linking ? (
        <form
          aria-label="Add a link"
          className="grid gap-2"
          onSubmit={async (event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const link = {
              url: String(form.get("url") ?? ""),
              title: String(form.get("title") ?? ""),
            };
            const added = await add(() =>
              addBoxLinkAction({ boardId, elementId }, link),
            );
            if (added) setLinking(false);
          }}
        >
          <div className="grid gap-1.5">
            <Label htmlFor="link-url">Address</Label>
            <Input
              id="link-url"
              name="url"
              required
              autoFocus
              maxLength={2000}
              placeholder="https://"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="link-title">Name (optional)</Label>
            <Input id="link-title" name="title" maxLength={200} />
          </div>
          <div className="flex gap-1.5">
            <Button type="submit" size="sm" disabled={busy}>
              Add
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setLinking(false)}
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <div className="flex gap-1.5">
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => setLinking(true)}
          >
            Add link
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => picker.current?.click()}
          >
            {busy ? "Working…" : "Add file"}
          </Button>
          <input
            ref={picker}
            type="file"
            aria-label="File to add"
            className="sr-only"
            accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.docx,.xlsx,.pptx"
            onChange={(event) => {
              const [file] = event.currentTarget.files ?? [];
              // Emptied, so choosing the same file again is still a change.
              event.currentTarget.value = "";
              if (file) void upload(file);
            }}
          />
        </div>
      )}
      {message && (
        <p role="alert" className="text-xs text-destructive">
          {message}
        </p>
      )}
    </div>
  );
}
