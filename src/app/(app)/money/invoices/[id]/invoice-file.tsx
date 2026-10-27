"use client";

import { FileText, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { removeInvoiceFileAction } from "../actions";
import { INVOICE_FILE_ACCEPT, INVOICE_FILE_HINT } from "../labels";
import { sendInvoiceFile } from "../send-file";

// The invoice as exported from Figma: opened in a tab of its own, replaced or removed.
export function InvoiceFile({
  id,
  file,
}: {
  id: string;
  file: { name: string; size: string } | null;
}) {
  const router = useRouter();
  const picker = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function send(chosen: File) {
    setMessage(null);
    startTransition(async () => {
      const refusal = await sendInvoiceFile(id, chosen);
      if (refusal) setMessage(refusal);
      else router.refresh();
    });
  }

  function remove() {
    const formData = new FormData();
    formData.set("id", id);
    startTransition(() => removeInvoiceFileAction(formData));
  }

  return (
    <div className="grid gap-2">
      {file ? (
        <div className="flex min-w-0 items-center gap-2 text-sm">
          <FileText aria-hidden className="size-4 shrink-0 text-muted-foreground" />
          <a
            href={`/api/invoices/${id}/file`}
            target="_blank"
            rel="noopener noreferrer"
            className="min-w-0 truncate font-medium underline-offset-4 hover:underline"
          >
            {file.name}
          </a>
          <span className="shrink-0 text-xs text-muted-foreground">{file.size}</span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7"
            aria-label={`Remove ${file.name}`}
            disabled={pending}
            onClick={remove}
          >
            <X aria-hidden />
          </Button>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No file attached yet.</p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={() => picker.current?.click()}
        >
          {pending ? "Saving…" : file ? "Replace file" : "Attach file"}
        </Button>
        <span className="text-xs text-muted-foreground">{INVOICE_FILE_HINT}</span>
      </div>
      <input
        ref={picker}
        type="file"
        aria-label="Invoice file"
        className="sr-only"
        accept={INVOICE_FILE_ACCEPT}
        onChange={(event) => {
          const [chosen] = event.currentTarget.files ?? [];
          // Emptied, so choosing the same file again is still a change.
          event.currentTarget.value = "";
          if (chosen) send(chosen);
        }}
      />
      {message && (
        <p role="alert" className="text-sm text-destructive">
          {message}
        </p>
      )}
    </div>
  );
}
