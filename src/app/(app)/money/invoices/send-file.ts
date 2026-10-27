import { MAX_FILE_BYTES } from "@/modules/workflows/drawing";
import { FILE_REFUSALS } from "./labels";

const FAILED = "The file did not go up. Try again.";

// An upload is a request of its own, since a server action takes a megabyte at most.
// Null when it was kept; otherwise what to tell the owner.
export async function sendInvoiceFile(invoiceId: string, file: File) {
  if (file.size > MAX_FILE_BYTES) return FILE_REFUSALS.too_large;
  const body = new FormData();
  body.set("file", file);
  const response = await fetch(`/api/invoices/${invoiceId}/file`, {
    method: "POST",
    body,
  }).catch(() => null);
  if (!response) return FAILED;
  if (response.ok) return null;
  // The hosting turns an oversized request away itself, with no reason given.
  if (response.status === 413) return FILE_REFUSALS.too_large;
  const { reason } = await response.json().catch(() => ({ reason: null }));
  return FILE_REFUSALS[reason as keyof typeof FILE_REFUSALS] ?? FAILED;
}
