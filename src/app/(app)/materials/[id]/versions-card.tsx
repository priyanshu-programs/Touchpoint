"use client";

import { Pencil, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { KindIcon } from "@/app/(board)/workflows/[id]/kind-icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { attachmentKind, MAX_FILE_BYTES } from "@/modules/workflows/drawing";
import {
  addVersionLinkAction,
  removeVersionAction,
  updateVersionAction,
  type VersionOutcome,
} from "../actions";
import { FILE_ACCEPT, FILE_KINDS_HINT, VERSION_REFUSALS } from "../labels";

const FAILED = "That did not go through. Try again.";

const sizeOf = (bytes: number) =>
  bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

export type VersionRow = {
  id: string;
  label: string;
  url: string | null;
  title: string | null;
  size: number | null;
  contentType: string | null;
  // Worked out on the server, in the owner's time zone.
  added: string;
  // How many times it was sent; a version that was is kept as it is.
  sends: number;
};

// A file goes up through a route, since a server action takes a megabyte at most:
// a new version is a POST, a file in place of an unsent version's a PUT.
async function sendFile(address: string, method: "POST" | "PUT", label: string, file: File) {
  if (!label) return { ok: false, message: VERSION_REFUSALS.label } as const;
  if (file.size > MAX_FILE_BYTES) return { ok: false, message: VERSION_REFUSALS.too_large } as const;
  const body = new FormData();
  body.set("label", label);
  body.set("file", file);
  const response = await fetch(address, { method, body });
  if (response.ok) return { ok: true } as const;
  // The hosting turns an oversized request away itself, with no reason given.
  const { reason } =
    response.status === 413
      ? { reason: "too_large" }
      : await response.json().catch(() => ({ reason: null }));
  return {
    ok: false,
    message: VERSION_REFUSALS[reason as keyof typeof VERSION_REFUSALS] ?? FAILED,
  } as const;
}

function FilePicker({
  label,
  busy,
  onFile,
}: {
  label: string;
  busy: boolean;
  onFile: (file: File) => void;
}) {
  const picker = useRef<HTMLInputElement>(null);
  return (
    <>
      <Button
        type="button"
        variant="outline"
        disabled={busy}
        onClick={() => picker.current?.click()}
      >
        {busy ? "Working…" : label}
      </Button>
      <input
        ref={picker}
        type="file"
        aria-label="File to upload"
        className="sr-only"
        accept={FILE_ACCEPT}
        onChange={(event) => {
          const [file] = event.currentTarget.files ?? [];
          // Emptied, so choosing the same file again is still a change.
          event.currentTarget.value = "";
          if (file) onFile(file);
        }}
      />
    </>
  );
}

// The versions of a material, the newest first and marked current. A version
// is a link or an uploaded file, and is edited in place: its label always, what
// it holds only until it is sent.
export function VersionsCard({
  materialId,
  versions,
}: {
  materialId: string;
  versions: VersionRow[];
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const form = useRef<HTMLFormElement>(null);

  const run = async (work: () => Promise<VersionOutcome>) => {
    setBusy(true);
    setMessage(null);
    const outcome = await work().catch(
      (): VersionOutcome => ({ ok: false, message: FAILED }),
    );
    setBusy(false);
    if (outcome.ok) {
      setAdding(false);
      setEditing(null);
      router.refresh();
    } else setMessage(outcome.message);
  };

  const labelIn = (element: HTMLFormElement | null) =>
    String(new FormData(element ?? undefined).get("label") ?? "").trim();

  const close = () => {
    setMessage(null);
    setAdding(false);
    setEditing(null);
  };

  return (
    <Card role="region" aria-labelledby="versions-heading">
      <CardHeader>
        <CardTitle>
          <h2 id="versions-heading">Versions</h2>
        </CardTitle>
        {!adding && (
          <CardAction>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                close();
                setAdding(true);
              }}
            >
              Add version
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="grid gap-4">
        {adding && (
          <form
            ref={form}
            aria-label="Add a version"
            className="grid gap-3 rounded-lg border p-3"
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              void run(() =>
                addVersionLinkAction(materialId, {
                  label: String(data.get("label") ?? ""),
                  url: String(data.get("url") ?? ""),
                }),
              );
            }}
          >
            <div className="grid gap-1.5 sm:max-w-48">
              <Label htmlFor="version-label">Label</Label>
              <Input
                id="version-label"
                name="label"
                required
                autoFocus
                maxLength={100}
                defaultValue={`v${versions.length + 1}`}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="version-url">Link</Label>
              <div className="flex flex-wrap gap-2">
                <Input
                  id="version-url"
                  name="url"
                  maxLength={2000}
                  placeholder="https://"
                  className="min-w-0 flex-1 basis-48"
                />
                <Button type="submit" disabled={busy}>
                  Add link
                </Button>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-muted-foreground">or</span>
              <FilePicker
                label="Upload a file"
                busy={busy}
                onFile={(file) =>
                  void run(() =>
                    sendFile(
                      `/api/materials/${materialId}/versions`,
                      "POST",
                      labelIn(form.current),
                      file,
                    ),
                  )
                }
              />
              <span className="text-xs text-muted-foreground">{FILE_KINDS_HINT}</span>
              <Button type="button" variant="ghost" className="ml-auto" onClick={close}>
                Cancel
              </Button>
            </div>
          </form>
        )}
        {message && (
          <p role="alert" className="text-sm text-destructive">
            {message}
          </p>
        )}

        {versions.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No versions yet. Add a link or upload a file.
          </p>
        ) : (
          <ul className="grid gap-2">
            {versions.map((version, index) =>
              editing === version.id ? (
                <li key={version.id}>
                  <EditVersion
                    materialId={materialId}
                    version={version}
                    busy={busy}
                    run={run}
                    labelIn={labelIn}
                    onCancel={close}
                  />
                </li>
              ) : (
                <li key={version.id} className="flex min-w-0 items-center gap-2 text-sm">
                  <KindIcon
                    kind={attachmentKind(version)}
                    className="size-4 shrink-0 text-muted-foreground"
                  />
                  <div className="grid min-w-0 flex-1">
                    <div className="flex min-w-0 items-center gap-2">
                      <a
                        href={
                          version.url ??
                          `/api/materials/${materialId}/versions/${version.id}`
                        }
                        target="_blank"
                        rel="noopener noreferrer"
                        className="truncate font-medium underline-offset-4 hover:underline"
                      >
                        {version.label}
                      </a>
                      {index === 0 && <Badge variant="secondary">Current</Badge>}
                    </div>
                    <span className="truncate text-xs text-muted-foreground">
                      {[
                        version.title ?? (version.url && new URL(version.url).hostname),
                        version.size !== null && sizeOf(version.size),
                        version.added,
                        version.sends > 0 &&
                          `sent ${version.sends === 1 ? "once" : `${version.sends} times`}`,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    aria-label={`Edit ${version.label}`}
                    onClick={() => {
                      close();
                      setEditing(version.id);
                    }}
                  >
                    <Pencil aria-hidden />
                  </Button>
                  {version.sends === 0 && (
                    <form action={removeVersionAction}>
                      <input type="hidden" name="materialId" value={materialId} />
                      <input type="hidden" name="versionId" value={version.id} />
                      <Button
                        type="submit"
                        variant="ghost"
                        size="icon"
                        className="size-7"
                        aria-label={`Remove ${version.label}`}
                      >
                        <X aria-hidden />
                      </Button>
                    </form>
                  )}
                </li>
              ),
            )}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

// A version's label, and, until it is sent, a link or a file in place of what it holds.
function EditVersion({
  materialId,
  version,
  busy,
  run,
  labelIn,
  onCancel,
}: {
  materialId: string;
  version: VersionRow;
  busy: boolean;
  run: (work: () => Promise<VersionOutcome>) => Promise<void>;
  labelIn: (element: HTMLFormElement | null) => string;
  onCancel: () => void;
}) {
  const form = useRef<HTMLFormElement>(null);
  const sent = version.sends > 0;
  const field = (name: string) => `version-${version.id}-${name}`;

  return (
    <form
      ref={form}
      aria-label={`Edit ${version.label}`}
      className="grid gap-3 rounded-lg border p-3"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        void run(() =>
          updateVersionAction(materialId, version.id, {
            label: String(data.get("label") ?? ""),
            url: String(data.get("url") ?? ""),
          }),
        );
      }}
    >
      <div className="grid gap-1.5 sm:max-w-48">
        <Label htmlFor={field("label")}>Label</Label>
        <Input
          id={field("label")}
          name="label"
          required
          autoFocus
          maxLength={100}
          defaultValue={version.label}
        />
      </div>
      {sent ? (
        <p className="text-sm text-muted-foreground">
          Sent, so what it holds stays. Add a new version to change it.
        </p>
      ) : (
        <>
          <div className="grid gap-1.5">
            <Label htmlFor={field("url")}>Link</Label>
            <Input
              id={field("url")}
              name="url"
              maxLength={2000}
              placeholder="https://"
              defaultValue={version.url ?? ""}
            />
            {version.title && (
              <p className="text-xs text-muted-foreground">
                Holds {version.title}. Give a link to put in its place, or upload another file.
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <FilePicker
              label={version.title ? "Replace the file" : "Replace with a file"}
              busy={busy}
              onFile={(file) =>
                void run(() =>
                  sendFile(
                    `/api/materials/${materialId}/versions/${version.id}`,
                    "PUT",
                    labelIn(form.current),
                    file,
                  ),
                )
              }
            />
            <span className="text-xs text-muted-foreground">{FILE_KINDS_HINT}</span>
          </div>
        </>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy}>
          Save
        </Button>
      </div>
    </form>
  );
}
